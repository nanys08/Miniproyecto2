import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  browserLocalPersistence,
  setPersistence,
  type Auth,
} from "firebase/auth";

const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;

// Considera "configurado" solo si las claves no están vacías ni son los placeholders del .env.example
export const firebaseConfigured: boolean =
  !!apiKey &&
  !!projectId &&
  apiKey !== "your_api_key" &&
  projectId !== "your_project_id";

let firebaseApp: FirebaseApp | null = null;
let authInstance: Auth | null = null;

if (firebaseConfigured) {
  firebaseApp = initializeApp({
    apiKey,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  });
  authInstance = getAuth(firebaseApp);
  void setPersistence(authInstance, browserLocalPersistence);
} else {
  console.warn(
    "[firebase] Configuración ausente o con placeholders. App corriendo en MODO DEMO. " +
      "Crea frontend/.env con VITE_FIREBASE_* reales para activar autenticación real."
  );
}

export { firebaseApp };

// Helper: solo devuelve auth si está realmente configurado.
// El resto del código que dependa de Firebase debe verificar firebaseConfigured antes.
export function getAuthOrThrow(): Auth {
  if (!authInstance) {
    throw new Error(
      "Firebase no está configurado. Define las variables VITE_FIREBASE_* en frontend/.env."
    );
  }
  return authInstance;
}

// Backwards-compat: el resto del código importa `auth` directamente.
// En modo demo es null; los servicios que lo usan ya están protegidos por firebaseConfigured.
export const auth: Auth | null = authInstance;
