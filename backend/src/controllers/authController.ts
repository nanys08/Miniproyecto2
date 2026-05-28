/**
 * @file authController — Handlers HTTP de la API `/api/auth/*`.
 *
 * Responsabilidades:
 *  - Validar el shape del body / path-params antes de llamar al service.
 *  - Mapear errores del service a códigos HTTP estables.
 *  - Garantizar que NO se filtre al cliente ningún detalle interno de
 *    Firebase Admin (mensajes originales, stack traces, paths).
 *
 * Convenciones:
 *  - Las funciones reciben `AuthRequest` (con `req.user` cuando hay token
 *    válido). El middleware `verifyToken` debe haberse aplicado en la ruta.
 *  - Para rutas públicas (check-username, check-email), `req.user` queda
 *    `undefined` y NO se debe leer.
 */

import { Response } from "express";
import { AuthRequest } from "../middlewares/authMiddleware";
import * as authService from "../services/authService";
import { AuthProvider } from "../models/User";
import { AppError, ErrorCode, buildError, mapFirestoreError } from "../utils/errors";
import { logger } from "../utils/logger";
import { isProfane } from "../utils/profanity";
import {
  isUnivalleEmail,
  UNIVALLE_DOMAIN,
  universityLabel,
} from "../utils/univalleEmail";

/** Regex de username: 4-10 chars, letras, números, punto y guion bajo. */
const USERNAME_REGEX = /^[a-zA-Z0-9_.]{4,10}$/;

/** Regex laxa de email para validar el path-param de `check-email`. */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Mínimo de caracteres del `fullName` (tras `trim`). Debe coincidir con el frontend. */
const FULLNAME_MIN_LENGTH = 3;

/**
 * Valida un teléfono opcional. Cadena vacía/whitespace = válido (borrar valor).
 * En otro caso debe tener entre 7 y 15 dígitos (E.164 sin contar prefijo `+`).
 */
const isValidPhone = (value: string): boolean => {
  if (!value.trim()) return true;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
};

/** Únicos proveedores aceptados en `register`. */
const VALID_PROVIDERS: AuthProvider[] = ["password", "google"];

/**
 * Envía un `AppError` tal cual al cliente. Cualquier otro error se loggea
 * internamente y se devuelve como `INTERNAL_ERROR` — nunca filtramos el
 * mensaje original de Firebase al cliente.
 *
 * @param res     Response de Express.
 * @param err     Error capturado (instancia de AppError o cualquier cosa).
 * @param context Etiqueta para el log (`"register"`, `"getMe"`, ...).
 */
const sendError = (res: Response, err: unknown, context: string): void => {
  if (err instanceof AppError) {
    res.status(err.status).json(buildError(err.code, err.message));
    return;
  }
  // Antes del catch-all INTERNAL_ERROR, intentamos reconocer códigos de
  // Firestore para devolver 404/503 cuando aplica, sin filtrar detalles.
  const mapped = mapFirestoreError(err);
  if (mapped) {
    logger.warn(`[${context}] Firestore error mapeado`, err);
    res.status(mapped.status).json(buildError(mapped.code, mapped.message));
    return;
  }
  logger.error(`[${context}] error interno`, err);
  res.status(500).json(buildError(ErrorCode.INTERNAL_ERROR));
};

/**
 * **POST /api/auth/register** — Crea el perfil del usuario en Firestore.
 *
 * Requiere `Authorization: Bearer <firebase_id_token>`. El `uid` y `email`
 * salen del token, no del body, para evitar suplantación.
 *
 * Validaciones en orden:
 *   1. `MISSING_FIELDS` si falta `username`, `fullName` o `provider`.
 *   2. `USERNAME_INVALID` si no cumple `USERNAME_REGEX`.
 *   3. `USERNAME_FORBIDDEN` si contiene una palabra de la lista negra.
 *   4. `PROVIDER_INVALID` si no es `"password"` ni `"google"`.
 *   5. (En el service) `USERNAME_ALREADY_EXISTS` o `PROFILE_ALREADY_EXISTS`.
 *
 * @param req Body: `{ username, fullName, provider, avatar? }`.
 * @param res 201 con `{ user }`, o un Error apropiado.
 */
export const register = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { uid, email } = req.user!;
    const { username, fullName, provider, avatar } = req.body ?? {};

    if (!username || !fullName || !provider) {
      res.status(400).json(buildError(ErrorCode.MISSING_FIELDS));
      return;
    }
    if (typeof username !== "string" || !USERNAME_REGEX.test(username)) {
      res.status(400).json(buildError(ErrorCode.USERNAME_INVALID));
      return;
    }
    if (isProfane(username)) {
      res.status(400).json(buildError(ErrorCode.USERNAME_FORBIDDEN));
      return;
    }
    if (
      typeof fullName !== "string" ||
      fullName.trim().length < FULLNAME_MIN_LENGTH
    ) {
      res.status(400).json(buildError(ErrorCode.FULLNAME_INVALID));
      return;
    }
    if (!VALID_PROVIDERS.includes(provider)) {
      res.status(400).json(buildError(ErrorCode.PROVIDER_INVALID));
      return;
    }

    const user = await authService.registerUserProfile(
      uid,
      username,
      fullName.trim(),
      email || "",
      provider,
      avatar
    );
    res.status(201).json({
      user: {
        ...user,
        isUnivalle: isUnivalleEmail(user.email),
        university: universityLabel(user.email),
      },
    });
  } catch (err) {
    sendError(res, err, "register");
  }
};

/**
 * **GET /api/auth/me** — Devuelve el perfil del usuario autenticado.
 *
 * Devuelve `404 PROFILE_NOT_FOUND` cuando el `uid` existe en Firebase Auth
 * pero no tiene documento en Firestore — caso típico del primer login con
 * Google antes de llamar a `register`. El frontend usa ese 404 como señal
 * para abrir el formulario de "completar perfil".
 *
 * @param req Requiere `req.user.uid` (poblado por `verifyToken`).
 * @param res 200 con `{ user }`, 404 si no existe perfil.
 */
export const getMe = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const profile = await authService.getUserProfile(req.user!.uid);
    if (!profile) {
      res.status(404).json(buildError(ErrorCode.PROFILE_NOT_FOUND));
      return;
    }
    res.json({
      user: {
        ...profile,
        isUnivalle: isUnivalleEmail(profile.email),
        university: universityLabel(profile.email),
      },
    });
  } catch (err) {
    sendError(res, err, "getMe");
  }
};

/**
 * **PATCH /api/auth/me** — Actualiza los campos editables del perfil.
 *
 * Requiere `Authorization: Bearer <firebase_id_token>`.
 * Solo se admiten los campos `username`, `fullName` y `avatar`. Los campos
 * inmutables (uid, email, provider, createdAt) se ignoran aunque vengan en
 * el body — nunca se escriben.
 *
 * Al menos uno de los tres campos debe estar presente en el body.
 *
 * Validaciones:
 *   1. `MISSING_FIELDS` si ningún campo editable está presente.
 *   2. `USERNAME_INVALID` si `username` no cumple `USERNAME_REGEX`.
 *   3. `USERNAME_FORBIDDEN` si `username` contiene una palabra de la lista negra.
 *   4. (En el service) `PROFILE_NOT_FOUND` si el perfil no existe.
 *   5. (En el service) `USERNAME_ALREADY_EXISTS` si el nuevo username ya lo usa otro usuario.
 *
 * @param req Body parcial: `{ username?, fullName?, avatar? }`.
 * @param res 200 con `{ user }` actualizado, o un Error apropiado.
 */
export const updateMe = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { uid } = req.user!;
    const { username, fullName, avatar, phone } = req.body ?? {};

    // Verificar que al menos un campo editable fue enviado
    const hasUsername = username !== undefined;
    const hasFullName = fullName !== undefined;
    const hasAvatar = avatar !== undefined;
    const hasPhone = phone !== undefined;

    if (!hasUsername && !hasFullName && !hasAvatar && !hasPhone) {
      res.status(400).json(buildError(ErrorCode.MISSING_FIELDS));
      return;
    }

    // Validar username si se envió
    if (hasUsername) {
      if (typeof username !== "string" || !USERNAME_REGEX.test(username)) {
        res.status(400).json(buildError(ErrorCode.USERNAME_INVALID));
        return;
      }
      if (isProfane(username)) {
        res.status(400).json(buildError(ErrorCode.USERNAME_FORBIDDEN));
        return;
      }
    }

    // Validar fullName si se envió (mínimo 3 caracteres tras trim)
    if (
      hasFullName &&
      (typeof fullName !== "string" ||
        fullName.trim().length < FULLNAME_MIN_LENGTH)
    ) {
      res.status(400).json(buildError(ErrorCode.FULLNAME_INVALID));
      return;
    }

    // Validar phone si se envió (opcional, pero si trae valor debe ser 7-15 dígitos)
    if (hasPhone) {
      if (typeof phone !== "string") {
        res.status(400).json(buildError(ErrorCode.PHONE_INVALID));
        return;
      }
      if (!isValidPhone(phone)) {
        res.status(400).json(buildError(ErrorCode.PHONE_INVALID));
        return;
      }
    }

    const updates: { username?: string; fullName?: string; avatar?: string; phone?: string } = {};
    if (hasUsername) updates.username = username as string;
    if (hasFullName) updates.fullName = (fullName as string).trim();
    if (hasAvatar) updates.avatar = avatar as string;
    // phone puede ser "" para borrar o cualquier string para actualizar
    if (hasPhone) updates.phone = (phone as string).trim();

    const user = await authService.updateUserProfile(uid, updates);
    res.json({
      user: {
        ...user,
        isUnivalle: isUnivalleEmail(user.email),
        university: universityLabel(user.email),
      },
    });
  } catch (err) {
    sendError(res, err, "updateMe");
  }
};

/**
 * **DELETE /api/auth/me** — Elimina la cuenta del usuario de forma definitiva.
 *
 * Requiere `Authorization: Bearer <firebase_id_token>`.
 *
 * Operaciones en orden:
 *  1. Borra el documento `users/{uid}` de Firestore.
 *  2. Borra el usuario de Firebase Authentication (invalida todos los tokens).
 *
 * El frontend debe llamar además a `firebase.auth().signOut()` para limpiar
 * el estado local del SDK (el ID Token dejará de ser válido de inmediato una
 * vez que Auth borre el usuario).
 *
 * @param req Requiere `req.user.uid`.
 * @param res 204 sin body en caso de éxito.
 */
export const deleteMe = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { uid } = req.user!;
    await authService.deleteUserAccount(uid);
    res.status(204).send();
  } catch (err) {
    sendError(res, err, "deleteMe");
  }
};

/**
 * **POST /api/auth/logout** — Cierra sesión server-side.
 *
 * Revoca todos los refresh tokens del usuario (cierra sesión en todas las
 * pestañas y dispositivos) y lo marca offline. El frontend debería además
 * llamar a `firebase.auth().signOut()` localmente.
 *
 * @param req Requiere `req.user.uid`.
 * @param res 204 sin body.
 */
export const logout = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { uid } = req.user!;
    await authService.setUserOnlineStatus(uid, false);
    await authService.revokeUserTokens(uid);
    res.status(204).send();
  } catch (err) {
    sendError(res, err, "logout");
  }
};

/**
 * **GET /api/auth/check-email/:email** — Endpoint **público**.
 *
 * Verifica si un correo ya tiene cuenta en Firebase Authentication.
 *
 * @param req Path param `email`.
 * @param res 200 `{ available: boolean }` o 400 `EMAIL_INVALID`.
 */
export const checkEmail = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const email = req.params["email"] as string;
    if (!email || !EMAIL_REGEX.test(email)) {
      res.status(400).json(buildError(ErrorCode.EMAIL_INVALID));
      return;
    }
    const exists = await authService.isEmailRegistered(email);
    res.json({ available: !exists });
  } catch (err) {
    sendError(res, err, "checkEmail");
  }
};

/**
 * **GET /api/auth/check-username/:username** — Endpoint **público**.
 *
 * Útil para validación en vivo durante el formulario de registro/edición.
 *
 * @param req Path param `username`.
 * @param res 200 `{ available: boolean }` o 400 `USERNAME_INVALID`.
 */
export const checkUsername = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const username = req.params["username"] as string;
    if (!USERNAME_REGEX.test(username)) {
      res.status(400).json(buildError(ErrorCode.USERNAME_INVALID));
      return;
    }
    if (isProfane(username)) {
      res.json({ available: false });
      return;
    }
    const taken = await authService.isUsernameTaken(username);
    res.json({ available: !taken });
  } catch (err) {
    sendError(res, err, "checkUsername");
  }
};

/**
 * **GET /api/auth/is-univalle/:email** — Endpoint **público**.
 *
 * Identifica si un correo pertenece al dominio institucional de Univalle.
 *
 * @param req Path param `email`.
 * @param res 200 `{ isUnivalle: boolean, domain: string }` o 400 `EMAIL_INVALID`.
 */
export const checkUnivalle = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const email = req.params["email"] as string;
    if (!email || !EMAIL_REGEX.test(email)) {
      res.status(400).json(buildError(ErrorCode.EMAIL_INVALID));
      return;
    }
    res.json({
      isUnivalle: isUnivalleEmail(email),
      domain: UNIVALLE_DOMAIN,
      university: universityLabel(email),
    });
  } catch (err) {
    sendError(res, err, "checkUnivalle");
  }
};
