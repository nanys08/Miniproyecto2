/**
 * @file authService — Capa de datos para el dominio de autenticación.
 *
 * Encapsula el acceso a Firestore (colección `users/`) y a Firebase
 * Admin Auth. Las funciones exportadas lanzan `AppError` con códigos
 * estables (`USERNAME_ALREADY_EXISTS`, etc.) cuando hay conflictos de
 * negocio; cualquier otro error se propaga sin transformar para que el
 * controller lo trate como `INTERNAL_ERROR`.
 *
 * Estructura de datos: ver `docs/firestore-model.md`.
 */

import { db, auth } from "../config/firebase";
import { AuthProvider, User, USERS_COLLECTION } from "../models/User";
import { AppError, ErrorCode } from "../utils/errors";
import { logger } from "../utils/logger";

/**
 * Crea el documento `users/{uid}` en Firestore tras un signup exitoso en
 * Firebase Auth.
 *
 * Concurrencia: usamos una **transacción** para que el chequeo de
 * `username` y la escritura del doc ocurran atómicamente. Si dos clientes
 * intentan registrar el mismo username a la vez, solo uno gana — el otro
 * recibe `USERNAME_ALREADY_EXISTS`.
 *
 * @param uid       Firebase UID extraído del ID Token verificado.
 * @param username  4-10 chars, único en la colección. Asume regex ya validada.
 * @param fullName  Nombre del usuario para mostrar.
 * @param email     Email del Firebase ID Token (no del body).
 * @param provider  `"password"` o `"google"`.
 * @param avatar    Ruta/URL del avatar (default `"default_avatar.png"`).
 * @returns El documento `User` recién creado.
 * @throws {AppError} `PROFILE_ALREADY_EXISTS` (409) si el uid ya tiene perfil.
 * @throws {AppError} `USERNAME_ALREADY_EXISTS` (409) si el username está tomado.
 */
export const registerUserProfile = async (
  uid: string,
  username: string,
  fullName: string,
  email: string,
  provider: AuthProvider,
  avatar: string = "default_avatar.png"
): Promise<User> => {
  const userRef = db.collection(USERS_COLLECTION).doc(uid);
  const usernameQuery = db
    .collection(USERS_COLLECTION)
    .where("username", "==", username)
    .limit(1);

  const newUser: User = {
    uid,
    username,
    fullName,
    email,
    avatar,
    provider,
    createdAt: new Date(),
    online: false,
  };

  await db.runTransaction(async (tx) => {
    const existingDoc = await tx.get(userRef);
    if (existingDoc.exists) {
      throw new AppError(ErrorCode.PROFILE_ALREADY_EXISTS, 409);
    }
    const usernameSnap = await tx.get(usernameQuery);
    if (!usernameSnap.empty) {
      throw new AppError(ErrorCode.USERNAME_ALREADY_EXISTS, 409);
    }
    tx.set(userRef, newUser);
  });

  logger.info(`Usuario registrado (${provider}): ${username} (${uid})`);
  return newUser;
};

/**
 * Comprueba si un `username` ya está usado en la colección.
 *
 * Lectura simple, sin transacción — válida para el endpoint público
 * `check-username`. La verdad definitiva la dice `registerUserProfile`,
 * que sí corre dentro de transacción.
 *
 * @param username Username a buscar (exact match).
 * @returns `true` si está tomado, `false` si está libre.
 */
export const isUsernameTaken = async (username: string): Promise<boolean> => {
  const snapshot = await db
    .collection(USERS_COLLECTION)
    .where("username", "==", username)
    .limit(1)
    .get();
  return !snapshot.empty;
};

/**
 * Lee el documento `users/{uid}` de Firestore.
 *
 * @param uid Firebase UID.
 * @returns El perfil si existe, `null` si no.
 */
export const getUserProfile = async (uid: string): Promise<User | null> => {
  const doc = await db.collection(USERS_COLLECTION).doc(uid).get();
  return doc.exists ? (doc.data() as User) : null;
};

/**
 * Actualiza el flag `online` de un usuario.
 *
 * @param uid    Firebase UID.
 * @param online Nuevo estado de presencia.
 */
export const setUserOnlineStatus = async (
  uid: string,
  online: boolean
): Promise<void> => {
  await db.collection(USERS_COLLECTION).doc(uid).update({ online });
};

/**
 * Revoca todos los refresh tokens del usuario (logout forzado server-side).
 *
 * Combinado con `checkRevoked: true` en `verifyToken`, esto invalida en
 * caliente cualquier ID Token previamente emitido (sin esperar a la
 * expiración natural de ≤ 1h).
 *
 * @param uid Firebase UID.
 */
export const revokeUserTokens = async (uid: string): Promise<void> => {
  await auth.revokeRefreshTokens(uid);
  logger.info(`Tokens revocados para uid: ${uid}`);
};

/**
 * Comprueba si un email ya tiene cuenta en Firebase Authentication.
 *
 * Firebase Admin lanza `auth/user-not-found` cuando no existe; cualquier
 * otro error se propaga para que el controller lo trate como interno
 * (no se filtra al cliente).
 *
 * @param email Correo electrónico (asume formato ya validado).
 * @returns `true` si Firebase ya conoce el correo, `false` si no.
 */
export const isEmailRegistered = async (email: string): Promise<boolean> => {
  try {
    await auth.getUserByEmail(email);
    return true;
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === "auth/user-not-found") return false;
    throw err;
  }
};
