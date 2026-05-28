/**
 * @file socketManager — Capa Socket.IO del backend.
 *
 * Cubre:
 *   - Autenticación del handshake con Firebase ID Token.
 *   - Rooms colaborativas (`join_room` / `leave_room`).
 *   - Chat en tiempo real (`send_message` / `receive_message`) con
 *     persistencia en Firestore (subcolección `rooms/{roomId}/messages`).
 *   - Historial al unirse para soportar reconexión transparente.
 *   - Eventos de sistema (`user_joined`, `user_left`) broadcasteados
 *     al resto de la sala.
 *   - Señalización WebRTC para la futura capa de video (T3).
 *
 * Convenciones de eventos:
 *   - Chat y presencia → `snake_case` (alineado con el contrato del sprint).
 *   - WebRTC          → `kebab-case` (heredado del Sprint TS-03).
 *
 * Errores: todos los handlers que aceptan `ack` responden con el shape
 *   `{ ok: true, data? }` o `{ ok: false, error: <CODE>, message?: <texto> }`
 * para que el cliente pueda discriminar fallos de validación, autorización
 * o internos. Las excepciones internas (Firestore caído, etc.) se registran
 * en logs pero NO se filtran como `error: <stack>` al cliente.
 */

import { Server, Socket } from "socket.io";
import { auth } from "../config/firebase";
import * as authService from "../services/authService";
import * as roomService from "../services/roomService";
import * as messageService from "../services/messageService";
import { AppError, ErrorCode } from "../utils/errors";
import { logger } from "../utils/logger";

// ─── Tipos WebRTC (APIs de navegador, no disponibles en Node.js) ───────────

interface SdpPayload {
  type: "offer" | "answer" | "pranswer" | "rollback";
  sdp?: string;
}
interface IceCandidatePayload {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
}

// ─── Contratos ack ──────────────────────────────────────────────────────────

type AckSuccess<T> = { ok: true; data?: T };
type AckFailure = { ok: false; error: string; message?: string };
type AckResponse<T> = AckSuccess<T> | AckFailure;
type AckFn<T = unknown> = (response: AckResponse<T>) => void;

/**
 * Invoca un callback de acknowledgement solo si el cliente realmente lo
 * pasó. socket.io permite emitir sin ack — si no chequeamos, romperíamos
 * con `ack is not a function` en mitad de un handler.
 */
const safeAck = <T>(ack: unknown, response: AckResponse<T>): void => {
  if (typeof ack !== "function") return;
  try {
    (ack as AckFn<T>)(response);
  } catch (err) {
    logger.warn("Ack callback lanzó excepción", err);
  }
};

// ─── Estado en memoria ──────────────────────────────────────────────────────

/**
 * Mapa de sockets activos. La clave es `socket.id` (único por conexión,
 * no por usuario — un mismo uid puede tener varias pestañas abiertas).
 */
interface ConnectedUser {
  uid: string;
  username: string;
  avatar?: string;
  roomId?: string;
  /**
   * Estado actual del micrófono publicado por este socket.
   * Default: true al conectarse. El cliente puede cambiarlo con el evento
   * `media_state` y el servidor lo replica al resto de la sala.
   */
  micOn: boolean;
  /** Estado actual de la cámara. Default: true. */
  camOn: boolean;
}
const connectedUsers = new Map<string, ConnectedUser>();

// ─── Helpers ────────────────────────────────────────────────────────────────

const sanitizeMessage = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > messageService.MAX_MESSAGE_LENGTH) {
    return trimmed.slice(0, messageService.MAX_MESSAGE_LENGTH);
  }
  return trimmed;
};

/** Devuelve `true` si `uid` puede entrar/leer la sala. */
const isMemberOf = (
  room: { ownerId: string; participants?: string[] },
  uid: string
): boolean => {
  if (room.ownerId === uid) return true;
  return Array.isArray(room.participants) && room.participants.includes(uid);
};

/**
 * Comprueba si `uid` tiene OTRO socket activo en `roomId` distinto del
 * que se pasa como parámetro. Usado para evitar emitir `user_left` cuando
 * un usuario cierra una pestaña pero sigue presente en otra.
 */
const userHasOtherSocketsInRoom = (
  uid: string,
  roomId: string,
  excludeSocketId: string
): boolean => {
  for (const [sid, u] of connectedUsers.entries()) {
    if (sid === excludeSocketId) continue;
    if (u.uid === uid && u.roomId === roomId) return true;
  }
  return false;
};

// ─── Inicialización ─────────────────────────────────────────────────────────

export const initSocket = (io: Server): void => {
  // Middleware: autenticación del handshake con Firebase ID Token.
  // `checkRevoked: true` para invalidar tokens revocados en caliente
  // (mismo criterio que el middleware REST salvo por la diferencia de carga).
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token as string | undefined;
    if (!token) return next(new Error("MISSING_TOKEN"));

    try {
      const decoded = await auth.verifyIdToken(token, true);
      socket.data.uid = decoded.uid;
      next();
    } catch (err) {
      logger.warn("Handshake Socket.IO rechazado", err);
      next(new Error("INVALID_TOKEN"));
    }
  });

  io.on("connection", async (socket: Socket) => {
    const uid: string = socket.data.uid;

    // Carga perezosa del perfil — si el usuario aún no completó el registro
    // (primer login de Google sin username), no rompemos la conexión, solo
    // usamos "Anónimo" hasta que el frontend complete el flujo.
    const profile = await authService.getUserProfile(uid).catch((err) => {
      logger.error("getUserProfile falló en connection", err);
      return null;
    });
    const username = profile?.username || "Anónimo";
    const avatar = profile?.avatar;

    connectedUsers.set(socket.id, {
      uid,
      username,
      avatar,
      micOn: true,
      camOn: true,
    });

    // Marcar online solo si el perfil existe (evita update sobre doc inexistente)
    if (profile) {
      authService
        .setUserOnlineStatus(uid, true)
        .catch((err) => logger.warn("setUserOnlineStatus(true) falló", err));
    }
    logger.info(`Socket conectado: ${username} (${socket.id})`);

    // ────────────────────────────────────────────────────────────────────
    // join_room — Entrar a una sala
    // ────────────────────────────────────────────────────────────────────
    //
    // Payload: { roomId: string, limit?: number }
    // Ack data: { room, messages, members } para soportar carga inicial
    // y reconexión sin perder estado.
    socket.on(
      "join_room",
      async (
        payload: { roomId?: string; limit?: number } | string,
        ack: unknown
      ) => {
        const roomId =
          typeof payload === "string" ? payload : payload?.roomId;
        const limit =
          typeof payload === "object" && payload !== null ? payload.limit : undefined;

        if (!roomId || typeof roomId !== "string") {
          safeAck(ack, { ok: false, error: ErrorCode.MISSING_FIELDS });
          return;
        }

        try {
          const room = await roomService.getRoomById(roomId);
          if (!room) {
            safeAck(ack, { ok: false, error: ErrorCode.ROOM_NOT_FOUND });
            return;
          }

          // Idempotente: arrayUnion no duplica si ya estaba.
          if (!isMemberOf(room, uid)) {
            await roomService.addParticipant(roomId, uid);
          }

          // Si el socket ya estaba en otra sala, salir limpia antes de unirse.
          const prev = connectedUsers.get(socket.id);
          if (prev?.roomId && prev.roomId !== roomId) {
            socket.leave(prev.roomId);
            // Usamos `io.to(...)` en vez de `socket.to(...)` para que el
            // emit funcione incluso si el socket está en un estado de
            // transición (post-leave o mid-disconnect).
            io.to(prev.roomId).emit("user_left", {
              uid,
              username,
              roomId: prev.roomId,
            });
          }

          // Preservamos el estado de medios actual del socket si ya existía
          // (caso de re-join tras reconexión). Si no, default true.
          const existingMedia = connectedUsers.get(socket.id);
          const micOn = existingMedia?.micOn ?? true;
          const camOn = existingMedia?.camOn ?? true;
          socket.join(roomId);
          connectedUsers.set(socket.id, {
            uid,
            username,
            avatar,
            roomId,
            micOn,
            camOn,
          });

          // Historial para soportar reconexión: el cliente lo pinta antes
          // de empezar a escuchar `receive_message`. Lo devolvemos en el
          // ack en vez de emitir un evento aparte → menos race-conditions.
          const messages = await messageService.getRoomMessages(roomId, limit);

          // Lista de usuarios actualmente presentes en la sala (deduped
          // por uid, porque un mismo usuario puede tener varias pestañas).
          // Excluimos al propio uid: el cliente ya sabe que está ahí y lo
          // pinta desde su contexto de auth.
          // Incluimos el estado de medios para que la UI del recién
          // llegado pinte correctamente el mic/cam de los demás.
          const members: Array<{
            uid: string;
            username: string;
            avatar?: string;
            micOn: boolean;
            camOn: boolean;
          }> = [];
          const seen = new Set<string>([uid]);
          connectedUsers.forEach((u) => {
            if (u.roomId !== roomId) return;
            if (seen.has(u.uid)) return;
            seen.add(u.uid);
            members.push({
              uid: u.uid,
              username: u.username,
              avatar: u.avatar,
              micOn: u.micOn,
              camOn: u.camOn,
            });
          });

          // Notificar al resto de la sala. Incluimos `avatar` y el estado
          // inicial de medios para que la tarjeta del nuevo participante
          // se pinte con la información correcta de entrada.
          io.to(roomId).except(socket.id).emit("user_joined", {
            uid,
            username,
            avatar,
            roomId,
            micOn,
            camOn,
          });

          safeAck(ack, {
            ok: true,
            data: { room, messages, members },
          });
          logger.info(`${username} se unió a sala ${roomId}`);
        } catch (err) {
          if (err instanceof AppError) {
            safeAck(ack, { ok: false, error: err.code, message: err.message });
          } else {
            logger.error("join_room: error interno", err);
            safeAck(ack, { ok: false, error: ErrorCode.INTERNAL_ERROR });
          }
        }
      }
    );

    // ────────────────────────────────────────────────────────────────────
    // leave_room — Salir de una sala (sin abandonar la membresía)
    // ────────────────────────────────────────────────────────────────────
    //
    // Solo libera el "estoy presente ahora" — el uid se mantiene en
    // `participants` para que el usuario pueda volver. La membresía se
    // pierde solo si llama explícitamente al endpoint correspondiente
    // (futuro Sprint) o si el dueño elimina la sala.
    socket.on(
      "leave_room",
      (payload: { roomId?: string } | string, ack: unknown) => {
        const roomId =
          typeof payload === "string" ? payload : payload?.roomId;
        if (!roomId || typeof roomId !== "string") {
          safeAck(ack, { ok: false, error: ErrorCode.MISSING_FIELDS });
          return;
        }
        try {
          socket.leave(roomId);
          const current = connectedUsers.get(socket.id);
          if (current?.roomId === roomId) {
            // Quitamos el roomId pero conservamos avatar + estado de medios
            // para que si esta misma conexión entra a otra sala mantenga
            // el último mic/cam que el usuario eligió.
            connectedUsers.set(socket.id, {
              uid,
              username,
              avatar,
              micOn: current.micOn,
              camOn: current.camOn,
            });
          }
          // Solo emitir user_left si esta era la última pestaña del
          // usuario en esa sala — evita ghost-leaves en multi-tab.
          // Usamos `io.to(...)` para que la entrega no dependa del estado
          // del socket (que ya hizo `socket.leave` y podría estar en
          // mid-disconnect si el cliente cerró la pestaña a la vez).
          if (!userHasOtherSocketsInRoom(uid, roomId, socket.id)) {
            io.to(roomId).emit("user_left", { uid, username, roomId });
          }
          safeAck(ack, { ok: true });
          logger.info(`${username} salió de sala ${roomId}`);
        } catch (err) {
          logger.error("leave_room: error interno", err);
          safeAck(ack, { ok: false, error: ErrorCode.INTERNAL_ERROR });
        }
      }
    );

    // ────────────────────────────────────────────────────────────────────
    // send_message — Enviar mensaje de chat
    // ────────────────────────────────────────────────────────────────────
    //
    // Pipeline:
    //   1. Validar shape + contenido (no vacío, ≤ MAX_MESSAGE_LENGTH).
    //   2. Verificar que el socket está actualmente unido a esa sala.
    //   3. Persistir en Firestore (server-side timestamp).
    //   4. Broadcast a TODOS los miembros (incluido el autor) con
    //      `io.to(roomId)` para que el cliente confirme su propio mensaje
    //      desde la misma fuente que ven los demás.
    //   5. Ack al autor con el mensaje persistido (id + createdAt reales).
    socket.on(
      "send_message",
      async (
        payload: { roomId?: string; content?: string },
        ack: unknown
      ) => {
        const roomId = payload?.roomId;
        const content = sanitizeMessage(payload?.content);

        if (!roomId || typeof roomId !== "string" || !content) {
          safeAck(ack, { ok: false, error: ErrorCode.MISSING_FIELDS });
          return;
        }

        // Defensa: solo aceptar mensajes en salas a las que el socket
        // se haya unido vía join_room. Sin esto, un cliente podría
        // postear en cualquier roomId del que conozca el ID.
        const current = connectedUsers.get(socket.id);
        if (!current || current.roomId !== roomId) {
          safeAck(ack, {
            ok: false,
            error: ErrorCode.ROOM_NOT_FOUND,
            message: "Únete a la sala antes de enviar mensajes",
          });
          return;
        }

        try {
          const message = await messageService.saveMessage({
            roomId,
            senderUid: uid,
            senderUsername: username,
            content,
            type: "text",
          });
          io.to(roomId).emit("receive_message", message);
          safeAck(ack, { ok: true, data: message });
        } catch (err) {
          logger.error("send_message: error persistiendo", err);
          safeAck(ack, { ok: false, error: ErrorCode.INTERNAL_ERROR });
        }
      }
    );

    // ────────────────────────────────────────────────────────────────────
    // media_state — Anunciar cambios de mic/cam al resto de la sala
    // ────────────────────────────────────────────────────────────────────
    //
    // Payload: { roomId, micOn?, camOn? }. El cliente envía el estado
    // completo (no diff) cada vez que el usuario alterna mic o cam.
    // El servidor:
    //   1. Actualiza `connectedUsers[socket.id]` con el nuevo estado.
    //   2. Broadcastea a la sala (excepto al emisor) con `io.to(...)`
    //      para que la entrega sea independiente del estado del socket.
    //   3. Nuevos joiners reciben el estado actual vía `members` del ack
    //      de `join_room`, así que entran ya viendo el mic/cam correcto.
    socket.on(
      "media_state",
      (payload: { roomId?: string; micOn?: boolean; camOn?: boolean }) => {
        const targetRoom = payload?.roomId;
        if (!targetRoom || typeof targetRoom !== "string") return;
        const current = connectedUsers.get(socket.id);
        if (!current || current.roomId !== targetRoom) return;

        const micOn =
          typeof payload.micOn === "boolean" ? payload.micOn : current.micOn;
        const camOn =
          typeof payload.camOn === "boolean" ? payload.camOn : current.camOn;

        connectedUsers.set(socket.id, { ...current, micOn, camOn });

        io.to(targetRoom).except(socket.id).emit("media_state", {
          uid,
          roomId: targetRoom,
          micOn,
          camOn,
        });
      }
    );

    // ────────────────────────────────────────────────────────────────────
    // WebRTC signaling (heredado TS-03) — se mantiene en kebab-case.
    // ────────────────────────────────────────────────────────────────────
    socket.on(
      "webrtc-offer",
      (payload: { targetSocketId: string; sdp: SdpPayload }) => {
        io.to(payload.targetSocketId).emit("webrtc-offer", {
          fromSocketId: socket.id,
          sdp: payload.sdp,
        });
      }
    );

    socket.on(
      "webrtc-answer",
      (payload: { targetSocketId: string; sdp: SdpPayload }) => {
        io.to(payload.targetSocketId).emit("webrtc-answer", {
          fromSocketId: socket.id,
          sdp: payload.sdp,
        });
      }
    );

    socket.on(
      "ice-candidate",
      (payload: {
        targetSocketId: string;
        candidate: IceCandidatePayload;
      }) => {
        io.to(payload.targetSocketId).emit("ice-candidate", {
          fromSocketId: socket.id,
          candidate: payload.candidate,
        });
      }
    );

    // ────────────────────────────────────────────────────────────────────
    // Manejo de errores a nivel de socket (transporte / payloads inválidos)
    // ────────────────────────────────────────────────────────────────────
    socket.on("error", (err) => {
      logger.error(`Socket error (${socket.id})`, err);
    });

    // ────────────────────────────────────────────────────────────────────
    // disconnect — Limpieza
    // ────────────────────────────────────────────────────────────────────
    socket.on("disconnect", async (reason) => {
      const user = connectedUsers.get(socket.id);
      // Borramos PRIMERO la entrada del socket que se va, para que el
      // chequeo "tiene otras pestañas" no se cuente a sí mismo.
      connectedUsers.delete(socket.id);
      if (
        user?.roomId &&
        !userHasOtherSocketsInRoom(user.uid, user.roomId, socket.id)
      ) {
        // Usar `io.to(...)` es CRÍTICO aquí: el socket ya está
        // desconectado, así que `socket.to(...).emit(...)` se descartaría
        // silenciosamente y el resto de la sala nunca se enteraría de
        // que este usuario se fue.
        io.to(user.roomId).emit("user_left", {
          uid: user.uid,
          username: user.username,
          roomId: user.roomId,
        });
      }

      if (profile) {
        await authService
          .setUserOnlineStatus(uid, false)
          .catch((err) =>
            logger.warn("setUserOnlineStatus(false) falló", err)
          );
      }
      logger.info(
        `Socket desconectado: ${username} (${socket.id}) — motivo: ${reason}`
      );
    });
  });

  // Errores a nivel de servidor (handshakes rechazados, p. ej.)
  io.engine.on("connection_error", (err) => {
    logger.warn(`Conexión Socket.IO rechazada: ${err.code} ${err.message}`);
  });
};
