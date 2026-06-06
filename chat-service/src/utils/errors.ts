/**
 * @file errors — Códigos de error estables del chat-service.
 *
 * Se mantienen alineados con el contrato del room-service: el frontend toma
 * decisiones con `error` (código) y muestra `message` (texto en español).
 *
 * `USERNAME_ALREADY_CONNECTED` es el código nuevo exigido por la Tarea 8:
 * se devuelve cuando un username ya tiene una conexión activa en la sala.
 */

export const ErrorCode = {
  /** Falta `roomId` o `username` en el handshake / petición. */
  MISSING_FIELDS: "MISSING_FIELDS",
  /** El username ya tiene una conexión activa en esa sala. */
  USERNAME_ALREADY_CONNECTED: "USERNAME_ALREADY_CONNECTED",
  /** La sala fue eliminada/cerrada por el room-service. */
  ROOM_CLOSED: "ROOM_CLOSED",
  /** Mensaje vacío o solo espacios (Tarea 5). */
  EMPTY_MESSAGE: "EMPTY_MESSAGE",
  /** Mensaje supera la longitud máxima permitida (Tarea 6). */
  MESSAGE_TOO_LONG: "MESSAGE_TOO_LONG",
  /** Falta el ticket de autenticación en el handshake (Tarea 10). */
  AUTH_REQUIRED: "AUTH_REQUIRED",
  /** Ticket de autenticación inválido o expirado (Tarea 10). */
  INVALID_TICKET: "INVALID_TICKET",
  /** Secreto interno ausente o incorrecto en una llamada service-to-service. */
  UNAUTHORIZED_INTERNAL: "UNAUTHORIZED_INTERNAL",
  /** Error genérico interno. */
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Forma **uniforme** del body de error (sprint de accesibilidad/UX), idéntica
 * a la del room-service: `success: false` + `error` (código estable) +
 * `message` (texto claro en español). Nunca un código pelado tipo `"500"`.
 */
export interface ApiErrorBody {
  success: false;
  error: ErrorCodeValue;
  message: string;
}

export const DEFAULT_MESSAGES: Record<ErrorCodeValue, string> = {
  MISSING_FIELDS: "Faltan campos obligatorios (roomId y username)",
  USERNAME_ALREADY_CONNECTED:
    "Ese nombre de usuario ya está conectado en la sala",
  ROOM_CLOSED: "La sala fue cerrada por el anfitrión",
  EMPTY_MESSAGE: "El mensaje no puede estar vacío",
  MESSAGE_TOO_LONG: "El mensaje supera la longitud máxima permitida",
  AUTH_REQUIRED: "Se requiere autenticación para conectarse",
  INVALID_TICKET: "Ticket de autenticación inválido o expirado",
  UNAUTHORIZED_INTERNAL: "Llamada interna no autorizada",
  INTERNAL_ERROR: "Error interno del servidor",
};

export const buildError = (
  code: ErrorCodeValue,
  message?: string
): ApiErrorBody => ({
  success: false,
  error: code,
  message: message ?? DEFAULT_MESSAGES[code],
});
