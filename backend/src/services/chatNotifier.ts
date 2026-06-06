/**
 * @file chatNotifier — Cliente HTTP del room-service hacia el chat-service.
 *
 * Implementa el "Informa WebSocket" de la Tarea 5: tras validar la sala (o tras
 * eliminarla), el room-service avisa al chat-service (Repositorio 2) por una
 * ruta interna protegida con `X-Internal-Secret`.
 *
 * Diseño best-effort: si el chat-service está caído o `CHAT_SERVICE_URL` no
 * está configurado, NO rompemos la operación principal (entrar/eliminar sala).
 * Solo registramos una advertencia. La presencia en tiempo real es un extra;
 * la fuente de verdad de la sala es Firestore.
 */

import { env } from "../config/env";
import { logger } from "../utils/logger";

/** `true` si el chat-service está configurado (hay URL). */
const isEnabled = (): boolean => !!env.chatService.url;

const post = async (
  path: string,
  body: Record<string, unknown>
): Promise<void> => {
  if (!isEnabled()) {
    logger.warn(
      `chat-service no configurado (CHAT_SERVICE_URL vacío) — se omite ${path}`
    );
    return;
  }
  const url = `${env.chatService.url.replace(/\/$/, "")}${path}`;
  try {
    // Timeout defensivo: el chat-service no debe colgar al room-service.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": env.chatService.internalSecret,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      logger.warn(`chat-service respondió ${res.status} a ${path}`);
    }
  } catch (err) {
    logger.warn(`No se pudo notificar al chat-service (${path})`, err);
  }
};

/**
 * Informa al chat-service que un usuario validado entró a una sala.
 * Marca la sala como activa para que acepte el handshake WebSocket.
 */
export const notifyUserJoined = (params: {
  roomId: string;
  roomName?: string;
  uid?: string;
  username?: string;
}): Promise<void> => post("/internal/rooms/notify-join", params);

/**
 * Informa al chat-service que una sala fue eliminada para que cierre todas
 * sus conexiones WebSocket activas (Tarea 5).
 */
export const notifyRoomClosed = (roomId: string): Promise<void> =>
  post("/internal/rooms/notify-closed", { roomId });
