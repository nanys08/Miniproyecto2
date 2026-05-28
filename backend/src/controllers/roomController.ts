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
import * as messageService from "../services/messageService";
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
    const { name, accessCode } = req.body ?? {};

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

    const code = typeof accessCode === "string" ? accessCode : undefined;
    const room = await roomService.createRoom(uid, trimmedName, code);
    res.status(201).json({ room });
  } catch (err) {
    sendError(res, err, "createRoom");
  }
};

/**
 * **GET /api/rooms/join/:code** — Busca una sala por su código de acceso.
 *
 * Usado por el flujo "Unirme a sala". Devuelve la sala para que el frontend
 * pueda redirigir a `/room/{roomId}`.
 *
 * @param req Path param `code`.
 * @param res 200 con `{ room }`, 404 `ROOM_NOT_FOUND` si el código no existe.
 */
export const joinRoomByCode = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { code } = req.params as { code: string };
    if (!code || !code.trim()) {
      res.status(400).json(buildError(ErrorCode.ROOM_CODE_INVALID));
      return;
    }
    const room = await roomService.getRoomByAccessCode(code);
    if (!room) {
      res.status(404).json(buildError(ErrorCode.ROOM_NOT_FOUND));
      return;
    }
    res.json({ room });
  } catch (err) {
    sendError(res, err, "joinRoomByCode");
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

    // Borrar mensajes (subcolección) antes que el doc raíz. Si Firestore
    // falla en el borrado masivo, no eliminamos la sala — así el usuario
    // puede reintentar; los mensajes huérfanos serían inalcanzables si lo
    // hiciéramos al revés.
    await messageService.deleteRoomMessages(roomId);
    await roomService.deleteRoom(roomId);
    res.status(204).send();
  } catch (err) {
    sendError(res, err, "deleteRoom");
  }
};

/**
 * **GET /api/rooms/:roomId/messages** — Devuelve el historial de la sala.
 *
 * Pensado para que el frontend cargue mensajes anteriores al montar la
 * vista de sala. El socket sigue siendo la única fuente de mensajes en
 * vivo; este endpoint solo cubre la carga inicial / reconexión.
 *
 * Reglas:
 *  - Solo el dueño o un participante pueden leer el historial.
 *  - Respuesta ordenada cronológicamente (más antiguo → más nuevo).
 *  - Query param opcional `limit` (1..200, default 50).
 *
 * @param req  Path param `roomId`, query opcional `limit`.
 * @param res  200 `{ messages }`, 403 si no es miembro, 404 si no existe.
 */
export const getRoomHistory = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { uid } = req.user!;
    const { roomId } = req.params as { roomId: string };

    const room = await roomService.getRoomById(roomId);
    if (!room) {
      res.status(404).json(buildError(ErrorCode.ROOM_NOT_FOUND));
      return;
    }

    const isOwner = room.ownerId === uid;
    const isParticipant = Array.isArray(room.participants) && room.participants.includes(uid);
    if (!isOwner && !isParticipant) {
      res.status(403).json(
        buildError(ErrorCode.INTERNAL_ERROR, "No eres miembro de esta sala")
      );
      return;
    }

    // Parse + clamp del query param `limit` (req.query puede no existir en
    // tests o si Express no lo pobló — defensa explícita).
    const limitParam = (req.query?.["limit"] ?? undefined) as
      | string
      | undefined;
    const rawLimit = limitParam !== undefined ? Number(limitParam) : NaN;
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : undefined;

    const messages = await messageService.getRoomMessages(roomId, limit);
    res.json({ messages });
  } catch (err) {
    sendError(res, err, "getRoomHistory");
  }
};
