/**
 * @file chatTicket — Emisión del ticket de conexión al chat-service (Tarea 10).
 *
 * "Coordinar autenticación": el room-service ya validó el Firebase ID Token
 * del usuario (vía `verifyToken`). Para que el chat-service (Repositorio 2) no
 * tenga que revalidar el token (ni cargar credenciales de Firebase Admin), el
 * room-service le entrega al cliente un ticket firmado con el secreto
 * compartido. El cliente lo presenta en el handshake WebSocket y el
 * chat-service solo verifica la firma.
 *
 * El algoritmo DEBE coincidir con `chat-service/src/services/ticketService.ts`.
 *
 *   ticket  = base64url(payloadJSON) + "." + base64url(HMAC_SHA256(payloadB64))
 *   payload = { roomId, username, uid?, exp }   // exp = epoch ms
 */

import crypto from "crypto";
import { env } from "../config/env";

/** Validez del ticket: 1 hora. Cubre reconexiones dentro de la sesión (Tarea 7). */
const TICKET_TTL_MS = 60 * 60 * 1000;

const b64url = (s: string): string => Buffer.from(s, "utf8").toString("base64url");

/**
 * Genera un ticket firmado para conectarse al chat-service. Devuelve `null`
 * si no hay secreto configurado (en cuyo caso el chat-service corre en modo
 * desarrollo sin autenticación coordinada).
 */
export const issueChatTicket = (params: {
  roomId: string;
  username: string;
  uid?: string;
}): string | null => {
  const secret = env.chatService.internalSecret;
  if (!secret) return null;

  const payload = {
    roomId: params.roomId,
    username: params.username,
    uid: params.uid,
    exp: Date.now() + TICKET_TTL_MS,
  };
  const body = b64url(JSON.stringify(payload));
  const sig = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("base64url");
  return `${body}.${sig}`;
};
