/**
 * @file persistenceClient — Delega la persistencia de mensajes al room-service.
 *
 * Integración de persistencia (Tarea 6). En vez de escribir en Firestore desde
 * el chat-service (lo que obligaría a cargar credenciales de Firebase Admin en
 * este servicio y duplicar la lógica de BD), delegamos el guardado al backend
 * principal vía su ruta interna `POST /internal/rooms/:roomId/messages`.
 *
 * Ventajas:
 *  - El diseño de la colección y la lógica de Firestore viven en un solo repo.
 *  - El chat-service se puede desplegar (p. ej. en un Render aparte) sin
 *    service account de Firebase: solo necesita la URL del room-service y el
 *    secreto compartido.
 */

import { env } from "../config/env";
import { logger } from "../utils/logger";

/** Documento de mensaje tal como lo devuelve el room-service (canónico). */
export interface PersistedMessage {
  id: string;
  roomId: string;
  senderUid: string;
  senderUsername: string;
  content: string;
  type: "text" | "system";
  /** Firestore Timestamp serializado o ISO string. */
  createdAt: unknown;
}

/** `true` si la persistencia está configurada (hay URL del room-service). */
export const isPersistenceEnabled = (): boolean => !!env.roomServiceUrl;

/**
 * Persiste un mensaje delegando en el room-service. Devuelve el mensaje
 * canónico (con `id` y `createdAt` reales) o `null` si la persistencia está
 * desactivada o falla (el llamador decide cómo degradar).
 */
export const persistMessage = async (params: {
  roomId: string;
  username: string;
  content: string;
  uid?: string;
}): Promise<PersistedMessage | null> => {
  if (!isPersistenceEnabled()) {
    logger.warn(
      "ROOM_SERVICE_URL no configurado — el mensaje se difunde sin persistir"
    );
    return null;
  }

  const base = env.roomServiceUrl.replace(/\/$/, "");
  const url = `${base}/internal/rooms/${encodeURIComponent(params.roomId)}/messages`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": env.internalSecret,
      },
      body: JSON.stringify({
        username: params.username,
        content: params.content,
        uid: params.uid,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      logger.warn(`room-service respondió ${res.status} al persistir mensaje`);
      return null;
    }
    const data = (await res.json()) as { message?: PersistedMessage };
    return data.message ?? null;
  } catch (err) {
    logger.warn("No se pudo persistir el mensaje en el room-service", err);
    return null;
  }
};
