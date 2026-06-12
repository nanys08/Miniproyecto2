/**
 * @file server — Entry point del Signaling Server WebRTC (Repositorio 3).
 *
 * Levanta:
 *  - HTTP server (Express): /health, /rooms, /api/docs.
 *  - Socket.IO en el mismo puerto (8082 por defecto) para la señalización
 *    WebRTC (introduction / signal / disconnect).
 */

import { createServer } from "http";
import { Server } from "socket.io";
import app from "./app";
import { env } from "./config/env";
import { initSignaling } from "./sockets/signaling";
import { logger } from "./utils/logger";

const httpServer = createServer(app);

// Tarea 2 — Socket.IO sobre el mismo servidor HTTP, con CORS configurado.
// Path por defecto (/socket.io), como el ejemplo del profesor `new Server(server)`.
const io = new Server(httpServer, {
  cors: {
    origin: env.corsOrigin,
    credentials: true,
    methods: ["GET", "POST"],
  },
  // El cliente Socket.IO reintenta solo; aceptamos websocket y polling como
  // fallback (algunos proxies de Render tardan en negociar websocket en frío).
  transports: ["websocket", "polling"],
  // Tarea 2 — Reconexión estable: ante un corte breve (cambio de red, túnel,
  // suspensión), el cliente recupera la MISMA sesión sin perder los `signal`
  // en vuelo. `socket.recovered` lo detecta en el handler de conexión.
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true,
  },
  // Pings algo más frecuentes para detectar caídas reales con rapidez.
  pingInterval: 25_000,
  pingTimeout: 20_000,
});

initSignaling(io);

const server = httpServer.listen(env.port, () => {
  logger.info(`signaling-server corriendo en http://localhost:${env.port}`);
  logger.info(`Entorno: ${env.nodeEnv}`);
  logger.info(`Swagger en http://localhost:${env.port}/api/docs`);
  logger.info(
    `WebSocket de señalización listo en ws://localhost:${env.port} (introduction / signal / disconnect)`
  );
});

process.on("unhandledRejection", (reason) => {
  logger.error("unhandledRejection", reason);
});
process.on("uncaughtException", (err) => {
  logger.error("uncaughtException", err);
});

const shutdown = (signal: string) => {
  logger.info(`Recibido ${signal}, cerrando signaling-server…`);
  io.close(() => logger.info("WebSocket cerrado"));
  server.close((err) => {
    if (err) {
      logger.error("Error cerrando HTTP server", err);
      process.exit(1);
    }
    logger.info("HTTP server cerrado");
    process.exit(0);
  });
  setTimeout(() => {
    logger.warn("Forzando salida tras timeout de shutdown");
    process.exit(1);
  }, 10_000).unref();
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
