import express from "express";
import cors from "cors";
import { env } from "./config/env";
import routes from "./routes";

const app = express();

app.use(
  cors({
    origin: env.corsOrigin,
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check — Render lo usa para verificar que el servicio está activo
app.get("/health", (_req, res) => {
  res.json({ status: "ok", env: env.nodeEnv });
});

app.use("/api", routes);

export default app;
