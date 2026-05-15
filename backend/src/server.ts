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
  },
});

initSocket(io);

httpServer.listen(env.port, () => {
  logger.info(`Servidor corriendo en http://localhost:${env.port}`);
  logger.info(`Entorno: ${env.nodeEnv}`);
  logger.info(`Socket.IO listo para conexiones`);
});
