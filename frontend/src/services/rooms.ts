/**
 * @file rooms — Cliente REST tipado para el dominio de salas (/api/rooms).
 *
 * Envuelve `api` añadiendo tipos y el generador de código de acceso que se
 * muestra "pre-generado" en el modal de creación antes de enviar al backend.
 */

import { api } from "@/services/api";

/** Documento de sala tal como lo devuelve el backend. */
export interface Room {
  roomId: string;
  name: string;
  ownerId: string;
  accessCode: string;
  /** ISO 8601 o Firestore Timestamp serializado. */
  createdAt: string | { _seconds: number; _nanoseconds: number };
  participants: string[];
  isActive: boolean;
}

/** Alfabeto sin caracteres ambiguos (sin 0/O, 1/I/L). */
const ACCESS_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/**
 * Genera un código de acceso de 6 caracteres para mostrar en el modal.
 * El mismo código se envía al backend al crear la sala.
 */
export function generateAccessCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += ACCESS_CODE_ALPHABET[Math.floor(Math.random() * ACCESS_CODE_ALPHABET.length)];
  }
  return code;
}

/** GET /api/rooms — salas del usuario autenticado (más reciente primero). */
export async function listMyRooms(): Promise<Room[]> {
  const res = await api.get<{ rooms: Room[] }>("/rooms");
  return res.rooms;
}

/** POST /api/rooms — crea una sala y devuelve el documento creado. */
export async function createRoom(name: string, accessCode: string): Promise<Room> {
  const res = await api.post<{ room: Room }>("/rooms", { name, accessCode });
  return res.room;
}

/** GET /api/rooms/join/:code — resuelve un código de acceso a su sala. */
export async function joinRoomByCode(code: string): Promise<Room> {
  const res = await api.get<{ room: Room }>(`/rooms/join/${encodeURIComponent(code)}`);
  return res.room;
}
