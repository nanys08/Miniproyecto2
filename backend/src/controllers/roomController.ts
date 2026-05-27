/**
 * @file roomController — Handlers HTTP de la API `/api/rooms/*`.
 *
 * Responsabilidades:
 *  - Validar el shape del body antes de llamar al service.
 *  - Mapear errores del service a códigos HTTP estables.
 *  - Nunca filtrar detalles internos de Firestore al cliente.
 *
 * Convenciones:
 *  - Todas las rutas requieren `verifyToken` → `req.user` siempre existe.
 *  - Nombre de sala: string, no vacío, máximo 100 caracteres.
 */

import { Response } from "express";
import { AuthRequest } from "../middlewares/authMiddleware";
import * as roomService from "../services/roomService";
import { AppError, ErrorCode, buildError } from "../utils/errors";
import { logger } from "../utils/logger";

/** Longitud máxima permitida para el nombre de una sala. */
const ROOM_NAME_MAX_LENGTH = 100;

/**
 * Centraliza el envío de errores. `AppError` se devuelve tal cual;
 * cualquier otra excepción se loggea internamente y devuelve INTERNAL_ERROR.
 */
const sendError = (res: Response, err: unknown, context: string): void => {
  if (err instanceof AppError) {
    res.status(err.status).json(buildError(err.code, err.message));
    return;
  }
  logger.error(`[${context}] error interno`, err);
  res.status(500).json(buildError(ErrorCode.INTERNAL_ERROR));
};

/**
 * **POST /api/rooms** — Crea una nueva sala de estudio.
 *
 * Requiere `Authorization: Bearer <firebase_id_token>`.
 *
 * Validaciones:
 *   1. `ROOM_NAME_INVALID` si `name` falta, está vacío o supera 100 chars.
 *
 * @param req Body: `{ name: string }`.
 * @param res 201 con `{ room }`, o error apropiado.
 */
export const createRoom = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { uid } = req.user!;
    const { name } = req.body ?? {};

    // Validar nombre obligatorio
    if (
      !name ||
      typeof name !== "string" ||
      !name.trim()
    ) {
      res.status(400).json(buildError(ErrorCode.ROOM_NAME_INVALID));
      return;
    }

    const trimmedName = name.trim();

    if (trimmedName.length > ROOM_NAME_MAX_LENGTH) {
      res.status(400).json(
        buildError(
          ErrorCode.ROOM_NAME_INVALID,
          `El nombre no puede superar ${ROOM_NAME_MAX_LENGTH} caracteres`
        )
      );
      return;
    }

    const room = await roomService.createRoom(uid, trimmedName);
    res.status(201).json({ room });
  } catch (err) {
    sendError(res, err, "createRoom");
  }
};

/**
 * **GET /api/rooms** — Devuelve las salas del usuario autenticado.
 *
 * Incluye:
 *  - Salas creadas por el usuario (`ownerId == uid`).
 *
 * Ordenadas de más reciente a más antigua.
 *
 * @param req Requiere `req.user.uid`.
 * @param res 200 con `{ rooms: Room[] }`.
 */
export const getRooms = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { uid } = req.user!;
    const rooms = await roomService.getRoomsByUser(uid);
    res.json({ rooms });
  } catch (err) {
    sendError(res, err, "getRooms");
  }
};

/**
 * **GET /api/rooms/:roomId** — Devuelve una sala específica.
 *
 * Cualquier usuario autenticado puede leer una sala por su ID
 * (necesario para unirse a salas compartidas por link).
 *
 * @param req Path param `roomId`.
 * @param res 200 con `{ room }`, 404 si no existe.
 */
export const getRoomById = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { roomId } = req.params as { roomId: string };
    const room = await roomService.getRoomById(roomId);
    if (!room) {
      res.status(404).json(buildError(ErrorCode.ROOM_NOT_FOUND));
      return;
    }
    res.json({ room });
  } catch (err) {
    sendError(res, err, "getRoomById");
  }
};

/**
 * **DELETE /api/rooms/:roomId** — Elimina una sala.
 *
 * Solo el dueño (`ownerId`) puede eliminar la sala.
 *
 * @param req Path param `roomId`.
 * @param res 204 sin body, 403 si no es el dueño, 404 si no existe.
 */
export const deleteRoom = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { uid } = req.user!;
    const { roomId } = req.params as { roomId: string };

    // Verificar existencia y propiedad antes de eliminar
    const room = await roomService.getRoomById(roomId);
    if (!room) {
      res.status(404).json(buildError(ErrorCode.ROOM_NOT_FOUND));
      return;
    }
    if (room.ownerId !== uid) {
      res.status(403).json(
        buildError(ErrorCode.INTERNAL_ERROR, "Solo el dueño puede eliminar esta sala")
      );
      return;
    }

    await roomService.deleteRoom(roomId);
    res.status(204).send();
  } catch (err) {
    sendError(res, err, "deleteRoom");
  }
};
