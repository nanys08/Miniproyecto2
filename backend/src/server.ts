/**
 * @file server — Entry point del backend.
 *
 * Levanta:
 *  - HTTP server (Express + REST + Swagger).
 *  - Socket.IO con CORS sincronizado con la API y soporte de
 *    reconexión automática (config explícita de pings).
 *
 * Manejo de errores globales:
 *  - `unhandledRejection` / `uncaughtException` quedan registrados en logs
 *    en vez de crashear silenciosamente. Render reinicia el contenedor si
 *    el proceso muere, pero queremos saber por qué.
 *  - SIGINT / SIGTERM cierran HTTP + Socket.IO ordenadamente para no
 *    dejar conexiones colgadas (Render envía SIGTERM al redeploy).
 */

import { createServer } from "http";
import { Server } from "socket.io";
import app from "./app";
import { env } from "./config/env";
import "./config/firebase"; // inicializar Firebase Admin
import { initSocket } from "./sockets/socketManager";
import { logger } from "./utils/logger";

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: env.corsOrigin,
    credentials: true,
    methods: ["GET", "POST"],
  },
  // Reconexión automática: el cliente se reconecta solo si la latencia o
  // un cierre de red corta el socket. `pingInterval`/`pingTimeout` los
  // dejamos en valores conservadores para detectar caídas rápido sin
  // saturar pings.
  pingInterval: 25_000,
  pingTimeout: 20_000,
  // En producción detrás de un proxy (Render) `websocket` puede tardar en
  // negociarse — permitir el fallback a polling evita "stuck connecting".
  transports: ["websocket", "polling"],
});

initSocket(io);

const server = httpServer.listen(env.port, () => {
  logger.info(`Servidor corriendo en http://localhost:${env.port}`);
  logger.info(`Entorno: ${env.nodeEnv}`);
  logger.info("Socket.IO listo para conexiones");
});

// ─── Manejo de errores globales ─────────────────────────────────────────────

process.on("unhandledRejection", (reason) => {
  logger.error("unhandledRejection", reason);
});
process.on("uncaughtException", (err) => {
  logger.error("uncaughtException", err);
});

// ─── Shutdown ordenado (SIGINT/SIGTERM) ────────────────────────────────────

const shutdown = (signal: string) => {
  logger.info(`Recibido ${signal}, cerrando servidor…`);
  // Disconnect avisa a los clientes para que reintenten cuando vuelva.
  io.close(() => logger.info("Socket.IO cerrado"));
  server.close((err) => {
    if (err) {
      logger.error("Error cerrando HTTP server", err);
      process.exit(1);
    }
    logger.info("HTTP server cerrado");
    process.exit(0);
  });
  // Salida de seguridad si algo se cuelga.
  setTimeout(() => {
    logger.warn("Forzando salida tras timeout de shutdown");
    process.exit(1);
  }, 10_000).unref();
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
