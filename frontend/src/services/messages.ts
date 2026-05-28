/**
 * @file messages — Tipos y cliente REST del dominio de mensajes de chat.
 *
 * El historial se carga con un GET al endpoint REST; los mensajes en vivo
 * llegan por Socket.IO (ver `services/socket.ts` y `hooks/useChat.ts`).
 */

import { api } from "@/services/api";

/**
 * Forma del mensaje tal como lo expone el backend (subcolección
 * `rooms/{roomId}/messages/`). El `createdAt` viene serializado:
 *  - en algunas respuestas como ISO 8601 (`string`)
 *  - en otras como Firestore Timestamp (`{ _seconds, _nanoseconds }`).
 * El helper `messageTimestamp()` normaliza ambos a un epoch ms.
 */
export interface Message {
  id: string;
  roomId: string;
  senderUid: string;
  senderUsername: string;
  content: string;
  type: "text" | "system";
  createdAt:
    | string
    | { _seconds: number; _nanoseconds: number }
    | { seconds: number; nanoseconds: number };
}

/** Devuelve el `createdAt` del mensaje como epoch ms. */
export function messageTimestamp(message: Pick<Message, "createdAt">): number {
  const value = message.createdAt;
  if (typeof value === "string") return Date.parse(value);
  if (value && typeof value === "object") {
    if ("_seconds" in value && typeof value._seconds === "number") {
      return value._seconds * 1000;
    }
    if ("seconds" in value && typeof value.seconds === "number") {
      return value.seconds * 1000;
    }
  }
  return 0;
}

/**
 * Carga el historial de mensajes vía REST. Útil cuando queremos el
 * historial antes de abrir el socket (por ejemplo, en el primer render).
 *
 * Nota: el socket también devuelve historial en el ack de `join_room`, así
 * que en uso normal una de las dos fuentes es suficiente. Mantener ambas
 * permite que el chat siga siendo "consultable" incluso si el socket
 * falla en conectar (degradación graceful).
 */
export async function getRoomHistory(
  roomId: string,
  limit?: number
): Promise<Message[]> {
  const qs = limit ? `?limit=${encodeURIComponent(limit)}` : "";
  const res = await api.get<{ messages: Message[] }>(
    `/rooms/${encodeURIComponent(roomId)}/messages${qs}`
  );
  return res.messages;
}
