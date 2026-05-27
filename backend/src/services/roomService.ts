/**
 * @file roomService — Capa de datos para el dominio de salas de estudio.
 *
 * Encapsula el acceso a la colección `rooms/` de Firestore.
 * Los IDs de sala se generan con `db.collection().doc()` — IDs de 20 caracteres
 * criptográficamente únicos de Firestore, sin necesidad de librería externa.
 *
 * Estructura: ver `docs/firestore-model.md`.
 */

import { db } from "../config/firebase";
import { Room, ROOMS_COLLECTION } from "../models/Room";
import { AppError, ErrorCode } from "../utils/errors";
import { logger } from "../utils/logger";

/**
 * Crea una nueva sala de estudio en Firestore.
 *
 * El ID de sala lo genera Firestore automáticamente (`doc()` sin argumentos),
 * garantizando unicidad global sin colisiones ni contador secuencial.
 *
 * @param ownerId  UID del usuario autenticado que crea la sala.
 * @param name     Nombre de la sala (ya validado y trimmed en el controller).
 * @returns El documento `Room` recién creado.
 */
export const createRoom = async (ownerId: string, name: string): Promise<Room> => {
  const docRef = db.collection(ROOMS_COLLECTION).doc(); // ID único auto-generado

  const room: Room = {
    roomId: docRef.id,
    name,
    ownerId,
    createdAt: new Date(),
    participants: [ownerId], // El creador es automáticamente participante
    isActive: true,
  };

  await docRef.set(room);
  logger.info(`Sala creada: "${name}" (${docRef.id}) por ${ownerId}`);
  return room;
};

/**
 * Devuelve las salas creadas por el usuario, ordenadas de más reciente a más antigua.
 *
 * Cubre tanto las "salas creadas" como el "historial del usuario" (en este
 * sprint el historial coincide con las salas propias; en sprints futuros se
 * puede ampliar con el campo `participants`).
 *
 * @param uid  Firebase UID del usuario autenticado.
 * @returns Array de `Room` (vacío si no tiene salas).
 */
export const getRoomsByUser = async (uid: string): Promise<Room[]> => {
  const snap = await db
    .collection(ROOMS_COLLECTION)
    .where("ownerId", "==", uid)
    .orderBy("createdAt", "desc")
    .get();

  return snap.docs.map((d) => d.data() as Room);
};

/**
 * Lee un único documento `rooms/{roomId}`.
 *
 * @param roomId  ID de la sala.
 * @returns El documento `Room` o `null` si no existe.
 */
export const getRoomById = async (roomId: string): Promise<Room | null> => {
  const doc = await db.collection(ROOMS_COLLECTION).doc(roomId).get();
  return doc.exists ? (doc.data() as Room) : null;
};

/**
 * Elimina una sala de Firestore.
 *
 * Solo llamar tras verificar que el solicitante es el `ownerId` (lo hace el controller).
 *
 * @param roomId  ID de la sala a eliminar.
 * @throws {AppError} `ROOM_NOT_FOUND` (404) si la sala no existe.
 */
export const deleteRoom = async (roomId: string): Promise<void> => {
  const docRef = db.collection(ROOMS_COLLECTION).doc(roomId);
  const doc = await docRef.get();
  if (!doc.exists) {
    throw new AppError(ErrorCode.ROOM_NOT_FOUND, 404);
  }
  await docRef.delete();
  logger.info(`Sala eliminada: ${roomId}`);
};
