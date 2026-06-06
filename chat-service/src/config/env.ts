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
  // El ejemplo del profesor usa 8081 para el chat-server.
  port: parseInt(process.env.PORT || "8081", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  corsOrigin: parseCorsOrigin(process.env.CORS_ORIGIN),
  /**
   * Ruta del endpoint WebSocket (Tarea 2). El cliente debe conectarse con
   * `io(url, { path: "/ws/chat" })`. Configurable por si el deploy lo necesita.
   */
  wsPath: process.env.WS_PATH || "/ws/chat",
  /**
   * Secreto compartido con el room-service para autenticar las llamadas
   * internas (notify-join / room-closed) y firmar los tickets. Si está vacío
   * en desarrollo, el middleware interno deja pasar pero registra advertencia.
   */
  internalSecret: process.env.INTERNAL_SECRET || "",
  /**
   * URL del room-service (Repositorio 1). El chat-service le delega la
   * persistencia de mensajes (Tarea 6) en `POST /internal/rooms/:id/messages`.
   * Si está vacío, el chat-service sigue difundiendo pero NO persiste (modo
   * degradado / desarrollo).
   */
  roomServiceUrl: process.env.ROOM_SERVICE_URL || "",
};
