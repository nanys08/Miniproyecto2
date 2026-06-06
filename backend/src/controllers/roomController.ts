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
import * as authService from "../services/authService";
import * as chatNotifier from "../services/chatNotifier";
import { issueChatTicket } from "../services/chatTicket";
import { AppError, ErrorCode, buildError, mapFirestoreError } from "../utils/errors";
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
  const mapped = mapFirestoreError(err);
  if (mapped) {
    logger.warn(`[${context}] Firestore error mapeado`, err);
    res.status(mapped.status).json(buildError(mapped.code, mapped.message));
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
    const { name, accessCode, description } = req.body ?? {};

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
    const desc = typeof description === "string" ? description : undefined;
    const room = await roomService.createRoom(uid, trimmedName, code, desc);
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
 * **POST /api/rooms/join** — Une al usuario a una sala por su código (US-08).
 *
 * Variante POST del flujo "Unirme a sala": el código viaja en el body
 * (`{ code }`) en vez de la URL. Devuelve la sala para que el frontend
 * redirija a `/room/{roomId}`.
 *
 * @param req Body: `{ code: string }`.
 * @param res 200 con `{ room }`, 400 si falta el código, 404 si no existe.
 */
export const joinRoom = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { code } = (req.body ?? {}) as { code?: string };
    if (!code || typeof code !== "string" || !code.trim()) {
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
    sendError(res, err, "joinRoom");
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
 * **POST /api/rooms/:roomId/enter** — Verifica la sala e informa al WebSocket.
 *
 * Implementa el flujo "usuario entra" de la Tarea 5:
 *   1. Valida que la sala existe (`ROOM_NOT_FOUND` si no).
 *   2. Añade al usuario a `participants` si aún no lo era (idempotente).
 *   3. Informa al chat-service (Repositorio 2) que la sala está activa, para
 *      que acepte el handshake WebSocket del usuario (best-effort).
 *   4. Devuelve `{ roomId, roomName }` para que el frontend abra el WebSocket.
 *
 * @param req Path param `roomId`.
 * @param res 200 con `{ roomId, roomName }`, 404 si la sala no existe.
 */
export const enterRoom = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { uid } = req.user!;
    const { roomId } = req.params as { roomId: string };

    // 1. Validar la sala
    const room = await roomService.getRoomById(roomId);
    if (!room) {
      res.status(404).json(buildError(ErrorCode.ROOM_NOT_FOUND));
      return;
    }

    // 2. Asegurar membresía (idempotente vía arrayUnion)
    const isMember =
      room.ownerId === uid ||
      (Array.isArray(room.participants) && room.participants.includes(uid));
    if (!isMember) {
      await roomService.addParticipant(roomId, uid);
    }

    // 3. Informar al WebSocket (no bloquea la respuesta si el chat-service
    //    está caído — chatNotifier es best-effort).
    const profile = await authService
      .getUserProfile(uid)
      .catch(() => null);
    const username = profile?.username;
    await chatNotifier.notifyUserJoined({
      roomId,
      roomName: room.name,
      uid,
      username,
    });

    // 4. Emitir el ticket de autenticación coordinada (Tarea 10). El frontend
    //    lo pasa en el handshake del WebSocket: `io(url, { auth: { ticket } })`.
    //    Es `null` si el chat-service corre sin secreto (modo desarrollo).
    const chatTicket = username
      ? issueChatTicket({ roomId, username, uid })
      : null;

    // 5. Datos para que el frontend abra el WebSocket contra el chat-service.
    res.json({ roomId: room.roomId, roomName: room.name, username, chatTicket });
  } catch (err) {
    sendError(res, err, "enterRoom");
  }
};

/**
 * **PUT /api/rooms/:roomId** — Edita el nombre de una sala (US-07).
 *
 * Solo el dueño (`ownerId`) puede editar. Un participante no creador recibe
 * 403 `FORBIDDEN` ("Restricción a invitados").
 *
 * Validaciones:
 *   1. `ROOM_NAME_INVALID` si `name` falta, está vacío o supera 100 chars.
 *   2. `ROOM_NOT_FOUND` si la sala no existe.
 *   3. `FORBIDDEN` si el solicitante no es el dueño.
 *
 * @param req Path param `roomId`, body `{ name: string }`.
 * @param res 200 con `{ room }`, 400/403/404 según el caso.
 */
export const updateRoom = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { uid } = req.user!;
    const { roomId } = req.params as { roomId: string };
    const { name } = (req.body ?? {}) as { name?: string };

    if (!name || typeof name !== "string" || !name.trim()) {
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

    const room = await roomService.getRoomById(roomId);
    if (!room) {
      res.status(404).json(buildError(ErrorCode.ROOM_NOT_FOUND));
      return;
    }
    if (room.ownerId !== uid) {
      res.status(403).json(
        buildError(ErrorCode.FORBIDDEN, "Solo el dueño puede editar esta sala")
      );
      return;
    }

    const { description } = (req.body ?? {}) as { description?: string };
    const updated = await roomService.updateRoom(roomId, {
      name: trimmedName,
      description:
        typeof description === "string" ? description.trim().slice(0, 200) : undefined,
    });
    res.json({ room: updated });
  } catch (err) {
    sendError(res, err, "updateRoom");
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
        buildError(ErrorCode.FORBIDDEN, "Solo el dueño puede eliminar esta sala")
      );
      return;
    }

    // Borrar mensajes (subcolección) antes que el doc raíz. Si Firestore
    // falla en el borrado masivo, no eliminamos la sala — así el usuario
    // puede reintentar; los mensajes huérfanos serían inalcanzables si lo
    // hiciéramos al revés.
    await messageService.deleteRoomMessages(roomId);
    await roomService.deleteRoom(roomId);

    // Informar al chat-service (Tarea 5): cerrar las conexiones WebSocket
    // activas de esta sala. Best-effort — no bloquea la respuesta.
    await chatNotifier.notifyRoomClosed(roomId);

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
        buildError(ErrorCode.FORBIDDEN, "No eres miembro de esta sala")
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

    // Tarea 5 — manejo de errores de Firestore al cargar el historial.
    // Si la lectura falla (Firestore caído, índice faltante, etc.), no
    // filtramos el error interno: devolvemos un mensaje estable y legible.
    let messages;
    try {
      messages = await messageService.getRoomMessages(roomId, limit);
    } catch (err) {
      logger.error("[getRoomHistory] fallo leyendo historial", err);
      // Mantenemos el código estable INTERNAL_ERROR (el frontend ya lo maneja)
      // pero con el mensaje legible que pide la Tarea 5. No filtramos detalles
      // internos (índice faltante, paths de Firestore, etc.).
      res
        .status(500)
        .json(
          buildError(ErrorCode.INTERNAL_ERROR, "No fue posible cargar historial")
        );
      return;
    }
    res.json({ messages });
  } catch (err) {
    sendError(res, err, "getRoomHistory");
  }
};
