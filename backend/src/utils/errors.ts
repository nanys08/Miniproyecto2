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
  FULLNAME_INVALID: "FULLNAME_INVALID",
  PHONE_INVALID: "PHONE_INVALID",

  // Conflictos
  USERNAME_ALREADY_EXISTS: "USERNAME_ALREADY_EXISTS",
  EMAIL_ALREADY_EXISTS: "EMAIL_ALREADY_EXISTS",
  PROFILE_ALREADY_EXISTS: "PROFILE_ALREADY_EXISTS",

  // Estado
  PROFILE_NOT_FOUND: "PROFILE_NOT_FOUND",

  // Salas
  ROOM_NAME_INVALID: "ROOM_NAME_INVALID",
  ROOM_CODE_INVALID: "ROOM_CODE_INVALID",
  ROOM_NOT_FOUND: "ROOM_NOT_FOUND",

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
  FULLNAME_INVALID: "El nombre completo debe tener al menos 3 caracteres",
  PHONE_INVALID: "El teléfono debe tener exactamente 10 dígitos",
  USERNAME_ALREADY_EXISTS: "El nombre de usuario ya está en uso",
  EMAIL_ALREADY_EXISTS: "El correo electrónico ya está registrado",
  PROFILE_ALREADY_EXISTS: "El perfil ya existe para este usuario",
  PROFILE_NOT_FOUND: "Perfil no encontrado",
  ROOM_NAME_INVALID: "El nombre de la sala es inválido o está vacío",
  ROOM_CODE_INVALID: "El código de acceso es inválido",
  ROOM_NOT_FOUND: "Sala no encontrada",
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

/**
 * Convierte un error del Admin SDK de Firestore (o de Firebase Admin)
 * en un `AppError` controlado. Devuelve `null` si no reconoce el código —
 * en ese caso, el llamador debe tratarlo como `INTERNAL_ERROR` (catch-all).
 *
 * Códigos de Firestore: ver
 *   https://firebase.google.com/docs/reference/admin/node/firebase-admin.firestore
 *
 * El objetivo es no filtrar el mensaje original al cliente (puede contener
 * paths internos, project ID, etc.) y al mismo tiempo distinguir fallos
 * temporales (503) de errores de cliente (400/404).
 */
export const mapFirestoreError = (err: unknown): AppError | null => {
  if (!err || typeof err !== "object") return null;
  const code = (err as { code?: string | number }).code;

  // permission-denied — Las reglas Firestore (no Admin SDK) rechazaron la
  // operación. Con Admin SDK no debería ocurrir, pero si llega indica un
  // problema serio de IAM. No exponemos el detalle al cliente.
  if (code === "permission-denied" || code === 7) {
    return new AppError(
      ErrorCode.INTERNAL_ERROR,
      500,
      "Acceso denegado por reglas de seguridad"
    );
  }

  // not-found — Documento no existe. Mapeamos a 404 con un mensaje
  // genérico; el llamador puede sobrescribir el código si tiene contexto.
  if (code === "not-found" || code === 5) {
    return new AppError(ErrorCode.PROFILE_NOT_FOUND, 404);
  }

  // unavailable / deadline-exceeded — Firestore caído o lento. 503 para
  // que el cliente sepa que es transitorio y pueda reintentar.
  if (
    code === "unavailable" ||
    code === "deadline-exceeded" ||
    code === 14 ||
    code === 4
  ) {
    return new AppError(
      ErrorCode.INTERNAL_ERROR,
      503,
      "Servicio temporalmente no disponible. Inténtalo de nuevo."
    );
  }

  // Otros códigos (aborted, internal, resource-exhausted, etc.) los
  // dejamos pasar al catch-all → INTERNAL_ERROR genérico.
  return null;
};
