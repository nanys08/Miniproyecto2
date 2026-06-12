import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { env } from "./config/env";
import { swaggerSpec } from "./config/swagger";
import { getRoomsSnapshot } from "./sockets/signaling";

const app = express();

app.use(
  cors({
    origin: env.corsOrigin,
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);
app.use(express.json());

/**
 * @openapi
 * /health:
 *   get:
 *     tags: [Diagnóstico]
 *     summary: Health check del signaling server
 *     responses:
 *       200:
 *         description: Servicio activo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: ok }
 *                 env: { type: string, example: development }
 */
app.get("/health", (_req, res) => {
  res.json({ status: "ok", env: env.nodeEnv });
});

/**
 * @openapi
 * /rooms:
 *   get:
 *     tags: [Diagnóstico]
 *     summary: Salas y peers activos (estado en memoria, Tarea 3)
 *     description: >
 *       Foto en vivo de la estructura `rooms`. Útil como evidencia de que la
 *       señalización registra/limpia peers en introduction y disconnect.
 *     responses:
 *       200:
 *         description: Mapa de roomId → lista de peers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/PeerInfo'
 */
app.get("/rooms", (_req, res) => {
  res.json(getRoomsSnapshot());
});

// Swagger UI — spec servido por URL (evita el bug de back-references de
// swagger-ui-express@5), mismo patrón que el chat-service y el room-service.
app.get("/api/docs.json", (_req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerSpec);
});
app.use(
  "/api/docs",
  swaggerUi.serve,
  swaggerUi.setup(undefined, {
    swaggerOptions: { url: "/api/docs.json" },
    customSiteTitle: "StudyHub — WebRTC Signaling Docs",
  })
);

app.get("/", (_req, res) => {
  res.json({
    name: "studyhub-webrtc-server",
    role: "Signaling Server WebRTC (Repositorio 3)",
    status: "ok",
    env: env.nodeEnv,
    docs: "/api/docs",
    rooms: "/rooms",
  });
});

export default app;
