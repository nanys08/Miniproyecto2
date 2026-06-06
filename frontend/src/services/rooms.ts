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
  /** Descripción opcional de la sala. */
  description?: string;
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

/** POST /api/rooms/join — une por código (el código viaja en el body). US-08. */
export async function joinRoom(code: string): Promise<Room> {
  const res = await api.post<{ room: Room }>("/rooms/join", { code });
  return res.room;
}

/** GET /api/rooms/:roomId — obtiene una sala por su ID. */
export async function getRoom(roomId: string): Promise<Room> {
  const res = await api.get<{ room: Room }>(`/rooms/${encodeURIComponent(roomId)}`);
  return res.room;
}

/** Respuesta de POST /api/rooms/:id/enter (valida sala + emite ticket WS). */
export interface EnterRoomInfo {
  roomId: string;
  roomName: string;
  username?: string;
  /** Ticket firmado para el handshake del chat-service (null en dev sin secreto). */
  chatTicket?: string | null;
}

/** POST /api/rooms/:roomId/enter — valida la sala e informa al WebSocket. US-08. */
export async function enterRoom(roomId: string): Promise<EnterRoomInfo> {
  return api.post<EnterRoomInfo>(`/rooms/${encodeURIComponent(roomId)}/enter`);
}

/** PUT /api/rooms/:roomId — edita nombre/descripción de la sala (solo dueño). US-07. */
export async function updateRoom(
  roomId: string,
  fields: { name: string; description?: string }
): Promise<Room> {
  const res = await api.put<{ room: Room }>(
    `/rooms/${encodeURIComponent(roomId)}`,
    fields
  );
  return res.room;
}

/** DELETE /api/rooms/:roomId — elimina la sala (solo dueño). US-07. */
export async function deleteRoom(roomId: string): Promise<void> {
  await api.delete<void>(`/rooms/${encodeURIComponent(roomId)}`);
}
