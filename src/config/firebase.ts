import * as admin from "firebase-admin";
import type { Auth } from "firebase-admin/auth";
import { env } from "./env";

// Inicializar Firebase Admin SDK (uso exclusivo del backend)
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

export const db: FirebaseFirestore.Firestore = admin.firestore();
export const auth: Auth = admin.auth();
export default admin;
