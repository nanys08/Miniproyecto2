import { db, auth } from "../config/firebase";
import { AuthProvider, User, USERS_COLLECTION } from "../models/User";
import { AppError, ErrorCode } from "../utils/errors";
import { logger } from "../utils/logger";

// TS-01: Registro y persistencia de perfil en Firestore.
//
// Concurrencia: usamos una transacción de Firestore para que el chequeo de
// username y la escritura del doc users/{uid} ocurran de forma atómica.
// Si dos clientes intentan registrar el mismo username a la vez, solo uno
// gana — el otro recibe USERNAME_ALREADY_EXISTS.
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

// TS-01: Validación de username único (lectura simple, sin transacción).
// Útil para el endpoint público /check-username; la verdad la dice register.
export const isUsernameTaken = async (username: string): Promise<boolean> => {
  const snapshot = await db
    .collection(USERS_COLLECTION)
    .where("username", "==", username)
    .limit(1)
    .get();
  return !snapshot.empty;
};

// TS-01: Obtener perfil de usuario desde Firestore
export const getUserProfile = async (uid: string): Promise<User | null> => {
  const doc = await db.collection(USERS_COLLECTION).doc(uid).get();
  return doc.exists ? (doc.data() as User) : null;
};

// TS-01: Actualizar estado online del usuario
export const setUserOnlineStatus = async (
  uid: string,
  online: boolean
): Promise<void> => {
  await db.collection(USERS_COLLECTION).doc(uid).update({ online });
};

// TS-01: Revocar tokens (logout forzado desde servidor)
export const revokeUserTokens = async (uid: string): Promise<void> => {
  await auth.revokeRefreshTokens(uid);
  logger.info(`Tokens revocados para uid: ${uid}`);
};

// Verifica si un email ya está registrado en Firebase Authentication.
// Firebase Admin lanza `auth/user-not-found` cuando no existe; cualquier
// otro error se propaga para que el controller lo trate como interno.
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
