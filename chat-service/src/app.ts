import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { env } from "./config/env";
import { swaggerSpec } from "./config/swagger";
import participantsRoutes from "./routes/participantsRoutes";
import internalRoutes from "./routes/internalRoutes";

const app = express();

app.use(
  cors({
    origin: env.corsOrigin,
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-Internal-Secret"],
  })
);
app.use(express.json());

/**
 * @openapi
 * /health:
 *   get:
 *     tags: [Health]
 *     summary: Health check del chat-service
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

// Swagger UI — mismo patrón que el room-service (spec servido por URL para
// evitar el bug de back-references de swagger-ui-express@5).
app.get("/api/docs.json", (_req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerSpec);
});
app.use(
  "/api/docs",
  swaggerUi.serve,
  swaggerUi.setup(undefined, {
    swaggerOptions: { url: "/api/docs.json" },
    customSiteTitle: "EstudioColab — Chat Service Docs",
  })
);

// Rutas REST públicas (Tarea 9) e internas (Tarea 5).
app.use("/", participantsRoutes);
app.use("/internal", internalRoutes);

app.get("/", (_req, res) => {
  res.json({
    name: "chat-service",
    role: "Backend Tiempo Real (Repositorio 2)",
    status: "ok",
    env: env.nodeEnv,
    docs: "/api/docs",
    participants: "/participants?roomId=<id>",
  });
});

export default app;
