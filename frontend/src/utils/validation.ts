/**
 * @file validation — Helpers de validación que se comparten entre
 * pantallas (Register, Profile, modal Google).
 *
 * Mantener una sola fuente de verdad evita divergencias del tipo "en
 * Register dice X pero en Profile dice Y" para la misma falla.
 */

// ─── Username ───────────────────────────────────────────────────────────

/** Caracteres permitidos en username (sin clases compuestas). */
const USERNAME_CHARSET = /^[a-zA-Z0-9_.]+$/;

export const USERNAME_MIN = 4;
export const USERNAME_MAX = 10;
/** Mismo regex que el backend (`authController.USERNAME_REGEX`). */
export const USERNAME_REGEX = /^[a-zA-Z0-9_.]{4,10}$/;

/**
 * Devuelve la razón ESPECÍFICA por la que un username falla la regex —
 * o `null` si el valor es válido (4-10 chars del charset).
 *
 * Orden de chequeo:
 *  1. Vacío → `null` (no es "inválido", está vacío).
 *  2. Contiene espacios → mensaje específico de espacios.
 *  3. Tiene un caracter no permitido → reporta el primer caracter ofensor.
 *  4. Muy corto → mensaje de longitud mínima.
 *  5. Muy largo → mensaje de longitud máxima.
 *
 * El orden prioriza el feedback más accionable: si el usuario ve un
 * mensaje sobre "Mínimo 4 caracteres" mientras tiene espacios en su input,
 * podría no entender que el espacio cuenta como caracter no permitido.
 */
export function usernameInvalidReason(value: string): string | null {
  if (!value) return null;

  if (/\s/.test(value)) {
    return "El username no puede contener espacios";
  }

  if (!USERNAME_CHARSET.test(value)) {
    // Identificamos el primer caracter ofensor para feedback puntual.
    const offender = Array.from(value).find(
      (ch) => !USERNAME_CHARSET.test(ch)
    );
    if (offender) {
      return `El caracter "${offender}" no es válido. Usa solo letras, números, . y _`;
    }
    return "Solo letras, números, punto y guion bajo";
  }

  if (value.length < USERNAME_MIN) {
    return `Mínimo ${USERNAME_MIN} caracteres`;
  }
  if (value.length > USERNAME_MAX) {
    return `Máximo ${USERNAME_MAX} caracteres`;
  }

  return null;
}

// ─── Correo institucional (Univalle) ─────────────────────────────────────

/** Dominio institucional aceptado. Único punto de verdad en el frontend. */
export const UNIVALLE_DOMAIN = "correounivalle.edu.co";

/** Regex laxa de email (misma que el backend) para validar el formato. */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * `true` si el correo pertenece al dominio institucional de Univalle.
 * Compara sin distinguir mayúsculas y tolera espacios en los extremos.
 * Espeja a `backend/src/utils/univalleEmail.ts` — mantener ambos en sync.
 */
export function isUnivalleEmail(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  return email.trim().toLowerCase().endsWith("@" + UNIVALLE_DOMAIN);
}

/**
 * Razón específica por la que un correo no es válido para registrarse, o
 * `null` si es un correo institucional válido. Vacío → `null` (aún no
 * escribe nada). Solo se permiten correos `@correounivalle.edu.co`.
 */
export function emailInvalidReason(value: string): string | null {
  const email = value.trim();
  if (!email) return null;
  if (!EMAIL_REGEX.test(email)) return "Ingresa un correo electrónico válido";
  if (!isUnivalleEmail(email)) {
    return `Solo se permiten correos institucionales @${UNIVALLE_DOMAIN}`;
  }
  return null;
}

// ─── Teléfono ───────────────────────────────────────────────────────────

/** Longitud requerida (exacta) del teléfono. */
export const PHONE_DIGITS = 10;

/**
 * Quita todo lo que no sea dígito y trunca a `PHONE_DIGITS` caracteres
 * (evita que un paste de 30 dígitos quede guardado).
 */
export function sanitizePhoneDigits(input: string): string {
  return input.replace(/\D/g, "").slice(0, PHONE_DIGITS);
}

/**
 * Formato visible: "300 000 0000" — con espacios cada 3-3-4.
 *
 *  - 0 a 3 dígitos: como están.
 *  - 4 a 6 dígitos: "XXX XXX".
 *  - 7+ dígitos:    "XXX XXX XXXX" (truncado a 10).
 */
export function formatPhoneDisplay(digits: string): string {
  const d = sanitizePhoneDigits(digits);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)} ${d.slice(3)}`;
  return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
}

/**
 * Razón específica de invalidez del teléfono. `null` si está vacío
 * (campo opcional) o si tiene exactamente 10 dígitos.
 */
export function phoneInvalidReason(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 0) return null; // opcional
  if (digits.length < PHONE_DIGITS) {
    return `Faltan ${PHONE_DIGITS - digits.length} dígito${
      PHONE_DIGITS - digits.length === 1 ? "" : "s"
    }`;
  }
  if (digits.length > PHONE_DIGITS) {
    return `Máximo ${PHONE_DIGITS} dígitos`;
  }
  return null;
}
