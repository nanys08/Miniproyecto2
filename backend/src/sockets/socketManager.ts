import { Server, Socket } from "socket.io";
import { auth } from "../config/firebase";

// Tipos WebRTC (APIs de navegador no disponibles en Node.js)
interface SdpPayload {
  type: "offer" | "answer" | "pranswer" | "rollback";
  sdp?: string;
}
interface IceCandidatePayload {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
}
import * as authService from "../services/authService";
import { logger } from "../utils/logger";

// TS-02: Mapa de usuarios conectados: socketId → { uid, username, roomId }
const connectedUsers = new Map<
  string,
  { uid: string; username: string; roomId?: string }
>();

export const initSocket = (io: Server): void => {
  // Middleware Socket.IO: verificar Firebase ID Token en el handshake.
  // checkRevoked=true alinea con el middleware REST: si el backend hace
  // revokeUserTokens, los sockets que reintenten quedan fuera de inmediato.
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token as string | undefined;
    if (!token) {
      return next(new Error("MISSING_TOKEN"));
    }
    try {
      const decoded = await auth.verifyIdToken(token, true);
      socket.data.uid = decoded.uid;
      next();
    } catch (err) {
      logger.warn("Handshake rechazado", err);
      next(new Error("INVALID_TOKEN"));
    }
  });

  io.on("connection", async (socket: Socket) => {
    const uid: string = socket.data.uid;
    const profile = await authService.getUserProfile(uid);
    const username = profile?.username || "Anónimo";

    connectedUsers.set(socket.id, { uid, username });
    await authService.setUserOnlineStatus(uid, true);
    logger.info(`Socket conectado: ${username} (${socket.id})`);

    // TS-02: join-room
    socket.on("join-room", async (roomId: string) => {
      socket.join(roomId);
      connectedUsers.set(socket.id, { uid, username, roomId });

      socket.to(roomId).emit("user-joined", { uid, username });
      logger.info(`${username} se unió a room: ${roomId}`);
    });

    // TS-02: send-message
    socket.on(
      "send-message",
      (payload: { roomId: string; content: string }) => {
        const { roomId, content } = payload;
        const message = {
          senderUid: uid,
          senderUsername: username,
          content,
          roomId,
          createdAt: new Date().toISOString(),
        };
        io.to(roomId).emit("receive-message", message);
      }
    );

    // TS-03: WebRTC signaling — intercambio SDP
    socket.on(
      "webrtc-offer",
      (payload: { targetSocketId: string; sdp: SdpPayload }) => {
        io.to(payload.targetSocketId).emit("webrtc-offer", {
          fromSocketId: socket.id,
          sdp: payload.sdp,
        });
      }
    );

    // TS-03: WebRTC signaling — respuesta SDP
    socket.on(
      "webrtc-answer",
      (payload: { targetSocketId: string; sdp: SdpPayload }) => {
        io.to(payload.targetSocketId).emit("webrtc-answer", {
          fromSocketId: socket.id,
          sdp: payload.sdp,
        });
      }
    );

    // TS-03: WebRTC signaling — ICE candidates
    socket.on(
      "ice-candidate",
      (payload: { targetSocketId: string; candidate: IceCandidatePayload }) => {
        io.to(payload.targetSocketId).emit("ice-candidate", {
          fromSocketId: socket.id,
          candidate: payload.candidate,
        });
      }
    );

    // TS-02: disconnect-user
    socket.on("disconnect", async () => {
      const user = connectedUsers.get(socket.id);
      if (user?.roomId) {
        socket.to(user.roomId).emit("user-left", {
          uid: user.uid,
          username: user.username,
        });
      }
      connectedUsers.delete(socket.id);
      await authService.setUserOnlineStatus(uid, false);
      logger.info(`Socket desconectado: ${username} (${socket.id})`);
    });
  });
};
