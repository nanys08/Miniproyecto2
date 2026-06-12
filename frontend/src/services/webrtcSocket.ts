import { io, type Socket } from "socket.io-client";

/**
 * @file webrtcSocket — Conexión al Signaling Server WebRTC (Repositorio 3).
 *
 * Es un socket DEDICADO y SEPARADO del socket del room-service (chat/presencia,
 * puerto 3000) y del chat-service (8081). Apunta al signaling-server (8082 en
 * local) que solo reenvía offer/answer/ICE.
 *
 * A diferencia del socket del chat (singleton persistente), aquí creamos una
 * conexión nueva por llamada y el hook `useWebRTC` es dueño de su ciclo de
 * vida: la desconecta al salir de la sala (lo que dispara `disconnect` en el
 * server → `peer-left` para el resto). No requiere token: el servidor es un
 * relay puro; la autorización de la sala la hace el room-service.
 */

const WEBRTC_URL =
  (import.meta.env.VITE_WEBRTC_URL as string | undefined) ||
  "http://localhost:8082";

/** Crea una conexión nueva al signaling server (path por defecto /socket.io). */
export function createWebrtcSocket(): Socket {
  return io(WEBRTC_URL, {
    transports: ["websocket", "polling"],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });
}
