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
 * Actualiza campos editables del perfil del usuario en Firestore.
 *
 * Campos permitidos: `username`, `fullName`, `avatar`.
 * Campos inmutables (uid, email, provider, createdAt, online) son ignorados.
 *
 * Si se cambia el `username`, la operación corre dentro de una **transacción**
 * para garantizar unicidad atómica: si otro usuario registró el mismo
 * username entre la verificación y la escritura, se lanza `USERNAME_ALREADY_EXISTS`.
 *
 * @param uid     Firebase UID del propietario del perfil.
 * @param updates Objeto con los campos a actualizar (todos opcionales).
 * @returns El documento `User` actualizado (refleja el estado post-escritura).
 * @throws {AppError} `PROFILE_NOT_FOUND` (404) si el uid no tiene perfil.
 * @throws {AppError} `USERNAME_ALREADY_EXISTS` (409) si el nuevo username ya está tomado.
 */
export const updateUserProfile = async (
  uid: string,
  updates: {
    username?: string;
    fullName?: string;
    avatar?: string;
  }
): Promise<User> => {
  const userRef = db.collection(USERS_COLLECTION).doc(uid);
  let updatedUser: User | null = null;

  await db.runTransaction(async (tx) => {
    const existingDoc = await tx.get(userRef);
    if (!existingDoc.exists) {
      throw new AppError(ErrorCode.PROFILE_NOT_FOUND, 404);
    }
    const current = existingDoc.data() as User;

    // Si el username cambia, verificar que no esté en uso por otro usuario
    if (updates.username !== undefined && updates.username !== current.username) {
      const usernameQuery = db
        .collection(USERS_COLLECTION)
        .where("username", "==", updates.username)
        .limit(1);
      const snap = await tx.get(usernameQuery);
      if (!snap.empty) {
        throw new AppError(ErrorCode.USERNAME_ALREADY_EXISTS, 409);
      }
    }

    // Construir el objeto de cambios con solo los campos permitidos
    const patch: Partial<User> = {};
    if (updates.username !== undefined) patch.username = updates.username;
    if (updates.fullName !== undefined) patch.fullName = updates.fullName;
    if (updates.avatar !== undefined) patch.avatar = updates.avatar;

    tx.update(userRef, patch);
    updatedUser = { ...current, ...patch };
  });

  logger.info(`Perfil actualizado: ${uid}`);
  return updatedUser!;
};

/**
 * Elimina la cuenta del usuario de forma definitiva:
 *  1. Borra el documento `users/{uid}` de Firestore.
 *  2. Borra el usuario de Firebase Authentication.
 *
 * Orden elegido: Firestore primero. Si falla el paso 2, el doc ya no
 * existe pero el Auth sí; el usuario puede volver a pedir la eliminación.
 * En el orden inverso (Auth primero), el token quedaría inválido y ya no
 * podría autenticarse para reintentar.
 *
 * @param uid Firebase UID del usuario a eliminar.
 * @throws {AppError} `PROFILE_NOT_FOUND` (404) si el uid no tiene perfil en Firestore.
 */
export const deleteUserAccount = async (uid: string): Promise<void> => {
  const userRef = db.collection(USERS_COLLECTION).doc(uid);

  // Verificar que el perfil existe antes de proceder
  const doc = await userRef.get();
  if (!doc.exists) {
    throw new AppError(ErrorCode.PROFILE_NOT_FOUND, 404);
  }

  // 1. Eliminar documento Firestore
  await userRef.delete();

  // 2. Eliminar usuario de Firebase Authentication
  await auth.deleteUser(uid);

  logger.info(`Cuenta eliminada completamente: ${uid}`);
};

/**
 * Comprueba si un `username` ya está usado en la colección.
 *
 * Lectura simple, sin transacción — válida para el endpoint público
 * `check-username`. La verdad definitiva la dice `registerUserProfile` /
 * `updateUserProfile`, que sí corren dentro de transacción.
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
