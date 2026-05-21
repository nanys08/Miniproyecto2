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
          required: [
            "uid",
            "username",
            "fullName",
            "email",
            "avatar",
            "provider",
            "online",
          ],
          properties: {
            uid: { type: "string", example: "abc123" },
            username: { type: "string", example: "juanp" },
            fullName: { type: "string", example: "Juan Pérez" },
            email: {
              type: "string",
              format: "email",
              example: "juan@gmail.com",
            },
            avatar: { type: "string", example: "avatar.png" },
            provider: {
              type: "string",
              enum: ["password", "google"],
              example: "password",
            },
            createdAt: { type: "string", format: "date-time" },
            online: { type: "boolean", example: false },
          },
        },
        RegisterRequest: {
          type: "object",
          required: ["username", "fullName", "provider"],
          properties: {
            username: {
              type: "string",
              example: "juanp",
              description:
                "3-20 caracteres, solo letras, números y guion bajo",
            },
            fullName: { type: "string", example: "Juan Pérez" },
            provider: {
              type: "string",
              enum: ["password", "google"],
              example: "password",
            },
            avatar: { type: "string", example: "avatar.png" },
          },
        },
        Error: {
          type: "object",
          required: ["error", "message"],
          properties: {
            error: {
              type: "string",
              enum: [
                "MISSING_TOKEN",
                "INVALID_TOKEN",
                "MISSING_FIELDS",
                "USERNAME_INVALID",
                "PROVIDER_INVALID",
                "USERNAME_ALREADY_EXISTS",
                "PROFILE_ALREADY_EXISTS",
                "PROFILE_NOT_FOUND",
                "INTERNAL_ERROR",
              ],
              example: "USERNAME_ALREADY_EXISTS",
              description:
                "Código estable y legible por máquina. El frontend lo usa para i18n y para decidir el flujo (p. ej. mostrar el formulario de username).",
            },
            message: {
              type: "string",
              example: "El nombre de usuario ya está en uso",
              description:
                "Mensaje humano en español, apto para mostrar al usuario.",
            },
          },
        },
      },
    },
  },
  apis: ["./src/routes/*.ts", "./src/controllers/*.ts", "./src/app.ts"],
};

export const swaggerSpec = swaggerJsdoc(options);
