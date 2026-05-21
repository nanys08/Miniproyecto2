import dotenv from "dotenv";
dotenv.config();

// CORS_ORIGIN admite una sola URL o varias separadas por coma.
// Ej.: "http://localhost:5173,https://mi-frontend.vercel.app"
//
// Para que el dev local funcione contra el deploy de producción sin tener
// que tocar la variable en Render, SIEMPRE agregamos los orígenes locales
// (Vite + alternativos) a la lista permitida.
const LOCAL_DEV_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

const parseCorsOrigin = (raw: string | undefined): string[] => {
  const explicit = (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const merged = [...new Set([...LOCAL_DEV_ORIGINS, ...explicit])];
  return merged.length > 0 ? merged : LOCAL_DEV_ORIGINS;
};

export const env = {
  port: parseInt(process.env.PORT || "3000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  corsOrigin: parseCorsOrigin(process.env.CORS_ORIGIN),
  firebase: {
    apiKey: process.env.FIREBASE_API_KEY!,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN!,
    projectId: process.env.FIREBASE_PROJECT_ID!,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET!,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID!,
    appId: process.env.FIREBASE_APP_ID!,
  },
  firebaseAdmin: {
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID!,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
    // Normaliza el formato para que funcione tanto si Render guarda el valor
    // con `\n` literales como con saltos de línea reales, y con o sin las
    // comillas dobles envolventes que a veces se copian del .env.
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY
      ?.replace(/^"|"$/g, "")
      .replace(/\\n/g, "\n"),
  },
};
