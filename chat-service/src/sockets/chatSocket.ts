/**
 * @file chatSocket — Capa Socket.IO del chat-service (Repositorio 2).
 *
 * Cubre las tareas del servidor WebSocket:
 *   - Tarea 1: estructura del mensaje `{ roomId, username, content, timestamp }`.
 *   - Tarea 2: endpoint WebSocket en `/ws/chat` (el path se configura en server.ts).
 *   - Tarea 3: recibir mensajes (`send_message` con `{ content }`).
 *   - Tarea 4: broadcast SOLO a los miembros de la sala (`io.to(roomId)`).
 *   - Tarea 5: rechazar mensajes vacíos → `EMPTY_MESSAGE`.
 *   - Tarea 6: rechazar mensajes > 500 chars → `MESSAGE_TOO_LONG`.
 *   - Tarea 7: reconexión — un mismo usuario (mismo uid) puede reconectarse;
 *     el socket viejo se reemplaza en vez de rechazarse como duplicado.
 *   - Tarea 8: salas separadas — un mensaje de la sala A nunca llega a la B.
 *   - Tarea 10: autenticación coordinada — el handshake exige un ticket firmado
 *     por el room-service (cuando hay secreto configurado).
 *
 * Contrato de errores: acks `{ ok: false, error: <CODE>, message? }` y, en el
 * handshake, `next(new Error(<CODE>))` que el cliente recibe como
 * `connect_error.message`.
 */

import { Server, Socket } from "socket.io";
import * as presence from "../services/presenceService";
import * as ticketService from "../services/ticketService";
import * as persistence from "../services/persistenceClient";
import {
  MAX_MESSAGE_LENGTH,
  fromPersisted,
  buildLocal,
} from "../models/Message";
import { ErrorCode, DEFAULT_MESSAGES } from "../utils/errors";
import { logger } from "../utils/logger";

type AckSuccess<T> = { ok: true; data?: T; persisted?: boolean };
type AckFailure = { ok: false; error: string; message?: string };
type AckResponse<T> = AckSuccess<T> | AckFailure;

const safeAck = <T>(ack: unknown, response: AckResponse<T>): void => {
  if (typeof ack !== "function") return;
  try {
    (ack as (r: AckResponse<T>) => void)(response);
  } catch (err) {
    logger.warn("Ack callback lanzó excepción", err);
  }
};

let ioRef: Server | null = null;

/**
 * Cierra todas las conexiones de una sala. Lo invoca el controller interno
 * cuando el room-service notifica que la sala fue eliminada.
 */
export const disconnectRoom = (roomId: string): number => {
  if (!ioRef) return 0;
  const socketIds = presence.closeRoom(roomId);
  for (const sid of socketIds) {
    const sock = ioRef.sockets.sockets.get(sid);
    if (!sock) continue;
    sock.emit("room_closed", {
      roomId,
      error: ErrorCode.ROOM_CLOSED,
      message: DEFAULT_MESSAGES.ROOM_CLOSED,
    });
    sock.disconnect(true);
  }
  return socketIds.length;
};

export const initChatSocket = (io: Server): void => {
  ioRef = io;

  // ─── Handshake: autenticación + validación de username (Tareas 8 y 10) ────
  io.use((socket, next) => {
    const auth = socket.handshake.auth as {
      roomId?: string;
      username?: string;
      uid?: string;
      avatar?: string;
      ticket?: string;
    };
    let roomId = typeof auth.roomId === "string" ? auth.roomId.trim() : "";
    let username = typeof auth.username === "string" ? auth.username.trim() : "";
    let uid = typeof auth.uid === "string" ? auth.uid : undefined;
    // El avatar es informativo (para el grid) y NO viaja en el ticket firmado,
    // así que lo tomamos siempre del handshake del cliente.
    const avatar = typeof auth.avatar === "string" ? auth.avatar : undefined;

    // Tarea 10 — autenticación coordinada. Si hay secreto configurado, el
    // ticket emitido por el room-service es obligatorio. Sus datos (roomId,
    // username, uid) tienen prioridad sobre lo que envíe el cliente, porque
    // están firmados y no se pueden falsificar.
    if (ticketService.isTicketAuthEnabled()) {
      const payload = ticketService.verifyTicket(auth.ticket);
      if (!auth.ticket) {
        return next(new Error(ErrorCode.AUTH_REQUIRED));
      }
      if (!payload) {
        return next(new Error(ErrorCode.INVALID_TICKET));
      }
      roomId = payload.roomId;
      username = payload.username;
      uid = payload.uid;
    }

    if (!roomId || !username) {
      return next(new Error(ErrorCode.MISSING_FIELDS));
    }
    if (presence.isRoomClosed(roomId)) {
      return next(new Error(ErrorCode.ROOM_CLOSED));
    }

    // Tarea 8 + Tarea 7: unicidad de username, salvo reconexión del mismo uid.
    const existing = presence.getUser(roomId, username);
    if (existing) {
      const sameUser = !!uid && existing.uid === uid;
      if (!sameUser) {
        logger.warn(
          `Conexión rechazada: "${username}" ya conectado en sala ${roomId}`
        );
        return next(new Error(ErrorCode.USERNAME_ALREADY_CONNECTED));
      }
      // Reconexión: cerrar el socket viejo para no dejar fantasmas. Antes de
      // expulsarlo le avisamos con `session_replaced` para que la pestaña
      // anterior muestre un aviso claro (en vez de quedarse "Reconectando…").
      const stale = ioRef?.sockets.sockets.get(existing.socketId);
      if (stale) {
        stale.emit("session_replaced", { roomId, username });
        stale.disconnect(true);
      }
      presence.removeBySocketId(existing.socketId);
      logger.info(`Reconexión de "${username}" en sala ${roomId}`);
    }

    socket.data.roomId = roomId;
    socket.data.username = username;
    socket.data.uid = uid;
    socket.data.avatar = avatar;
    next();
  });

  io.on("connection", (socket: Socket) => {
    const roomId: string = socket.data.roomId;
    const username: string = socket.data.username;
    const uid: string | undefined = socket.data.uid;
    const avatar: string | undefined = socket.data.avatar;

    // Tarea 7/8: registrar al usuario en SU sala (aislada del resto).
    socket.join(roomId);
    presence.addUser(roomId, {
      username,
      uid,
      avatar,
      socketId: socket.id,
      joinedAt: new Date().toISOString(),
    });

    socket.to(roomId).emit("user_joined", { roomId, username, uid, avatar });
    io.to(roomId).emit("participants", {
      roomId,
      participants: presence.getParticipants(roomId),
      members: presence.getParticipantsDetailed(roomId),
    });

    // ─── send_message — Tareas 3-6 + persistencia (Tarea 6 del Repo 2) ─────
    // Recibe `{ content }`, valida vacío/longitud, PERSISTE delegando en el
    // room-service y luego difunde SOLO a la sala (Tarea 4 + 8). Difundir el
    // mensaje canónico (con id + timestamp reales) garantiza que el historial
    // y el mensaje en vivo sean idénticos (Tarea 7 — sincronización).
    socket.on(
      "send_message",
      async (payload: { content?: unknown }, ack: unknown) => {
        const raw = typeof payload?.content === "string" ? payload.content : "";

        // Tarea 5 — mensaje vacío o solo espacios.
        if (raw.trim().length === 0) {
          safeAck(ack, { ok: false, error: ErrorCode.EMPTY_MESSAGE });
          return;
        }
        // Tarea 6 — longitud máxima (se mide el contenido sin recortar).
        if (raw.trim().length > MAX_MESSAGE_LENGTH) {
          safeAck(ack, {
            ok: false,
            error: ErrorCode.MESSAGE_TOO_LONG,
            message: `Máximo ${MAX_MESSAGE_LENGTH} caracteres`,
          });
          return;
        }

        const content = raw.trim();

        // Persistir (Tarea 6): mensaje → guardar Firestore (vía room-service)
        // → broadcast. Si la persistencia está desactivada o falla, degradamos
        // a un mensaje local para que el chat siga funcionando (no se pierde
        // el mensaje en vivo aunque no quede en el historial).
        const persisted = await persistence.persistMessage({
          roomId,
          username,
          uid,
          content,
        });
        const message = persisted
          ? fromPersisted(persisted)
          : buildLocal({ roomId, username, uid, content });

        // Tarea 4 + 8: solo a los sockets de ESTA sala. Tarea 7: el broadcast
        // mantiene el historial de todos los clientes sincronizado en vivo.
        io.to(roomId).emit("receive_message", message);
        safeAck(ack, { ok: true, data: message, persisted: !!persisted });
      }
    );

    // ─── participants — lista bajo demanda (Tarea 9) ───────────────────────
    socket.on("participants", (_payload: unknown, ack: unknown) => {
      safeAck(ack, {
        ok: true,
        data: {
          roomId,
          participants: presence.getParticipants(roomId),
          members: presence.getParticipantsDetailed(roomId),
        },
      });
    });

    socket.on("error", (err) => {
      logger.error(`Socket error (${socket.id})`, err);
    });

    // ─── disconnect — limpiar presencia ────────────────────────────────────
    socket.on("disconnect", (reason) => {
      const removed = presence.removeBySocketId(socket.id);
      if (removed) {
        socket.to(removed.roomId).emit("user_left", {
          roomId: removed.roomId,
          username: removed.username,
        });
        io.to(removed.roomId).emit("participants", {
          roomId: removed.roomId,
          participants: presence.getParticipants(removed.roomId),
          members: presence.getParticipantsDetailed(removed.roomId),
        });
      }
      logger.info(
        `Socket desconectado: "${username}" (${socket.id}) — motivo: ${reason}`
      );
    });
  });

  io.engine.on("connection_error", (err) => {
    logger.warn(`Conexión WebSocket rechazada: ${err.code} ${err.message}`);
  });
};
