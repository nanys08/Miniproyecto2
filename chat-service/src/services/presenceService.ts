/**
 * @file presenceService — Registro en memoria de usuarios conectados (Tareas 7 y 9).
 *
 * Es el "ConcurrentHashMap" del enunciado adaptado a Node.js. Node corre el
 * código JS en un único hilo, por lo que un `Map` nativo ya es seguro frente a
 * concurrencia: no hay dos handlers de socket ejecutándose a la vez sobre el
 * mismo objeto. No necesitamos locks.
 *
 * Estructura:
 *
 *   rooms: Map<roomId, Map<username, ConnectedUser>>
 *
 *   "123" ─▶ { "Juan" ─▶ {socketId, uid, joinedAt},
 *             "Ana"  ─▶ {socketId, uid, joinedAt} }
 *
 * La clave interna es el `username` (no el socketId) porque la regla de la
 * Tarea 8 es de unicidad por username dentro de la sala: un mismo nombre no
 * puede tener dos conexiones activas en la misma sala.
 *
 * `closedRooms` guarda las salas que el room-service marcó como eliminadas
 * (Tarea 5) para rechazar reconexiones tardías a una sala que ya no existe.
 */

import { logger } from "../utils/logger";

export interface ConnectedUser {
  username: string;
  /** UID Firebase del usuario (informativo; la unicidad es por username). */
  uid?: string;
  /** ID del socket que mantiene viva la conexión. */
  socketId: string;
  /** Momento en que se conectó (ISO 8601). */
  joinedAt: string;
}

/** roomId → (username → usuario conectado). */
const rooms = new Map<string, Map<string, ConnectedUser>>();

/** Nombre legible de cada sala, informado por el room-service (para logs). */
const roomNames = new Map<string, string>();

/**
 * Salas cerradas por el room-service. Se mantienen un rato para rechazar
 * conexiones rezagadas tras un `DELETE /rooms/:id`.
 */
const closedRooms = new Set<string>();

// ─── Tarea 5: ciclo de vida de la sala ───────────────────────────────────────

/** Marca una sala como activa (la informa el room-service al entrar un usuario). */
export const markRoomActive = (roomId: string, roomName?: string): void => {
  closedRooms.delete(roomId);
  if (roomName) roomNames.set(roomId, roomName);
  if (!rooms.has(roomId)) rooms.set(roomId, new Map());
};

/** `true` si el room-service marcó la sala como eliminada. */
export const isRoomClosed = (roomId: string): boolean => closedRooms.has(roomId);

export const getRoomName = (roomId: string): string | undefined =>
  roomNames.get(roomId);

/**
 * Cierra una sala: marca como cerrada, devuelve los socketIds que había que
 * desconectar y limpia el registro. El llamador (capa socket) usa los IDs
 * devueltos para cerrar las conexiones físicas.
 */
export const closeRoom = (roomId: string): string[] => {
  closedRooms.add(roomId);
  const members = rooms.get(roomId);
  const socketIds = members
    ? Array.from(members.values()).map((u) => u.socketId)
    : [];
  rooms.delete(roomId);
  roomNames.delete(roomId);
  logger.info(
    `Sala ${roomId} cerrada — ${socketIds.length} conexión(es) a desconectar`
  );
  return socketIds;
};

// ─── Tarea 8: validación de username ─────────────────────────────────────────

/** `true` si ese username ya tiene una conexión activa en la sala. */
export const isUsernameConnected = (
  roomId: string,
  username: string
): boolean => {
  const members = rooms.get(roomId);
  return !!members && members.has(username);
};

/**
 * Devuelve el usuario conectado con ese username en la sala, o `undefined`.
 * Usado para distinguir una reconexión (mismo uid) de un username duplicado
 * (Tareas 7 y 8).
 */
export const getUser = (
  roomId: string,
  username: string
): ConnectedUser | undefined => rooms.get(roomId)?.get(username);

// ─── Tarea 7: alta/baja de usuarios conectados ───────────────────────────────

/**
 * Registra al usuario en la sala. Asume que `isUsernameConnected` ya devolvió
 * `false` (la capa socket valida antes de llamar aquí).
 */
export const addUser = (roomId: string, user: ConnectedUser): void => {
  let members = rooms.get(roomId);
  if (!members) {
    members = new Map();
    rooms.set(roomId, members);
  }
  members.set(user.username, user);
  logger.info(
    `Usuario conectado: "${user.username}" en sala ${roomId} ` +
      `(${members.size} en sala) [socket ${user.socketId}]`
  );
};

/**
 * Da de baja por socketId (lo que conocemos en `disconnect`). Devuelve la
 * sala y el username liberados, o `null` si el socket no estaba registrado.
 */
export const removeBySocketId = (
  socketId: string
): { roomId: string; username: string } | null => {
  for (const [roomId, members] of rooms.entries()) {
    for (const [username, user] of members.entries()) {
      if (user.socketId !== socketId) continue;
      members.delete(username);
      if (members.size === 0) rooms.delete(roomId);
      logger.info(
        `Usuario desconectado: "${username}" de sala ${roomId} ` +
          `(${members.size} en sala)`
      );
      return { roomId, username };
    }
  }
  return null;
};

// ─── Tarea 9: participantes activos ──────────────────────────────────────────

/** Lista de usernames conectados en la sala (ej. ["Juan", "Ana"]). */
export const getParticipants = (roomId: string): string[] => {
  const members = rooms.get(roomId);
  return members ? Array.from(members.keys()) : [];
};

/** Devuelve los socketIds presentes en la sala (para broadcast/cierre). */
export const getSocketIds = (roomId: string): string[] => {
  const members = rooms.get(roomId);
  return members ? Array.from(members.values()).map((u) => u.socketId) : [];
};

/** Total de usuarios conectados en todas las salas (métrica/diagnóstico). */
export const totalConnected = (): number => {
  let n = 0;
  for (const members of rooms.values()) n += members.size;
  return n;
};

/** Solo para tests: limpia todo el estado en memoria. */
export const __resetForTests = (): void => {
  rooms.clear();
  roomNames.clear();
  closedRooms.clear();
};
