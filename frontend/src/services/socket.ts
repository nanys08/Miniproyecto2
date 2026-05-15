import { io, type Socket } from "socket.io-client";
import { auth, firebaseConfigured } from "@/services/firebase";

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL || "http://localhost:3000";

let socket: Socket | null = null;

/**
 * Conecta al backend Socket.IO autenticando con el Firebase ID Token actual.
 * Eventos disponibles (ver `backend/docs/sockets.md`):
 *  - TS-02: join-room, send-message, receive-message, user-joined, user-left
 *  - TS-03: webrtc-offer, webrtc-answer, ice-candidate
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
    transports: ["websocket"],
    autoConnect: true,
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
