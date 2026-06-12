/**
 * @file signaling — Capa Socket.IO del Signaling Server WebRTC (Repositorio 3).
 *
 * Es un **relay puro**: NO crea ni termina conexiones de medios, solo reenvía
 * los mensajes de señalización (offer / answer / ICE) entre los navegadores
 * para que ellos negocien la conexión P2P directa. El video/audio NUNCA pasa
 * por este servidor.
 *
 * Topología asumida por el frontend: malla completa (cada par de peers abre
 * una RTCPeerConnection directa). Apropiado para salas pequeñas (grid 2x2).
 *
 * Contrato de eventos (lo que pidió el profesor):
 *   - `introduction` (Tarea 4): un peer entra a una sala y anuncia quién es.
 *       El server responde QUIÉN ESTÁ CONECTADO (al recién llegado) y avisa
 *       QUIÉN ENTRA (a los que ya estaban). Con esa lista, cada cliente decide
 *       con qué peers abrir conexión (el de socketId mayor inicia la oferta,
 *       para evitar "glare").
 *   - `signal` (Tarea 5): transporta offer/answer/ICE SIN MODIFICAR. El server
 *       únicamente lo reenvía al destinatario (`to`).
 *   - `disconnect` (Tarea 6): al salir, se limpia el peer de la sala y se
 *       notifica al resto con `peer-left`.
 *
 * Logs (Tarea 7): usuario conectado, offer/answer/ICE reenviados, usuario
 * desconectado — todos con timestamp ISO vía `logger`.
 */

import { Server, Socket } from "socket.io";
import { logger } from "../utils/logger";

// ─── Tarea 3: estructura de peers / salas ────────────────────────────────────
//
//   rooms = {
//     "sala1": Map {
//       "socketIdA" => { socketId, uid, username, avatar },
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

// ─── Inicialización ──────────────────────────────────────────────────────────

export const initSignaling = (io: Server): void => {
  io.on("connection", (socket: Socket) => {
    // Tarea 7 — log de conexión.
    logger.info(`Usuario conectado: ${socket.id}`);

    // ──────────────────────────────────────────────────────────────────────
    // introduction (Tarea 4) — el peer entra a la sala y se presenta.
    // Payload: { roomId, uid?, username?, avatar? }
    // ──────────────────────────────────────────────────────────────────────
    socket.on(
      "introduction",
      (payload: {
        roomId?: string;
        uid?: string;
        username?: string;
        avatar?: string;
      }) => {
        const roomId = payload?.roomId;
        if (!roomId || typeof roomId !== "string") {
          socket.emit("signal-error", {
            error: "MISSING_ROOM",
            message: "introduction requiere un roomId válido.",
          });
          return;
        }

        const peer: PeerInfo = {
          socketId: socket.id,
          uid: payload.uid,
          username: (payload.username || "Anónimo").toString().slice(0, 80),
          avatar: payload.avatar,
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

        logger.info(
          `Introduction: ${peer.username} (${socket.id}) entró a la sala "${roomId}". ` +
            `Conectados ahora: ${rooms[roomId].size}`
        );
      }
    );

    // ──────────────────────────────────────────────────────────────────────
    // signal (Tarea 5) — relay puro de offer / answer / ICE. Sin modificar.
    // Payload: { to: socketId, signal: <SDP | ICECandidate> }
    // ──────────────────────────────────────────────────────────────────────
    socket.on(
      "signal",
      (payload: { to?: string; signal?: unknown }) => {
        const to = payload?.to;
        const signal = payload?.signal;
        if (!to || typeof to !== "string" || signal == null) return;

        // Tarea 7 — log del tipo de señal reenviada (no se toca el contenido).
        logger.info(
          `Signal [${signalKind(signal)}] reenviada: ${socket.id} → ${to}`
        );

        // Reenvío íntegro al destinatario, anexando solo quién la envía.
        io.to(to).emit("signal", { from: socket.id, signal });
      }
    );

    // Error de transporte a nivel de socket.
    socket.on("error", (err) => {
      logger.error(`Socket error (${socket.id})`, err);
    });

    // ──────────────────────────────────────────────────────────────────────
    // disconnect (Tarea 6) — limpieza de peer / sala / socket + notificación.
    // ──────────────────────────────────────────────────────────────────────
    socket.on("disconnect", (reason: string) => {
      const roomId = socket.data.roomId as string | undefined;
      const peer = socket.data.peer as PeerInfo | undefined;

      if (roomId && rooms[roomId]) {
        rooms[roomId].delete(socket.id);
        // Notificar a la sala que este peer se fue → los demás cierran su
        // RTCPeerConnection con él.
        socket.to(roomId).emit("peer-left", {
          socketId: socket.id,
          uid: peer?.uid,
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
