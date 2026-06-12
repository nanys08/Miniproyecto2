import dotenv from "dotenv";
dotenv.config();

// CORS_ORIGIN admite una sola URL o varias separadas por coma.
// Siempre añadimos los orígenes de desarrollo local (Vite + alternativos)
// para que el frontend local funcione sin tocar la variable.
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
  // 8082 en local (3000 = room-service, 8081 = chat-service). En Render el
  // puerto lo inyecta la plataforma vía la variable PORT.
  port: parseInt(process.env.PORT || "8082", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  corsOrigin: parseCorsOrigin(process.env.CORS_ORIGIN),
};
