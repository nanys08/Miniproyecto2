/**
 * @file internalController — Endpoints que el room-service usa para "informar
 * al WebSocket" (Tarea 5).
 *
 * Flujos del enunciado:
 *
 *   Usuario entra:   room-service ─valida sala─▶ POST /internal/rooms/notify-join
 *   Sala eliminada:  room-service ─────────────▶ POST /internal/rooms/notify-closed
 *                                                 (este servicio cierra las conexiones)
 */

import { Request, Response } from "express";
import * as presence from "../services/presenceService";
import { disconnectRoom } from "../sockets/chatSocket";
import { ErrorCode, buildError } from "../utils/errors";
import { logger } from "../utils/logger";

/**
 * **POST /internal/rooms/notify-join** — El room-service validó la sala y avisa
 * que un usuario está autorizado a entrar. Marcamos la sala como activa para
 * que el WebSocket acepte el handshake correspondiente.
 *
 * Body: `{ roomId, roomName?, username?, uid? }`
 */
export const notifyJoin = (req: Request, res: Response): void => {
  const { roomId, roomName, username } = req.body ?? {};
  if (!roomId || typeof roomId !== "string") {
    res.status(400).json(buildError(ErrorCode.MISSING_FIELDS));
    return;
  }
  presence.markRoomActive(roomId, typeof roomName === "string" ? roomName : undefined);
  logger.info(
    `room-service informó entrada a sala ${roomId}` +
      (roomName ? ` ("${roomName}")` : "") +
      (username ? ` — usuario "${username}"` : "")
  );
  res.json({ ok: true, roomId, participants: presence.getParticipants(roomId) });
};

/**
 * **POST /internal/rooms/notify-closed** — El room-service eliminó la sala.
 * Cerramos todas las conexiones WebSocket activas de esa sala (Tarea 5).
 *
 * Body: `{ roomId }`
 */
export const notifyClosed = (req: Request, res: Response): void => {
  const { roomId } = req.body ?? {};
  if (!roomId || typeof roomId !== "string") {
    res.status(400).json(buildError(ErrorCode.MISSING_FIELDS));
    return;
  }
  const closed = disconnectRoom(roomId);
  logger.info(
    `room-service eliminó sala ${roomId} — ${closed} conexión(es) cerrada(s)`
  );
  res.json({ ok: true, roomId, closedConnections: closed });
};
