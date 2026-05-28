import { io, type Socket } from "socket.io-client";
import { auth, firebaseConfigured } from "@/services/firebase";

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL || "http://localhost:3000";

let socket: Socket | null = null;

/**
 * Conecta al backend Socket.IO autenticando con el Firebase ID Token actual.
 *
 * Eventos del contrato actual:
 *  - Chat / sala (snake_case): join_room, leave_room, send_message,
 *    receive_message, user_joined, user_left
 *  - WebRTC (kebab-case, heredado TS-03): webrtc-offer, webrtc-answer, ice-candidate
 *
 * Reconexión: socket.io-client la maneja sola. Permitimos polling como
 * fallback porque algunos proxies (Render free tier) tardan en negociar
 * websocket en frío y dejarían el socket "Connecting" indefinido.
 */
export async function connectSocket(): Promise<Socket> {
  if (socket?.connected) return socket;

  if (!firebaseConfigured || !auth) {
    throw new Error(
      "Socket no disponible en modo demo. Configura Firebase para conectar al backend en tiempo real."
    );
  }

  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("No hay sesión activa");

  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ["websocket", "polling"],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
