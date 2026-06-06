/**
 * @file ticketService — Validación del ticket de conexión (Tarea 10).
 *
 * "Coordinar autenticación": el room-service (Repositorio 1) ya validó el
 * Firebase ID Token del usuario. En vez de revalidar el token aquí (lo que
 * obligaría al chat-service a cargar credenciales de Firebase Admin), el
 * room-service emite un **ticket de un solo uso** firmado con el secreto
 * compartido (`INTERNAL_SECRET`). El chat-service solo verifica la firma.
 *
 * Formato del ticket (mismo algoritmo en ambos repos):
 *
 *   ticket = base64url(payloadJSON) + "." + base64url(HMAC_SHA256(payloadB64))
 *   payload = { roomId, username, uid?, exp }   // exp = epoch ms
 *
 * Así, solo un usuario que pasó por el room-service autenticado puede obtener
 * un ticket válido → "validar usuario autenticado antes de permitir conexión".
 */

import crypto from "crypto";
import { env } from "../config/env";
import { logger } from "../utils/logger";

export interface TicketPayload {
  roomId: string;
  username: string;
  uid?: string;
  /** Expiración en epoch milisegundos. */
  exp: number;
}

const b64urlDecode = (s: string): string =>
  Buffer.from(s, "base64url").toString("utf8");

const sign = (data: string, secret: string): string =>
  crypto.createHmac("sha256", secret).update(data).digest("base64url");

/** `true` si la verificación de tickets está activa (hay secreto configurado). */
export const isTicketAuthEnabled = (): boolean => !!env.internalSecret;

/**
 * Verifica un ticket. Devuelve el payload si es válido, o `null` si la firma
 * no coincide, el formato es inválido o ya expiró.
 *
 * Comparación de firmas en tiempo constante para no filtrar información por
 * timing.
 */
export const verifyTicket = (ticket: string | undefined): TicketPayload | null => {
  if (!ticket || typeof ticket !== "string") return null;
  const dot = ticket.indexOf(".");
  if (dot <= 0) return null;

  const body = ticket.slice(0, dot);
  const providedSig = ticket.slice(dot + 1);
  const expectedSig = sign(body, env.internalSecret);

  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }

  try {
    const payload = JSON.parse(b64urlDecode(body)) as TicketPayload;
    if (
      !payload.roomId ||
      !payload.username ||
      typeof payload.exp !== "number"
    ) {
      return null;
    }
    if (Date.now() > payload.exp) {
      logger.warn(`Ticket expirado para "${payload.username}" en sala ${payload.roomId}`);
      return null;
    }
    return payload;
  } catch {
    return null;
  }
};
