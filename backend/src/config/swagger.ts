import swaggerJsdoc from "swagger-jsdoc";
import { env } from "./env";

// Configuración OpenAPI 3.0.3 — la fuente de verdad de la documentación API.
//
// Cómo se compone:
//   - Esquemas globales (User, RegisterRequest, Error, etc.) viven aquí.
//   - Las rutas se documentan inline con bloques `@openapi` en `src/routes/*.ts`
//     y `src/controllers/*.ts`, y swagger-jsdoc los une al spec final.
//
// Cualquier cambio funcional en endpoints, payloads o códigos de error DEBE
// reflejarse aquí o en el comentario @openapi del handler correspondiente.
const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "Salón de Estudio Colaborativo — Backend API",
      version: "1.0.0",
      description:
        "API REST del backend del Mini-proyecto 2 (Sprint 1). " +
        "Cubre autenticación con Firebase, gestión de perfiles, validación de " +
        "username (incluyendo lista negra de palabras prohibidas) y " +
        "comprobación de correo electrónico. " +
        "Los flujos de tiempo real (chat, presencia, WebRTC) se documentan " +
        "aparte en `docs/sockets.md`.",
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
          "Registro, perfil y validación de username/email. " +
          "Requiere Firebase ID Token salvo cuando se indica `(público)`. " +
          "Nota: el login NO es un endpoint REST — vive en el cliente con " +
          "`signInWithEmailAndPassword` / `signInWithPopup` del SDK de Firebase. " +
          "El backend solo verifica los ID Tokens emitidos por el cliente.",
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
            "Firebase ID Token emitido por el cliente tras " +
            "`signInWithEmailAndPassword` o `signInWithPopup`. " +
            "Se valida con `auth.verifyIdToken(token, true)` " +
            "(`checkRevoked: true` para reflejar logouts forzados).",
        },
      },
      schemas: {
        AuthProvider: {
          type: "string",
          enum: ["password", "google"],
          description: "Mecanismo con que el usuario inició sesión.",
        },
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
          description:
            "Documento `users/{uid}` en Firestore. Ver `docs/firestore-model.md`. " +
            "Las respuestas REST pueden incluir el campo derivado `isUnivalle` " +
            "(no persistido).",
          properties: {
            uid: {
              type: "string",
              example: "abc123",
              description: "Firebase Auth UID. Coincide con el ID del documento.",
            },
            username: {
              type: "string",
              example: "juanp",
              description: "Único en la colección. 4-10 chars, regex `^[a-zA-Z0-9_.]{4,10}$`.",
            },
            fullName: { type: "string", example: "Juan Pérez" },
            email: {
              type: "string",
              format: "email",
              example: "juan@correounivalle.edu.co",
              description: "Tomado del Firebase ID Token, no del body.",
            },
            avatar: { type: "string", example: "/avatars/avatar1.png" },
            provider: { $ref: "#/components/schemas/AuthProvider" },
            createdAt: {
              type: "string",
              format: "date-time",
              description: "Firestore Timestamp serializado a ISO 8601.",
            },
            online: { type: "boolean", example: false },
            isUnivalle: {
              type: "boolean",
              example: true,
              description:
                "**Derivado, no persistido.** `true` si el correo " +
                "pertenece a `@correounivalle.edu.co`. Se calcula al vuelo " +
                "desde el email del ID Token en las respuestas de `/me` y " +
                "`/register`.",
            },
            university: {
              type: "string",
              enum: ["Univalle", "No identificado"],
              example: "Univalle",
              description:
                "**Derivado, no persistido.** Etiqueta humana lista para " +
                "mostrar en el campo `Universidad` del perfil del usuario. " +
                "Vale `\"Univalle\"` si `isUnivalle` es `true`, " +
                "`\"No identificado\"` en otro caso.",
            },
          },
        },
        UnivalleResponse: {
          type: "object",
          required: ["isUnivalle", "domain", "university"],
          description:
            "Respuesta del endpoint `is-univalle`. `domain` y `university` " +
            "se devuelven como referencia para que el frontend no tenga " +
            "que hardcodearlos.",
          properties: {
            isUnivalle: { type: "boolean", example: true },
            domain: { type: "string", example: "correounivalle.edu.co" },
            university: {
              type: "string",
              enum: ["Univalle", "No identificado"],
              example: "Univalle",
            },
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
                "4-10 caracteres, solo letras, números, punto y guion bajo " +
                "(regex `^[a-zA-Z0-9_.]{4,10}$`). Se rechaza si contiene " +
                "palabras de la lista negra (ver `USERNAME_FORBIDDEN`).",
            },
            fullName: { type: "string", example: "Juan Pérez" },
            provider: { $ref: "#/components/schemas/AuthProvider" },
            avatar: {
              type: "string",
              example: "/avatars/avatar1.png",
              description: "URL/ruta opcional. Default: `default_avatar.png`.",
            },
          },
        },
        CheckResponse: {
          type: "object",
          required: ["available"],
          description:
            "Respuesta de los endpoints `check-username` y `check-email`. " +
            "Para check-username, las palabras prohibidas se reportan como " +
            "`available: false` (no como error), por compatibilidad con el " +
            "frontend.",
          properties: {
            available: { type: "boolean", example: true },
          },
        },
        Error: {
          type: "object",
          required: ["error", "message"],
          description:
            "Forma estable de los errores del backend. El frontend toma " +
            "decisiones con `error` (código); muestra `message` o lo " +
            "traduce con su propio i18n.",
          properties: {
            error: {
              type: "string",
              enum: [
                "MISSING_TOKEN",
                "INVALID_TOKEN",
                "MISSING_FIELDS",
                "USERNAME_INVALID",
                "USERNAME_FORBIDDEN",
                "PROVIDER_INVALID",
                "EMAIL_INVALID",
                "USERNAME_ALREADY_EXISTS",
                "EMAIL_ALREADY_EXISTS",
                "PROFILE_ALREADY_EXISTS",
                "PROFILE_NOT_FOUND",
                "INTERNAL_ERROR",
              ],
              example: "USERNAME_ALREADY_EXISTS",
              description:
                "Código estable y legible por máquina. El frontend lo " +
                "usa para i18n y para decidir el flujo (p. ej. mostrar " +
                "el formulario de username tras un 404).",
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
      responses: {
        Unauthorized: {
          description: "Token ausente o inválido.",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
              examples: {
                missingToken: {
                  value: {
                    error: "MISSING_TOKEN",
                    message: "Token de autorización requerido",
                  },
                },
                invalidToken: {
                  value: {
                    error: "INVALID_TOKEN",
                    message: "Token inválido o expirado",
                  },
                },
              },
            },
          },
        },
        InternalError: {
          description:
            "Error interno del servidor. El detalle queda en logs; el " +
            "cliente solo recibe el código.",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
              example: {
                error: "INTERNAL_ERROR",
                message: "Error interno del servidor",
              },
            },
          },
        },
      },
    },
  },
  apis: ["./src/routes/*.ts", "./src/controllers/*.ts", "./src/app.ts"],
};

export const swaggerSpec = swaggerJsdoc(options);
