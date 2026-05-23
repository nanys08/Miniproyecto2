/**
 * @file errors — Códigos de error estables expuestos al cliente.
 *
 * Reglas del contrato (compartidas con el frontend):
 *  - El cliente puede confiar en `error.code` para tomar decisiones
 *    (i18n, UX). **Nunca** cambiar el valor de un código sin migrar al
 *    frontend en el mismo PR.
 *  - `message` es texto legible en español, listo para anunciar en un
 *    `role="alert"`. NO incluir nunca detalles internos (stack, mensaje
 *    original de Firebase, paths, etc.).
 *
 * Para agregar un código:
 *  1. Añádelo a `ErrorCode`.
 *  2. Añade su mensaje por defecto a `DEFAULT_MESSAGES`.
 *  3. Añádelo al enum `Error.error` de `src/config/swagger.ts`.
 *  4. Actualiza `docs/contrato-frontend.md` (sección de códigos).
 */

/** Conjunto cerrado de códigos de error expuestos al cliente. */
export const ErrorCode = {
  // Auth / token
  MISSING_TOKEN: "MISSING_TOKEN",
  INVALID_TOKEN: "INVALID_TOKEN",

  // Body / validación
  MISSING_FIELDS: "MISSING_FIELDS",
  USERNAME_INVALID: "USERNAME_INVALID",
  USERNAME_FORBIDDEN: "USERNAME_FORBIDDEN",
  PROVIDER_INVALID: "PROVIDER_INVALID",
  EMAIL_INVALID: "EMAIL_INVALID",

  // Conflictos
  USERNAME_ALREADY_EXISTS: "USERNAME_ALREADY_EXISTS",
  EMAIL_ALREADY_EXISTS: "EMAIL_ALREADY_EXISTS",
  PROFILE_ALREADY_EXISTS: "PROFILE_ALREADY_EXISTS",

  // Estado
  PROFILE_NOT_FOUND: "PROFILE_NOT_FOUND",

  // Genérico — usar cuando el origen es interno (Firebase, red, etc.)
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

/** Tipo unión de los valores de `ErrorCode`. */
export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Forma del body devuelto por cualquier error de la API. */
export interface ApiErrorBody {
  error: ErrorCodeValue;
  message: string;
}

/**
 * Mensajes humanos por defecto (español). El service/controller puede
 * sobreescribirlos si tiene contexto adicional (ver `AppError`).
 */
export const DEFAULT_MESSAGES: Record<ErrorCodeValue, string> = {
  MISSING_TOKEN: "Token de autorización requerido",
  INVALID_TOKEN: "Token inválido o expirado",
  MISSING_FIELDS: "Faltan campos obligatorios en la solicitud",
  USERNAME_INVALID:
    "username inválido: 4-10 caracteres, solo letras, números, punto y guion bajo",
  USERNAME_FORBIDDEN: "Ese nombre de usuario no está permitido",
  PROVIDER_INVALID: "provider debe ser 'password' o 'google'",
  EMAIL_INVALID: "Correo electrónico inválido",
  USERNAME_ALREADY_EXISTS: "El nombre de usuario ya está en uso",
  EMAIL_ALREADY_EXISTS: "El correo electrónico ya está registrado",
  PROFILE_ALREADY_EXISTS: "El perfil ya existe para este usuario",
  PROFILE_NOT_FOUND: "Perfil no encontrado",
  INTERNAL_ERROR: "Error interno del servidor",
};

/**
 * Error tipado para que el service comunique códigos al controller sin
 * depender de mensajes literales (evita inspeccionar mensajes con regex).
 *
 * @example
 *   throw new AppError(ErrorCode.USERNAME_ALREADY_EXISTS, 409);
 */
export class AppError extends Error {
  /** Código estable expuesto al cliente. */
  public readonly code: ErrorCodeValue;
  /** Status HTTP recomendado para esta excepción. */
  public readonly status: number;

  constructor(code: ErrorCodeValue, status: number = 400, message?: string) {
    super(message ?? DEFAULT_MESSAGES[code]);
    this.code = code;
    this.status = status;
    this.name = "AppError";
  }
}

/**
 * Helper para construir el body JSON estándar de un error.
 *
 * @param code    Código estable de `ErrorCode`.
 * @param message Mensaje custom. Si se omite, usa `DEFAULT_MESSAGES[code]`.
 */
export const buildError = (
  code: ErrorCodeValue,
  message?: string
): ApiErrorBody => ({
  error: code,
  message: message ?? DEFAULT_MESSAGES[code],
});
