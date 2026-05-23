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
import { AppError, ErrorCode, buildError } from "../utils/errors";
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
    if (!VALID_PROVIDERS.includes(provider)) {
      res.status(400).json(buildError(ErrorCode.PROVIDER_INVALID));
      return;
    }

    const user = await authService.registerUserProfile(
      uid,
      username,
      fullName,
      email || "",
      provider,
      avatar
    );
    // `isUnivalle` y `university` se calculan al vuelo desde el email del
    // ID Token. No se persisten en Firestore — son derivados, y queremos
    // que el comportamiento refleje siempre la política vigente, no la
    // del momento del registro.
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
 * El frontend puede llamarlo antes de `createUserWithEmailAndPassword`
 * para mostrar un mensaje claro de "el correo ya está registrado" en
 * vez del genérico de error de conexión.
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
 * Útil para validación en vivo durante el formulario de registro.
 *
 * Política de blacklist: los usernames con palabras prohibidas se reportan
 * como `{ available: false }`, **no** como error 400. Así el frontend pinta
 * el mismo estado de "ya en uso" sin tener que conocer códigos nuevos.
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
 * Identifica si un correo pertenece al dominio institucional de Univalle
 * (`@correounivalle.edu.co`). Pensado para que el frontend lo llame
 * mientras el usuario escribe el correo en el formulario de registro y
 * muestre/oculte un badge "Estudiante Univalle".
 *
 * Política actual: solo identifica, **no restringe** registro. Cualquier
 * dominio sigue pudiendo crear cuenta.
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
