/**
 * @file messageService — Capa de datos para mensajes de chat.
 *
 * Encapsula el acceso a la subcolección `rooms/{roomId}/messages/`.
 * Las operaciones lanzan `AppError` (códigos estables) en condiciones
 * de negocio; cualquier otro error se propaga sin transformar para que
 * la capa superior (socket handler / controller REST) lo trate como
 * `INTERNAL_ERROR` y no filtre detalles internos al cliente.
 */

import { db } from "../config/firebase";
import { Message, MESSAGES_SUBCOLLECTION } from "../models/Message";
import { ROOMS_COLLECTION } from "../models/Room";
import { AppError, ErrorCode } from "../utils/errors";
import { logger } from "../utils/logger";

/** Tamaño por defecto del historial devuelto al entrar a una sala. */
export const DEFAULT_HISTORY_LIMIT = 50;

/** Tope máximo del parámetro `limit` para evitar respuestas gigantes. */
export const MAX_HISTORY_LIMIT = 200;

/** Longitud máxima permitida para el contenido de un mensaje (chars). */
export const MAX_MESSAGE_LENGTH = 2000;

/** Tamaño de batch al hacer borrado masivo (límite Firestore = 500). */
const DELETE_BATCH_SIZE = 500;

/** Referencia a la subcolección de mensajes de una sala. */
const messagesRef = (roomId: string) =>
  db.collection(ROOMS_COLLECTION).doc(roomId).collection(MESSAGES_SUBCOLLECTION);

/**
 * Persiste un mensaje en Firestore y devuelve el documento creado.
 *
 * El `id` lo genera Firestore con `doc()` (sin argumentos) → IDs únicos
 * sin necesidad de un contador secuencial. El `createdAt` se fija aquí
 * (server-side) para que el orden cronológico sea consistente entre
 * clientes con relojes desfasados.
 *
 * @param params  Datos del mensaje a guardar (ver tipo).
 * @returns       El documento `Message` recién persistido.
 */
export const saveMessage = async (params: {
  roomId: string;
  senderUid: string;
  senderUsername: string;
  content: string;
  type?: "text" | "system";
}): Promise<Message> => {
  const { roomId, senderUid, senderUsername, content, type = "text" } = params;

  // ── Validación defensiva (consistencia de datos) ──────────────────────
  // El handler de socket ya valida shape y membresía, pero protegemos
  // aquí también para que la capa de datos no acepte mensajes huérfanos
  // si un día se llama desde otro punto.
  if (
    typeof roomId !== "string" ||
    !roomId.trim() ||
    typeof senderUid !== "string" ||
    !senderUid.trim() ||
    typeof content !== "string" ||
    !content.trim() ||
    content.length > MAX_MESSAGE_LENGTH
  ) {
    throw new AppError(ErrorCode.MISSING_FIELDS, 400);
  }

  // Verificamos que la sala existe. Sin esto, un bug aguas arriba podría
  // crear una subcolección `rooms/<inexistente>/messages/...` huérfana
  // que el cliente nunca podría leer (y que no se limpia con cascade).
  const roomDoc = await db
    .collection(ROOMS_COLLECTION)
    .doc(roomId)
    .get();
  if (!roomDoc.exists) {
    throw new AppError(ErrorCode.ROOM_NOT_FOUND, 404);
  }

  const docRef = messagesRef(roomId).doc();
  const message: Message = {
    id: docRef.id,
    roomId,
    senderUid,
    senderUsername,
    content,
    type,
    createdAt: new Date(),
  };
  await docRef.set(message);
  return message;
};

/**
 * Lee el historial de mensajes de una sala, ordenado **cronológicamente**
 * (más antiguo → más nuevo) para que el cliente lo pueda pintar de arriba
 * hacia abajo sin reordenar.
 *
 * Implementación: pedimos los N más recientes en orden DESC (necesario para
 * `limit`) y los invertimos en memoria. Esto evita un escaneo total cuando
 * la sala tiene miles de mensajes.
 *
 * @param roomId  ID de la sala.
 * @param limit   Cantidad máxima de mensajes a devolver (clamp 1..MAX).
 * @returns       Array `Message[]`, vacío si no hay historial.
 */
export const getRoomMessages = async (
  roomId: string,
  limit: number = DEFAULT_HISTORY_LIMIT
): Promise<Message[]> => {
  const clamped = Math.max(1, Math.min(Math.floor(limit), MAX_HISTORY_LIMIT));
  const snap = await messagesRef(roomId)
    .orderBy("createdAt", "desc")
    .limit(clamped)
    .get();

  const items = snap.docs.map((d) => d.data() as Message);
  return items.reverse();
};

/**
 * Borra todos los mensajes de una sala. Pensado para encadenarse en el
 * flujo de `deleteRoom` (cascade delete).
 *
 * Firestore no borra subcolecciones automáticamente al borrar el doc
 * padre; hay que iterar los documentos. Lo hacemos en batches de 500
 * (el máximo permitido por una `WriteBatch`).
 *
 * Errores parciales: si un batch falla, el resto no se intenta. El llamador
 * debe decidir si reintenta o no — desde el punto de vista del usuario, la
 * sala ya está eliminada y los huérfanos son inalcanzables.
 *
 * @param roomId  ID de la sala cuyo historial se elimina.
 */
export const deleteRoomMessages = async (roomId: string): Promise<void> => {
  const snap = await messagesRef(roomId).get();
  if (snap.empty) return;

  for (let i = 0; i < snap.docs.length; i += DELETE_BATCH_SIZE) {
    const slice = snap.docs.slice(i, i + DELETE_BATCH_SIZE);
    const batch = db.batch();
    slice.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }

  logger.info(
    `Mensajes borrados de sala ${roomId} (${snap.docs.length} docs)`
  );
};
