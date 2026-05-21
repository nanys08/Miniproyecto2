import dotenv from "dotenv";
dotenv.config();

// CORS_ORIGIN admite una sola URL o varias separadas por coma.
// Ej.: "http://localhost:5173,https://mi-frontend.vercel.app"
const parseCorsOrigin = (raw: string | undefined): string | string[] => {
  if (!raw) return "http://localhost:5173";
  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length === 1 ? list[0]! : list;
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
