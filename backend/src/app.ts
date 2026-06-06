import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { env } from "./config/env";
import { swaggerSpec } from "./config/swagger";
import routes from "./routes";
import internalRoutes from "./routes/internalRoutes";

const app = express();

app.use(
  cors({
    origin: env.corsOrigin,
    credentials: true,
    // Declarar explícitamente los métodos y headers permitidos evita que
    // algunos proxies/CDNs recorten el preflight y no incluyan Authorization,
    // lo que causa que el browser omita el header en la petición real → 401.
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * @openapi
 * /health:
 *   get:
 *     tags: [Health]
 *     summary: Health check usado por Render
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

// Swagger UI — documentación OpenAPI de la API REST.
//
// Sirve el spec como endpoint JSON y configura la UI para consumirlo vía
// URL en vez de embeberlo inline. Esto evita un bug conocido de
// `swagger-ui-express@5.0.1` donde si el spec contiene `$` seguido de
// ciertos caracteres (p. ej. un backtick tras `^...{4,10}$`), su uso de
// `String.replace()` interpreta esa secuencia como una back-reference de
// regex y corta el spec, dejando la UI en blanco.
app.get("/api/docs.json", (_req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerSpec);
});
app.use(
  "/api/docs",
  swaggerUi.serve,
  swaggerUi.setup(undefined, {
    swaggerOptions: {
      url: "/api/docs.json",
    },
    customSiteTitle: "EstudioColab — API Docs",
  })
);

app.use("/api", routes);

// Rutas internas service-to-service (las llama el chat-service / Repo 2).
// Fuera de `/api` para distinguirlas del contrato público del frontend.
app.use("/internal", internalRoutes);

// Endpoint raíz informativo — útil cuando alguien abre la URL del backend
// en el navegador para verificar que está vivo y dónde está la documentación.
app.get("/", (_req, res) => {
  res.json({
    name: "miniproyecto2-backend",
    status: "ok",
    env: env.nodeEnv,
    docs: "/api/docs",
    openapi: "/api/docs.json",
    health: "/health",
  });
});

export default app;
