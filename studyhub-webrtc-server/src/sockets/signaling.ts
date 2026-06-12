/**
 * @file signaling — Capa Socket.IO del Signaling Server WebRTC (Repositorio 3).
 *
 * Es un **relay puro**: NO crea ni termina conexiones de medios, solo reenvía
 * los mensajes de señalización (offer / answer / ICE) entre los navegadores
 * para que ellos negocien la conexión P2P directa. El video/audio NUNCA pasa
 * por este servidor — pero el servidor SÍ debe mantener la sesión estable
 * mientras hay streams activos (descubrimiento, reconexión y estados de medios).
 *
 * Topología asumida por el frontend: malla completa (cada par de peers abre
 * una RTCPeerConnection directa). Apropiado para salas pequeñas (grid 2x2).
 *
 * Contrato de eventos:
 *   - `introduction`: un peer entra a una sala y anuncia quién es. El server
 *       responde QUIÉN ESTÁ CONECTADO (al recién llegado) y avisa QUIÉN ENTRA
 *       (a los que ya estaban). El de socketId mayor inicia la oferta (anti-glare).
 *   - `signal`: transporta offer/answer/ICE SIN MODIFICAR. Solo se reenvía a `to`.
 *   - `participant_joined` / `participant_left`: sincronización de la lista de
 *       participantes (ID, nombre, estado inicial AV) para la UI del front.
 *   - `media-state` (agregado) y los eventos AV DISCRETOS `camera_on`/
 *       `camera_off`/`mic_on`/`mic_off`: estado de micrófono/cámara. Se guarda y
 *       se reenvía a la sala; los nuevos joiners reciben el estado en
 *       `introduction` / `participant_joined`.
 *   - `stream-started`: el peer ya tiene su media local lista (evidencia/logs).
 *   - `permissions-granted`: el navegador concedió cámara/micrófono.
 *   - `connection-state`: el cliente reporta el estado de su RTCPeerConnection
 *       (connected = conexión iniciada, failed = fallo, disconnected).
 *   - `media-error`: el peer no pudo acceder a cámara/micrófono.
 *   - `disconnect` → `peer-left` + `participant_left`: al salir se limpia el
 *       peer y se notifica a la sala.
 *
 * Reconexión: `connectionStateRecovery` (ver server.ts) recupera la sesión tras
 * cortes breves; aquí detectamos `socket.recovered` para re-registrar el peer y
 * loguear la reconexión.
 *
 * Logs: usuario conectado, reconexión, inicio de stream, offer/answer/ICE
 * reenviados, estado multimedia, error multimedia y usuario desconectado.
 */

import { Server, Socket } from "socket.io";
import { logger } from "../utils/logger";

// ─── Estructura de peers / salas ─────────────────────────────────────────────
//
//   rooms = {
//     "sala1": Map {
//       "socketIdA" => { socketId, uid, username, avatar, micOn, camOn },
//       "socketIdB" => { ... }
//     }
//   }
//
// Un `Map` por sala (clave = socket.id) permite alta/baja O(1) y deduplicar
// por socket. El estado vive solo en memoria: si el servicio reinicia, los
// clientes se reconectan y vuelven a emitir `introduction`.

export interface PeerInfo {
  socketId: string;
  uid?: string;
  username: string;
  avatar?: string;
  /** Estado de medios publicado por el peer (default: encendidos). */
  micOn: boolean;
  camOn: boolean;
}

const rooms: Record<string, Map<string, PeerInfo>> = {};

/** Lista de peers de una sala, opcionalmente excluyendo un socketId. */
const peersInRoom = (roomId: string, excludeSocketId?: string): PeerInfo[] => {
  const room = rooms[roomId];
  if (!room) return [];
  const list: PeerInfo[] = [];
  room.forEach((peer, sid) => {
    if (sid === excludeSocketId) return;
    list.push(peer);
  });
  return list;
};

/** Etiqueta legible del tipo de señal para los logs (sin tocar el payload). */
const signalKind = (signal: unknown): string => {
  if (signal && typeof signal === "object") {
    const s = signal as { type?: string; candidate?: unknown };
    if (typeof s.type === "string") return s.type.toUpperCase(); // OFFER / ANSWER
    if ("candidate" in s) return "ICE";
  }
  return "SIGNAL";
};

/**
 * Aplica un cambio de estado AV al peer y lo difunde a la sala de DOS formas:
 *   1. `media-state` agregado — lo consume la malla WebRTC.
 *   2. Eventos DISCRETOS `camera_on`/`camera_off`/`mic_on`/`mic_off` (Tarea 4)
 *      para que el front actualice la UI. Solo se emite el evento del campo que
 *      realmente cambió, y se registra el log correspondiente (Tarea 5).
 */
const applyMediaChange = (
  socket: Socket,
  change: { micOn?: boolean; camOn?: boolean }
): void => {
  const roomId = socket.data.roomId as string | undefined;
  const peer = socket.data.peer as PeerInfo | undefined;
  if (!roomId || !peer || !rooms[roomId]) return;

  const before = { micOn: peer.micOn, camOn: peer.camOn };
  if (typeof change.micOn === "boolean") peer.micOn = change.micOn;
  if (typeof change.camOn === "boolean") peer.camOn = change.camOn;
  rooms[roomId].set(socket.id, peer);

  // Estado agregado (compat con la señalización WebRTC / nuevos joiners).
  socket.to(roomId).emit("media-state", {
    socketId: socket.id,
    uid: peer.uid,
    micOn: peer.micOn,
    camOn: peer.camOn,
  });

  // Eventos discretos + logs, solo para el campo que cambió.
  if (before.micOn !== peer.micOn) {
    socket.to(roomId).emit(peer.micOn ? "mic_on" : "mic_off", {
      id: socket.id,
      uid: peer.uid,
    });
    logger.info(
      `Estado micrófono: ${peer.username} (${socket.id}) → ${peer.micOn ? "ON" : "OFF"}`
    );
  }
  if (before.camOn !== peer.camOn) {
    socket.to(roomId).emit(peer.camOn ? "camera_on" : "camera_off", {
      id: socket.id,
      uid: peer.uid,
    });
    logger.info(
      `Estado cámara: ${peer.username} (${socket.id}) → ${peer.camOn ? "ON" : "OFF"}`
    );
  }
};

// ─── Inicialización ──────────────────────────────────────────────────────────

export const initSignaling = (io: Server): void => {
  io.on("connection", (socket: Socket) => {
    // Tarea 2/4 — distinguir conexión nueva de RECONEXIÓN recuperada.
    // `socket.recovered` lo marca `connectionStateRecovery` cuando el cliente
    // volvió tras un corte breve: socket.data y socket.rooms quedan restaurados.
    if (socket.recovered) {
      const peer = socket.data.peer as PeerInfo | undefined;
      const roomId = socket.data.roomId as string | undefined;
      // El handler de `disconnect` pudo haber sacado al peer del mapa; lo
      // re-registramos y reavisamos a la sala para rehacer la malla.
      if (peer && roomId) {
        if (!rooms[roomId]) rooms[roomId] = new Map();
        rooms[roomId].set(socket.id, peer);
        socket.join(roomId);
        socket.to(roomId).emit("introduction", {
          roomId,
          self: socket.id,
          peers: [peer],
        });
        socket.to(roomId).emit("participant_joined", {
          id: socket.id,
          uid: peer.uid,
          username: peer.username,
          avatar: peer.avatar,
          micOn: peer.micOn,
          camOn: peer.camOn,
        });
      }
      logger.info(
        `Reconexión: ${socket.data.peer?.username ?? "(desconocido)"} (${socket.id})` +
          (roomId ? ` recuperó la sala "${roomId}"` : "")
      );
    } else {
      logger.info(`Usuario conectado: ${socket.id}`);
    }

    // ──────────────────────────────────────────────────────────────────────
    // introduction — el peer entra a la sala y se presenta.
    // Payload: { roomId, uid?, username?, avatar?, micOn?, camOn? }
    // ──────────────────────────────────────────────────────────────────────
    socket.on(
      "introduction",
      (payload: {
        roomId?: string;
        uid?: string;
        username?: string;
        avatar?: string;
        micOn?: boolean;
        camOn?: boolean;
      }) => {
        const roomId = payload?.roomId;
        if (!roomId || typeof roomId !== "string") {
          socket.emit("signal-error", {
            error: "MISSING_ROOM",
            message: "introduction requiere un roomId válido.",
          });
          return;
        }

        // Preservamos el estado de medios previo (re-introduction tras
        // reconexión); si no, default encendidos salvo que el payload lo diga.
        const prev = socket.data.peer as PeerInfo | undefined;
        const peer: PeerInfo = {
          socketId: socket.id,
          uid: payload.uid,
          username: (payload.username || "Anónimo").toString().slice(0, 80),
          avatar: payload.avatar,
          micOn:
            typeof payload.micOn === "boolean" ? payload.micOn : prev?.micOn ?? true,
          camOn:
            typeof payload.camOn === "boolean" ? payload.camOn : prev?.camOn ?? true,
        };

        // Si el socket ya estaba en otra sala (re-introduction), lo sacamos.
        const prevRoom = socket.data.roomId as string | undefined;
        if (prevRoom && prevRoom !== roomId) {
          rooms[prevRoom]?.delete(socket.id);
          socket.leave(prevRoom);
          socket.to(prevRoom).emit("peer-left", {
            socketId: socket.id,
            uid: peer.uid,
            roomId: prevRoom,
          });
          socket.to(prevRoom).emit("participant_left", {
            id: socket.id,
            uid: peer.uid,
            username: peer.username,
            roomId: prevRoom,
          });
        }

        socket.data.roomId = roomId;
        socket.data.peer = peer;
        socket.join(roomId);
        if (!rooms[roomId]) rooms[roomId] = new Map();
        rooms[roomId].set(socket.id, peer);

        // (a) Al recién llegado: QUIÉN ESTÁ CONECTADO (los que ya estaban).
        socket.emit("introduction", {
          roomId,
          self: socket.id,
          peers: peersInRoom(roomId, socket.id),
        });

        // (b) A los que ya estaban: QUIÉN ENTRA (el recién llegado).
        socket.to(roomId).emit("introduction", {
          roomId,
          self: socket.id,
          peers: [peer],
        });

        // (c) participant_joined (Tarea 2) — ID, Nombre y estado inicial AV.
        socket.to(roomId).emit("participant_joined", {
          id: socket.id,
          uid: peer.uid,
          username: peer.username,
          avatar: peer.avatar,
          micOn: peer.micOn,
          camOn: peer.camOn,
        });

        logger.info(
          `Introduction: ${peer.username} (${socket.id}) entró a la sala "${roomId}". ` +
            `Conectados ahora: ${rooms[roomId].size}`
        );
      }
    );

    // ──────────────────────────────────────────────────────────────────────
    // signal — relay puro de offer / answer / ICE. Sin modificar.
    // Payload: { to: socketId, signal: <SDP | ICECandidate> }
    // ──────────────────────────────────────────────────────────────────────
    socket.on("signal", (payload: { to?: string; signal?: unknown }) => {
      const to = payload?.to;
      const signal = payload?.signal;
      if (!to || typeof to !== "string" || signal == null) return;

      // Log del tipo de señal reenviada (no se toca el contenido).
      logger.info(
        `Signal [${signalKind(signal)}] reenviada: ${socket.id} → ${to}`
      );

      // Reenvío íntegro al destinatario, anexando solo quién la envía.
      io.to(to).emit("signal", { from: socket.id, signal });
    });

    // ──────────────────────────────────────────────────────────────────────
    // stream-started — el peer ya tiene su media local lista (Tarea 1/4).
    // Útil como evidencia: el signaling sigue estable con streams activos.
    // Payload: { roomId? }
    // ──────────────────────────────────────────────────────────────────────
    socket.on("stream-started", () => {
      const peer = socket.data.peer as PeerInfo | undefined;
      const roomId = socket.data.roomId as string | undefined;
      logger.info(
        `Inicio de stream: ${peer?.username ?? socket.id}` +
          (roomId ? ` en la sala "${roomId}"` : "")
      );
    });

    // ──────────────────────────────────────────────────────────────────────
    // permissions-granted (Tarea 3) — el navegador concedió cámara/micrófono.
    // Payload: { audio?: boolean, video?: boolean }
    // ──────────────────────────────────────────────────────────────────────
    socket.on(
      "permissions-granted",
      (payload: { audio?: boolean; video?: boolean }) => {
        const peer = socket.data.peer as PeerInfo | undefined;
        const parts: string[] = [];
        if (payload?.video) parts.push("cámara");
        if (payload?.audio) parts.push("micrófono");
        const granted = parts.length ? parts.join(" + ") : "ninguno";
        logger.info(
          `Permisos obtenidos: ${peer?.username ?? socket.id} → ${granted}`
        );
      }
    );

    // ──────────────────────────────────────────────────────────────────────
    // connection-state (Tarea 1) — el cliente reporta el estado de su
    // RTCPeerConnection con otro peer. Registra "conexión iniciada"
    // (connected), FALLOS (failed) e interrupciones (disconnected).
    // Payload: { peerUid?, peerSocketId?, state }
    // ──────────────────────────────────────────────────────────────────────
    socket.on(
      "connection-state",
      (payload: {
        peerUid?: string;
        peerSocketId?: string;
        state?: string;
      }) => {
        const peer = socket.data.peer as PeerInfo | undefined;
        const roomId = socket.data.roomId as string | undefined;
        const who = peer?.username ?? socket.id;
        const withWhom = payload?.peerUid || payload?.peerSocketId || "peer";
        switch (payload?.state) {
          case "connected":
            logger.info(
              `Conexión iniciada (P2P establecida): ${who} ↔ ${withWhom}`
            );
            break;
          case "failed":
            logger.error(`Fallo de conexión WebRTC: ${who} ↔ ${withWhom}`);
            // Avisar a la sala para que la UI pueda reflejar el problema.
            if (roomId) {
              socket.to(roomId).emit("connection-error", {
                uid: peer?.uid,
                peerUid: payload?.peerUid,
                state: "failed",
              });
            }
            break;
          case "disconnected":
            logger.warn(`Conexión WebRTC interrumpida: ${who} ↔ ${withWhom}`);
            break;
          default:
            break;
        }
      }
    );

    // ──────────────────────────────────────────────────────────────────────
    // media-state — sincronización de micrófono / cámara (on/off) (Tarea 3).
    // Payload: { micOn?, camOn? }. Se guarda en el peer y se reenvía a la sala;
    // los nuevos joiners lo reciben dentro de `introduction`.
    // ──────────────────────────────────────────────────────────────────────
    socket.on(
      "media-state",
      (payload: { micOn?: boolean; camOn?: boolean }) => {
        applyMediaChange(socket, payload || {});
      }
    );

    // ──────────────────────────────────────────────────────────────────────
    // Eventos AV DISCRETOS (Tarea 4) — alternativa a `media-state`. El front
    // puede emitir directamente camera_on/off / mic_on/off; el server
    // actualiza el peer y los reenvía a la sala (+ logs en applyMediaChange).
    // ──────────────────────────────────────────────────────────────────────
    socket.on("camera_on", () => applyMediaChange(socket, { camOn: true }));
    socket.on("camera_off", () => applyMediaChange(socket, { camOn: false }));
    socket.on("mic_on", () => applyMediaChange(socket, { micOn: true }));
    socket.on("mic_off", () => applyMediaChange(socket, { micOn: false }));

    // ──────────────────────────────────────────────────────────────────────
    // media-error — el peer no pudo acceder a cámara/micrófono (Tarea 4).
    // Payload: { reason?: string }
    // ──────────────────────────────────────────────────────────────────────
    socket.on("media-error", (payload: { reason?: string }) => {
      const peer = socket.data.peer as PeerInfo | undefined;
      const roomId = socket.data.roomId as string | undefined;
      const reason = (payload?.reason || "desconocido").toString().slice(0, 200);
      logger.error(
        `Error multimedia: ${peer?.username ?? socket.id} — ${reason}`
      );
      // Avisar a la sala (opcional para la UI: "X tiene problemas de medios").
      if (roomId) {
        socket.to(roomId).emit("media-error", {
          socketId: socket.id,
          uid: peer?.uid,
          reason,
        });
      }
    });

    // Error de transporte a nivel de socket.
    socket.on("error", (err) => {
      logger.error(`Socket error (${socket.id})`, err);
    });

    // ──────────────────────────────────────────────────────────────────────
    // disconnect — limpieza de peer / sala / socket + notificación.
    // ──────────────────────────────────────────────────────────────────────
    socket.on("disconnect", (reason: string) => {
      const roomId = socket.data.roomId as string | undefined;
      const peer = socket.data.peer as PeerInfo | undefined;

      if (roomId && rooms[roomId]) {
        rooms[roomId].delete(socket.id);
        // Notificar a la sala que este peer se fue → los demás cierran su
        // RTCPeerConnection con él (peer-left) y actualizan la lista de
        // participantes activos (participant_left, Tarea 3).
        socket.to(roomId).emit("peer-left", {
          socketId: socket.id,
          uid: peer?.uid,
          roomId,
        });
        socket.to(roomId).emit("participant_left", {
          id: socket.id,
          uid: peer?.uid,
          username: peer?.username,
          roomId,
        });
        // Si la sala quedó vacía, liberamos la entrada del mapa.
        if (rooms[roomId].size === 0) delete rooms[roomId];
      }

      logger.info(
        `Usuario desconectado: ${peer?.username ?? "(sin sala)"} (${socket.id}) — motivo: ${reason}`
      );
    });
  });

  // Errores a nivel de servidor (handshakes rechazados, etc.).
  io.engine.on("connection_error", (err) => {
    logger.warn(`Conexión Socket.IO rechazada: ${err.code} ${err.message}`);
  });
};

/** Foto del estado en memoria (para el endpoint de diagnóstico /rooms). */
export const getRoomsSnapshot = (): Record<string, PeerInfo[]> => {
  const snapshot: Record<string, PeerInfo[]> = {};
  Object.keys(rooms).forEach((roomId) => {
    snapshot[roomId] = peersInRoom(roomId);
  });
  return snapshot;
};
