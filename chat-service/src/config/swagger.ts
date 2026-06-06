import swaggerJsdoc from "swagger-jsdoc";
import { env } from "./env";

// OpenAPI 3.0.3 del chat-service (Repositorio 2). Documenta el endpoint REST
// de participantes (Tarea 9), las rutas internas service-to-service (Tarea 5)
// y, de forma descriptiva, los eventos WebSocket (Tareas 6-8).
const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "EstudioColab — Chat Service (Backend Tiempo Real)",
      version: "1.0.0",
      description: `
Servidor **WebSocket** de presencia y chat (Repositorio 2), separado del
**room-service** (Repositorio 1).

## Arquitectura

\`\`\`
Frontend ──REST──▶ room-service (Repo 1)  ──valida sala──▶ Firestore
   │                     │  emite ticket firmado (Tarea 10)
   │                     └──informa (HTTP interno)──▶ chat-service (Repo 2)
   │                                                        │
   └────────── WebSocket  ${env.wsPath}  (puerto ${env.port}) ─────────┘
\`\`\`

## Endpoint WebSocket (Tarea 2)

Conexión:

\`\`\`js
io("http://localhost:${env.port}", {
  path: "${env.wsPath}",
  auth: { ticket }   // ticket emitido por POST /api/rooms/:id/enter del room-service
});
\`\`\`

## Estructura del mensaje (Tarea 1)

\`\`\`json
{ "roomId": "123", "username": "Juan", "content": "Hola", "timestamp": "2026-06-01T15:00:00.000Z" }
\`\`\`

## Eventos WebSocket

| Evento | Dirección | Payload | Comportamiento |
|---|---|---|---|
| (handshake) | client → server | \`auth: { ticket }\` | Tarea 10: valida el ticket firmado. Rechaza con \`AUTH_REQUIRED\` / \`INVALID_TICKET\` / \`USERNAME_ALREADY_CONNECTED\`. |
| \`send_message\` | client → server (ack) | \`{ content }\` | Valida vacío (\`EMPTY_MESSAGE\`) y longitud >500 (\`MESSAGE_TOO_LONG\`); **persiste** (vía room-service) y difunde a la sala. Ack \`{ ok, data: ChatMessage, persisted }\`. |
| \`receive_message\` | server → sala | \`ChatMessage\` | Mensaje canónico nuevo, SOLO a la sala (Tareas 4 y 8). |
| \`user_joined\` | server → sala | \`{ roomId, username, uid?, avatar? }\` | Un usuario se conectó. |
| \`user_left\` | server → sala | \`{ roomId, username }\` | Un usuario se desconectó. |
| \`participants\` | server → sala | \`{ roomId, participants: string[], members: { username, uid?, avatar? }[] }\` | Lista actualizada de conectados (\`members\` incluye uid+avatar para el grid). |
| \`room_closed\` | server → sala | \`{ roomId, error: ROOM_CLOSED }\` | El room-service eliminó la sala; el socket se desconecta. |

## Reconexión (Tarea 7)

El cliente Socket.IO reintenta solo. El servidor acepta el nuevo handshake y, si
es el mismo \`uid\`, **reemplaza** la sesión anterior en vez de rechazarla como
duplicado. \`connectionStateRecovery\` recupera mensajes perdidos en cortes breves.

## Historias de usuario cubiertas

| Historia | Cómo se cubre aquí |
|---|---|
| **US-10 — Mensajería Instantánea** | Evento \`send_message\` → broadcast \`receive_message\` a todos los presentes de la sala en tiempo real (auto-scroll en el frontend). |
| **US-11 — Historial de Chat** | Cada mensaje se **persiste** (vía room-service) antes de difundirse, para que el historial (\`GET /rooms/{id}/messages\` del Repo 1) cargue el contexto al reconectar. |

## Errores

Esquema **uniforme** \`{ success: false, error: <CODE>, message }\`.
`,
    },
    servers: [
      { url: `http://localhost:${env.port}`, description: "Desarrollo local" },
    ],
    tags: [
      {
        name: "Participantes",
        description:
          "Foto en vivo de quién está conectado a una sala (Tarea 9). " +
          "Lectura pública para el frontend.",
      },
      {
        name: "Interno",
        description:
          "Rutas service-to-service que usa el room-service para informar al " +
          "WebSocket (Tarea 5). Requieren el header `X-Internal-Secret`.",
      },
      { name: "Health", description: "Estado del servicio." },
    ],
    components: {
      schemas: {
        ChatMessage: {
          type: "object",
          description:
            "Mensaje de chat difundido (Tarea 1). Incluye el modelo del " +
            "enunciado (`messageId`, `roomId`, `username`, `content`, " +
            "`timestamp`) más alias de compatibilidad con el frontend actual " +
            "(`id`, `senderUsername`, `createdAt`).",
          required: ["messageId", "roomId", "username", "content", "timestamp"],
          properties: {
            messageId: { type: "string", example: "aB3kXq9mZvL2wRtY" },
            id: { type: "string", example: "aB3kXq9mZvL2wRtY", description: "Alias de messageId." },
            roomId: { type: "string", example: "123" },
            username: { type: "string", example: "Juan" },
            senderUsername: { type: "string", example: "Juan", description: "Alias de username." },
            senderUid: { type: "string", example: "abc123", nullable: true },
            content: { type: "string", example: "Hola" },
            timestamp: {
              type: "string",
              format: "date-time",
              example: "2026-06-01T15:00:00.000Z",
            },
            createdAt: {
              type: "string",
              format: "date-time",
              example: "2026-06-01T15:00:00.000Z",
              description: "Alias de timestamp.",
            },
            type: { type: "string", enum: ["text", "system"], example: "text" },
          },
        },
        Error: {
          type: "object",
          required: ["success", "error", "message"],
          description:
            "Forma uniforme de error (accesibilidad/UX): `success: false` + " +
            "código estable + mensaje claro en español.",
          properties: {
            success: { type: "boolean", enum: [false], example: false },
            error: {
              type: "string",
              enum: [
                "MISSING_FIELDS",
                "USERNAME_ALREADY_CONNECTED",
                "ROOM_CLOSED",
                "EMPTY_MESSAGE",
                "MESSAGE_TOO_LONG",
                "AUTH_REQUIRED",
                "INVALID_TICKET",
                "UNAUTHORIZED_INTERNAL",
                "INTERNAL_ERROR",
              ],
              example: "USERNAME_ALREADY_CONNECTED",
            },
            message: {
              type: "string",
              example: "Ese nombre de usuario ya está conectado en la sala",
            },
          },
        },
      },
    },
  },
  apis: ["./src/routes/*.ts", "./src/app.ts"],
};

export const swaggerSpec = swaggerJsdoc(options);
