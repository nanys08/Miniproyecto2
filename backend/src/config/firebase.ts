/**
 * @file firebase — Inicialización del SDK de Firebase Admin (backend-only).
 *
 * Exporta dos handles tipados:
 *  - `db`   → Firestore (lectura/escritura del modelo `users/`, etc.).
 *  - `auth` → Firebase Authentication Admin (verificar ID Tokens, revocar
 *    refresh tokens, lookups por email).
 *
 * Credenciales:
 *  - Si `FIREBASE_ADMIN_CLIENT_EMAIL` y `FIREBASE_ADMIN_PRIVATE_KEY` están
 *    presentes, usa `credential.cert(...)` (Render / prod).
 *  - Si faltan, cae a `applicationDefault()` (típico en Cloud Run / GCE
 *    o cuando hay `GOOGLE_APPLICATION_CREDENTIALS` apuntando a un JSON).
 */

import * as admin from "firebase-admin";
import type { Auth } from "firebase-admin/auth";
import { env } from "./env";

if (!admin.apps.length) {
  const credential =
    env.firebaseAdmin.clientEmail && env.firebaseAdmin.privateKey
      ? admin.credential.cert({
          projectId: env.firebaseAdmin.projectId,
          clientEmail: env.firebaseAdmin.clientEmail,
          privateKey: env.firebaseAdmin.privateKey,
        })
      : admin.credential.applicationDefault();

  admin.initializeApp({
    credential,
    projectId: env.firebaseAdmin.projectId || env.firebase.projectId,
  });

  console.log("✓ Firebase Admin SDK inicializado");
}

/** Cliente Firestore. Operaciones sobre la colección `users/` y futuras. */
export const db: FirebaseFirestore.Firestore = admin.firestore();

/** Cliente Firebase Auth Admin. `verifyIdToken`, `getUserByEmail`, etc. */
export const auth: Auth = admin.auth();

export default admin;
