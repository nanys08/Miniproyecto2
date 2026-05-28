/**
 * @file apiErrors — Traducción de errores del backend a mensajes para UI.
 *
 * Centraliza el mapeo de `ApiError` (HTTP status + código del backend) a:
 *  - `kind`: severidad para la UI (`error` / `warning` / `info`).
 *  - `title`: titular corto para mostrar arriba del bloque.
 *  - `message`: mensaje legible en español apto para `aria-live`.
 *
 * También cubre errores que NO son `ApiError` (fallo de red, fetch
 * rechazado, etc.) devolviendo un mensaje genérico de "Sin conexión".
 *
 * Filosofía:
 *  - Nunca exponer al usuario un código técnico o un stack trace.
 *  - Distinguir errores de sesión, permisos, no encontrado, validación,
 *    y caídas transitorias (503) para que la UI pueda decidir si invitar
 *    a reintentar o redirigir.
 *  - Trabajar tanto con códigos del backend (`error.message`) como con
 *    el HTTP status — uno u otro pueden faltar según el caso.
 */

import { ApiError } from "@/services/api";

/** Severidad visual asociada al error. */
export type ApiErrorKind = "session" | "forbidden" | "not_found" | "validation" | "network" | "server";

export interface FriendlyError {
  kind: ApiErrorKind;
  /** Título corto (3-5 palabras). */
  title: string;
  /** Mensaje accesible (1-2 frases). */
  message: string;
  /** `true` si conviene ofrecer "Reintentar" (errores transitorios). */
  retriable: boolean;
}

const NETWORK_ERROR: FriendlyError = {
  kind: "network",
  title: "Sin conexión",
  message:
    "No pudimos contactar al servidor. Verifica tu conexión e inténtalo de nuevo.",
  retriable: true,
};

const SERVER_ERROR_GENERIC: FriendlyError = {
  kind: "server",
  title: "Error del servidor",
  message:
    "Ocurrió un problema procesando tu solicitud. Inténtalo de nuevo en unos segundos.",
  retriable: true,
};

const SESSION_ERROR: FriendlyError = {
  kind: "session",
  title: "Debes iniciar sesión",
  message: "Tu sesión expiró o no está activa. Vuelve a iniciar sesión para continuar.",
  retriable: false,
};

const FORBIDDEN_ERROR: FriendlyError = {
  kind: "forbidden",
  title: "No tienes acceso",
  message: "No tienes permisos para ver este contenido.",
  retriable: false,
};

const NOT_FOUND_ERROR: FriendlyError = {
  kind: "not_found",
  title: "No encontrado",
  message: "El recurso que buscas no existe o fue eliminado.",
  retriable: false,
};

const UNAVAILABLE_ERROR: FriendlyError = {
  kind: "network",
  title: "Error de conexión",
  message:
    "El servicio no está disponible temporalmente. Inténtalo de nuevo en unos segundos.",
  retriable: true,
};

/**
 * Convierte CUALQUIER error en un `FriendlyError` apto para la UI.
 *
 * Reglas (en orden de prioridad):
 *  1. Si no es un `ApiError` → asumir fallo de red.
 *  2. Si el HTTP status es 401 / 403 / 404 / 503 → mapeo directo.
 *  3. Si el código del backend es conocido (MISSING_TOKEN, PROFILE_NOT_FOUND…)
 *     → mapeo por código.
 *  4. Cualquier otro 4xx → genérico de validación.
 *  5. Cualquier otro 5xx → genérico de servidor.
 */
export function friendlyError(err: unknown): FriendlyError {
  if (!(err instanceof ApiError)) {
    return NETWORK_ERROR;
  }

  // ── Mapeo por código del backend (cuando el status no es suficiente) ──
  switch (err.message) {
    case "MISSING_TOKEN":
    case "INVALID_TOKEN":
      return SESSION_ERROR;
    case "PROFILE_NOT_FOUND":
      return {
        kind: "not_found",
        title: "Perfil no encontrado",
        message: "Aún no has completado tu perfil. Completa el registro para continuar.",
        retriable: false,
      };
    case "ROOM_NOT_FOUND":
      return {
        kind: "not_found",
        title: "Sala no encontrada",
        message: "La sala no existe o fue eliminada por su propietario.",
        retriable: false,
      };
    case "ROOM_NAME_INVALID":
    case "ROOM_CODE_INVALID":
    case "USERNAME_INVALID":
    case "USERNAME_FORBIDDEN":
    case "FULLNAME_INVALID":
    case "PHONE_INVALID":
    case "EMAIL_INVALID":
    case "MISSING_FIELDS":
      return {
        kind: "validation",
        title: "Datos inválidos",
        message: "Algunos campos tienen un valor inválido. Revísalos antes de continuar.",
        retriable: false,
      };
    case "USERNAME_ALREADY_EXISTS":
      return {
        kind: "validation",
        title: "Username en uso",
        message: "Ese nombre de usuario ya está tomado. Elige otro.",
        retriable: false,
      };
    case "PROFILE_ALREADY_EXISTS":
      return {
        kind: "validation",
        title: "Perfil ya existe",
        message: "Ya tienes un perfil registrado. Inicia sesión para acceder.",
        retriable: false,
      };
  }

  // ── Mapeo por HTTP status ──────────────────────────────────────────────
  switch (err.status) {
    case 401:
      return SESSION_ERROR;
    case 403:
      return FORBIDDEN_ERROR;
    case 404:
      return NOT_FOUND_ERROR;
    case 503:
      return UNAVAILABLE_ERROR;
  }

  if (err.status >= 400 && err.status < 500) {
    return {
      kind: "validation",
      title: "Solicitud inválida",
      message: "La acción no pudo completarse con la información enviada.",
      retriable: false,
    };
  }
  return SERVER_ERROR_GENERIC;
}

/**
 * Forma breve para usar en toasts (1 línea, sin título separado).
 * Compone `title: message` para que el lector de pantalla lo anuncie completo.
 */
export function friendlyErrorOneLiner(err: unknown): string {
  const f = friendlyError(err);
  return `${f.title}: ${f.message}`;
}
