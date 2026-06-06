/**
 * @file server — Entry point del chat-service (Repositorio 2, Tarea 6).
 *
 * Levanta:
 *  - HTTP server (Express): /participants, /internal/*, /health, /api/docs.
 *  - Socket.IO en el mismo puerto (8081 por defecto) para la presencia/chat.
 */

import { createServer } from "http";
import { Server } from "socket.io";
import app from "./app";
import { env } from "./config/env";
import { initChatSocket } from "./sockets/chatSocket";
import { logger } from "./utils/logger";

const httpServer = createServer(app);

const io = new Server(httpServer, {
  // Tarea 2 — endpoint WebSocket en /ws/chat (en vez del default /socket.io).
  path: env.wsPath,
  cors: {
    origin: env.corsOrigin,
    credentials: true,
    methods: ["GET", "POST"],
  },
  // Tarea 7 — reconexión: pings conservadores para detectar caídas rápido.
  // El cliente Socket.IO reintenta automáticamente; el servidor acepta el
  // nuevo handshake y, si es el mismo uid, reemplaza la sesión anterior.
  pingInterval: 25_000,
  pingTimeout: 20_000,
  // `connectionStateRecovery` permite recuperar el estado de la sesión (y los
  // mensajes perdidos durante una desconexión breve) al reconectar.
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: false,
  },
  transports: ["websocket", "polling"],
});

initChatSocket(io);

const server = httpServer.listen(env.port, () => {
  logger.info(`chat-service corriendo en http://localhost:${env.port}`);
  logger.info(`Entorno: ${env.nodeEnv}`);
  logger.info(
    `WebSocket listo en ws://localhost:${env.port}${env.wsPath} (presencia + chat)`
  );
});

process.on("unhandledRejection", (reason) => {
  logger.error("unhandledRejection", reason);
});
process.on("uncaughtException", (err) => {
  logger.error("uncaughtException", err);
});

const shutdown = (signal: string) => {
  logger.info(`Recibido ${signal}, cerrando chat-service…`);
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
