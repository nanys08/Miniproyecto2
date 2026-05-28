/**
 * @file roomService — Capa de datos para el dominio de salas de estudio.
 *
 * Encapsula el acceso a la colección `rooms/` de Firestore.
 * Los IDs de sala se generan con `db.collection().doc()` — IDs de 20 caracteres
 * criptográficamente únicos de Firestore, sin necesidad de librería externa.
 *
 * Estructura: ver `docs/firestore-model.md`.
 */

import * as admin from "firebase-admin";
import { db } from "../config/firebase";
import { Room, ROOMS_COLLECTION } from "../models/Room";
import { AppError, ErrorCode } from "../utils/errors";
import { logger } from "../utils/logger";

/** Alfabeto del código de acceso: sin caracteres ambiguos (0/O, 1/I/L). */
const ACCESS_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const ACCESS_CODE_LENGTH = 6;

/** Genera un código de acceso corto aleatorio (ej. "B6K3F2"). */
const generateAccessCode = (): string => {
  let code = "";
  for (let i = 0; i < ACCESS_CODE_LENGTH; i++) {
    const idx = Math.floor(Math.random() * ACCESS_CODE_ALPHABET.length);
    code += ACCESS_CODE_ALPHABET[idx];
  }
  return code;
};

/**
 * Crea una nueva sala de estudio en Firestore.
 *
 * El ID de sala lo genera Firestore automáticamente (`doc()` sin argumentos),
 * garantizando unicidad global sin colisiones ni contador secuencial.
 *
 * @param ownerId     UID del usuario autenticado que crea la sala.
 * @param name        Nombre de la sala (ya validado y trimmed en el controller).
 * @param accessCode  Código de acceso pre-generado por el cliente. Si se omite,
 *                    el backend genera uno.
 * @returns El documento `Room` recién creado.
 */
export const createRoom = async (
  ownerId: string,
  name: string,
  accessCode?: string
): Promise<Room> => {
  const docRef = db.collection(ROOMS_COLLECTION).doc(); // ID único auto-generado

  const room: Room = {
    roomId: docRef.id,
    name,
    ownerId,
    accessCode: accessCode && accessCode.trim() ? accessCode.trim().toUpperCase() : generateAccessCode(),
    createdAt: new Date(),
    participants: [ownerId], // El creador es automáticamente participante
    isActive: true,
  };

  await docRef.set(room);
  logger.info(`Sala creada: "${name}" (${docRef.id}) por ${ownerId}`);
  return room;
};

/**
 * Busca una sala por su código de acceso (case-insensitive).
 *
 * Usado por el flujo "Unirme a sala" desde el dashboard.
 *
 * @param accessCode  Código de acceso compartido (ej. "B6K3F2").
 * @returns El documento `Room` o `null` si ningún documento coincide.
 */
export const getRoomByAccessCode = async (accessCode: string): Promise<Room | null> => {
  const snap = await db
    .collection(ROOMS_COLLECTION)
    .where("accessCode", "==", accessCode.trim().toUpperCase())
    .limit(1)
    .get();

  if (snap.empty) return null;
  return snap.docs[0].data() as Room;
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
  // Solo filtramos por ownerId (no usamos orderBy en la query para evitar
  // exigir un índice compuesto en Firestore). El orden por fecha se hace en
  // memoria: el set de salas de un usuario es pequeño.
  const snap = await db
    .collection(ROOMS_COLLECTION)
    .where("ownerId", "==", uid)
    .get();

  const rooms = snap.docs.map((d) => d.data() as Room);

  const toMillis = (value: Room["createdAt"]): number => {
    if (value instanceof Date) return value.getTime();
    // Firestore Timestamp expone toMillis(); fallback a _seconds.
    const ts = value as { toMillis?: () => number; _seconds?: number };
    if (typeof ts.toMillis === "function") return ts.toMillis();
    if (typeof ts._seconds === "number") return ts._seconds * 1000;
    return 0;
  };

  return rooms.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
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
 * Añade un UID al array `participants` de la sala (idempotente).
 *
 * Usa `FieldValue.arrayUnion` para que múltiples joins concurrentes no
 * generen duplicados ni se pisen entre sí. Si la sala no existe, lanza
 * `ROOM_NOT_FOUND` y no escribe.
 *
 * @param roomId  ID de la sala.
 * @param uid     UID del usuario que se une.
 * @throws {AppError} `ROOM_NOT_FOUND` (404) si la sala no existe.
 */
export const addParticipant = async (
  roomId: string,
  uid: string
): Promise<void> => {
  const docRef = db.collection(ROOMS_COLLECTION).doc(roomId);
  const doc = await docRef.get();
  if (!doc.exists) {
    throw new AppError(ErrorCode.ROOM_NOT_FOUND, 404);
  }
  await docRef.update({
    participants: admin.firestore.FieldValue.arrayUnion(uid),
  });
};

/**
 * Quita un UID del array `participants` de la sala (idempotente).
 *
 * No se llama en `disconnect` de socket (un usuario puede abrir varias
 * pestañas y no queremos sacarlo si solo cerró una). Se reserva para
 * acciones explícitas como "abandonar sala".
 *
 * @param roomId  ID de la sala.
 * @param uid     UID del usuario que sale.
 */
export const removeParticipant = async (
  roomId: string,
  uid: string
): Promise<void> => {
  const docRef = db.collection(ROOMS_COLLECTION).doc(roomId);
  const doc = await docRef.get();
  if (!doc.exists) return; // sala ya borrada → nada que hacer
  await docRef.update({
    participants: admin.firestore.FieldValue.arrayRemove(uid),
  });
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
