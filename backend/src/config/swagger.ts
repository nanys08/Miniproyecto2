import swaggerJsdoc from "swagger-jsdoc";
import { env } from "./env";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "Salón de Estudio Colaborativo — Backend API",
      version: "0.1.0",
      description:
        "API REST del backend del Mini-proyecto 2 (Sprint 0). " +
        "Cubre autenticación con Firebase, gestión de perfiles y validación de username. " +
        "Los flujos de tiempo real (chat, presencia, WebRTC) se documentan aparte en docs/sockets.md.",
    },
    servers: [
      {
        url: `http://localhost:${env.port}`,
        description: "Desarrollo local",
      },
      {
        url: "https://miniproyecto2-backend.onrender.com",
        description: "Producción (Render)",
      },
    ],
    tags: [
      {
        name: "Auth",
        description:
          "Registro, perfil y validación de username. Requiere Firebase ID Token salvo cuando se indica.",
      },
      {
        name: "Health",
        description: "Endpoints de estado del servicio.",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description:
            "Firebase ID Token emitido por el cliente tras `signInWithEmailAndPassword`.",
        },
      },
      schemas: {
        User: {
          type: "object",
          required: ["uid", "username", "email", "avatar", "online"],
          properties: {
            uid: { type: "string", example: "abc123" },
            username: { type: "string", example: "juanp" },
            email: {
              type: "string",
              format: "email",
              example: "juan@gmail.com",
            },
            avatar: { type: "string", example: "avatar.png" },
            createdAt: { type: "string", format: "date-time" },
            online: { type: "boolean", example: false },
          },
        },
        RegisterRequest: {
          type: "object",
          required: ["username"],
          properties: {
            username: { type: "string", example: "juanp" },
            avatar: { type: "string", example: "avatar.png" },
          },
        },
        Error: {
          type: "object",
          properties: {
            error: { type: "string", example: "Token inválido o expirado" },
          },
        },
      },
    },
  },
  apis: ["./src/routes/*.ts", "./src/controllers/*.ts", "./src/app.ts"],
};

export const swaggerSpec = swaggerJsdoc(options);
