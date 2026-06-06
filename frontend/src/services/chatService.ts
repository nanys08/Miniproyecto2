/**
 * @file chatService — Cliente WebSocket del chat-service (Repositorio 2).
 *
 * Conecta al servidor de tiempo real en `ws://<host>/ws/chat` (Socket.IO).
 * A diferencia de `services/socket.ts` (chat heredado en el backend principal),
 * este cliente habla con el servicio dedicado de presencia/chat en el puerto
 * 8081 y se autentica con el ticket emitido por `POST /api/rooms/:id/enter`.
 *
 * En desarrollo (sin `INTERNAL_SECRET` en el backend), el chat-service acepta
 * el handshake directo con `{ roomId, username, uid }`.
 */

import { io, type Socket } from "socket.io-client";

const CHAT_URL = import.meta.env.VITE_CHAT_URL || "http://localhost:8081";
const WS_PATH = "/ws/chat";

export interface ChatAuth {
  roomId: string;
  username: string;
  uid?: string;
  /** Avatar del usuario — informativo, para el grid de video. */
  avatar?: string;
  /** Ticket firmado (cuando el backend tiene autenticación coordinada). */
  ticket?: string | null;
}

/**
 * Abre una conexión al chat-service para una sala. Devuelve el socket; el
 * llamador (hook) gestiona los listeners y la desconexión al desmontar.
 */
export function connectChatService(authData: ChatAuth): Socket {
  return io(CHAT_URL, {
    path: WS_PATH,
    auth: {
      roomId: authData.roomId,
      username: authData.username,
      uid: authData.uid,
      avatar: authData.avatar,
      ticket: authData.ticket ?? undefined,
    },
    transports: ["websocket", "polling"],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });
}
