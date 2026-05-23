/**
 * @file univalleEmail — Identificación de correos institucionales Univalle.
 *
 * Un único punto de verdad para el dominio `@correounivalle.edu.co`. Si en
 * algún momento se admite un alias adicional (p. ej. `@univalle.edu.co`),
 * se agrega aquí en `UNIVALLE_DOMAINS` y todo el resto del código sigue
 * funcionando.
 *
 * La política actual es **solo identificar** (informativa), no restringir.
 * Para bloquear signups que no sean Univalle, basta agregar un check en
 * `authController.register` antes de llamar al service:
 *
 * ```ts
 * if (!isUnivalleEmail(email)) {
 *   res.status(400).json(buildError(ErrorCode.EMAIL_DOMAIN_FORBIDDEN));
 *   return;
 * }
 * ```
 */

/**
 * Dominio canónico institucional de Univalle.
 * Expuesto como constante para que tanto el endpoint público como el
 * frontend (vía respuesta JSON) puedan referenciarlo sin hardcodearlo.
 */
export const UNIVALLE_DOMAIN = "correounivalle.edu.co";

/** Lista de dominios aceptados (hoy uno, ampliable sin tocar el resto). */
const UNIVALLE_DOMAINS: readonly string[] = [UNIVALLE_DOMAIN];

/**
 * Devuelve `true` si el correo pertenece al dominio institucional de
 * Univalle. Compara case-insensitive y tolera espacios en los extremos.
 *
 * No valida el formato completo del correo — eso lo hace el caller con la
 * regex `EMAIL_REGEX` del controller antes de invocar a este helper.
 *
 * @param email Correo electrónico a evaluar.
 * @returns `true` si termina en `@correounivalle.edu.co` (o cualquier
 *          dominio futuro de `UNIVALLE_DOMAINS`), `false` en otro caso.
 */
export const isUnivalleEmail = (email: string): boolean => {
  if (!email || typeof email !== "string") return false;
  const normalized = email.trim().toLowerCase();
  return UNIVALLE_DOMAINS.some((domain) => normalized.endsWith("@" + domain));
};

/** Etiquetas legibles para el campo `Universidad` del perfil. */
export const UNIVERSITY_UNIVALLE = "Univalle";
export const UNIVERSITY_UNKNOWN = "No identificado";

/**
 * Etiqueta humana que muestra el frontend en el perfil del usuario en
 * el campo "Universidad". Centralizado para que el frontend no tenga que
 * decidir el texto a partir de `isUnivalle`.
 *
 * @param email Correo del usuario (típicamente del Firebase ID Token).
 * @returns `"Univalle"` si es correo institucional, `"No identificado"` si no.
 */
export const universityLabel = (email: string): string =>
  isUnivalleEmail(email) ? UNIVERSITY_UNIVALLE : UNIVERSITY_UNKNOWN;
