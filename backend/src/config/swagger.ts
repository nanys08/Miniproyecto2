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
        "API REST del backend del Mini-proyecto 2 (Sprint 1-2). " +
        "Cubre autenticación con Firebase, gestión de perfiles, salas de " +
        "estudio y validación de username/email. " +
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
        name: "Rooms",
        description:
          "Gestión de salas de estudio. Todas las rutas requieren Firebase ID Token. " +
          "Los IDs de sala son generados automáticamente por Firestore (20 chars). " +
          "Solo el dueño (`ownerId`) puede eliminar su propia sala.",
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
        UpdateProfileRequest: {
          type: "object",
          description:
            "Body de `PATCH /api/auth/me`. Al menos uno de los tres campos " +
            "debe estar presente. Los campos inmutables (uid, email, provider, " +
            "createdAt) son ignorados aunque vengan en el body.",
          properties: {
            username: {
              type: "string",
              example: "nuevo_user",
              description:
                "Nuevo username. 4-10 caracteres, regex `^[a-zA-Z0-9_.]{4,10}$`. " +
                "Se valida unicidad contra todos los usuarios excepto el propio. " +
                "Si coincide con el username actual, la operación es idempotente.",
            },
            fullName: {
              type: "string",
              example: "Juan Pérez Actualizado",
              description: "Nuevo nombre completo. No puede ser cadena vacía.",
            },
            avatar: {
              type: "string",
              example: "/avatars/avatar3.png",
              description: "Nueva ruta o URL del avatar.",
            },
            phone: {
              type: "string",
              example: "+57 300 123 4567",
              description:
                "Teléfono opcional. Cadena vacía borra el valor. " +
                "No se valida formato en el backend.",
            },
          },
        },
        Room: {
          type: "object",
          required: ["roomId", "name", "ownerId", "accessCode", "createdAt", "participants", "isActive"],
          description:
            "Documento `rooms/{roomId}` en Firestore. " +
            "El `roomId` coincide con el ID del documento.",
          properties: {
            roomId: {
              type: "string",
              example: "aB3kXq9mZvL2wRtY",
              description: "ID único auto-generado por Firestore (20 chars).",
            },
            name: {
              type: "string",
              example: "Sala Matemáticas",
              description: "Nombre descriptivo (1-100 caracteres).",
            },
            ownerId: {
              type: "string",
              example: "abc123",
              description: "UID Firebase del creador de la sala.",
            },
            accessCode: {
              type: "string",
              example: "B6K3F2",
              description: "Código de acceso de 6 caracteres para compartir/unirse.",
            },
            createdAt: {
              type: "string",
              format: "date-time",
              description: "Fecha de creación (Firestore Timestamp serializado a ISO 8601).",
            },
            participants: {
              type: "array",
              items: { type: "string" },
              example: ["abc123"],
              description: "UIDs de participantes. El creador se incluye automáticamente.",
            },
            isActive: {
              type: "boolean",
              example: true,
              description: "`true` mientras la sala esté activa.",
            },
          },
        },
        CreateRoomRequest: {
          type: "object",
          required: ["name"],
          properties: {
            name: {
              type: "string",
              example: "Sala Matemáticas",
              description: "Nombre de la sala (1-100 caracteres). Obligatorio.",
            },
            accessCode: {
              type: "string",
              example: "B6K3F2",
              description:
                "Código de acceso pre-generado por el cliente (opcional). " +
                "Si se omite, el backend genera uno automáticamente.",
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
                "ROOM_NAME_INVALID",
                "ROOM_CODE_INVALID",
                "ROOM_NOT_FOUND",
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
