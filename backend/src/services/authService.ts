import { db, auth } from "../config/firebase";
import { User, USERS_COLLECTION } from "../models/User";
import { logger } from "../utils/logger";

// TS-01: Registro y persistencia de perfil en Firestore
export const registerUserProfile = async (
  uid: string,
  username: string,
  email: string,
  avatar: string = "default_avatar.png"
): Promise<User> => {
  const usernameExists = await isUsernameTaken(username);
  if (usernameExists) {
    throw new Error("El nombre de usuario ya está en uso");
  }

  const newUser: User = {
    uid,
    username,
    email,
    avatar,
    createdAt: new Date(),
    online: false,
  };

  await db.collection(USERS_COLLECTION).doc(uid).set(newUser);
  logger.info(`Usuario registrado: ${username} (${uid})`);
  return newUser;
};

// TS-01: Validación de username único
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
