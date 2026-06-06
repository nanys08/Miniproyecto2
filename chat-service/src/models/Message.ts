/**
 * @file Message — Estructura del mensaje de chat (Tarea 1).
 *
 * Modelo acordado con el frontend y el room-service:
 *
 *   {
 *     "messageId": "001",
 *     "roomId":    "123",
 *     "username":  "Juan",
 *     "content":   "Hola",
 *     "timestamp": "2026-06-01T15:00:00.000Z"
 *   }
 *
 * El servidor construye el `timestamp` (ISO 8601) y el cliente solo envía
 * `{ content }`. El `username` lo conoce el servidor desde el handshake, no se
 * confía en el body (evita suplantación).
 *
 * El mensaje que se DIFUNDE incluye, además del modelo anterior, alias de
 * compatibilidad (`id`, `senderUsername`, `senderUid`, `createdAt`) para que el
 * frontend actual —que deduplica por `id` y ordena por `createdAt`— lo entienda
 * sin cambios. Cuando el mensaje se persiste, esos campos toman los valores
 * canónicos que devuelve el room-service.
 */
import { PersistedMessage } from "../services/persistenceClient";

export interface ChatMessage {
  /** ID del mensaje (Tarea 1). Igual a `id`. */
  messageId: string;
  /** Alias de `messageId` para compatibilidad con el frontend actual. */
  id: string;
  roomId: string;
  /** Nombre del autor (tomado del handshake, no del payload). */
  username: string;
  /** Alias de `username` para compatibilidad con el frontend actual. */
  senderUsername: string;
  /** UID Firebase del autor (opcional). */
  senderUid?: string;
  /** Texto del mensaje (1..MAX_MESSAGE_LENGTH, ya validado). */
  content: string;
  /** Fecha-hora del servidor en ISO 8601 (Tarea 1). */
  timestamp: string;
  /** Alias de `timestamp` para compatibilidad con el frontend actual. */
  createdAt: string;
  /** Tipo de mensaje. */
  type: "text" | "system";
}

/** Longitud máxima de un mensaje (Tarea 6). */
export const MAX_MESSAGE_LENGTH = 500;

/** Normaliza el `createdAt` del room-service (Timestamp o ISO) a ISO string. */
const toIso = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const ts = value as { _seconds?: number; seconds?: number };
    const secs = ts._seconds ?? ts.seconds;
    if (typeof secs === "number") return new Date(secs * 1000).toISOString();
  }
  return new Date().toISOString();
};

/**
 * Construye el mensaje a difundir a partir del documento persistido por el
 * room-service (camino normal, Tarea 6).
 */
export const fromPersisted = (m: PersistedMessage): ChatMessage => {
  const iso = toIso(m.createdAt);
  return {
    messageId: m.id,
    id: m.id,
    roomId: m.roomId,
    username: m.senderUsername,
    senderUsername: m.senderUsername,
    senderUid: m.senderUid,
    content: m.content,
    timestamp: iso,
    createdAt: iso,
    type: m.type ?? "text",
  };
};

/**
 * Construye un mensaje local cuando la persistencia está desactivada o falló
 * (degradación graceful): el chat sigue funcionando aunque el mensaje no quede
 * en el historial. El `id` se genera localmente para que el frontend pueda
 * deduplicar.
 */
export const buildLocal = (params: {
  roomId: string;
  username: string;
  uid?: string;
  content: string;
}): ChatMessage => {
  const iso = new Date().toISOString();
  const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    messageId: id,
    id,
    roomId: params.roomId,
    username: params.username,
    senderUsername: params.username,
    senderUid: params.uid,
    content: params.content,
    timestamp: iso,
    createdAt: iso,
    type: "text",
  };
};
