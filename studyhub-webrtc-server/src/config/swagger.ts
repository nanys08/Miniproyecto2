import swaggerJsdoc from "swagger-jsdoc";
import { env } from "./env";

// OpenAPI 3.0.3 del Signaling Server WebRTC (Repositorio 3). Como OpenAPI no
// modela eventos de Socket.IO de forma nativa, documentamos el contrato de
// eventos WebSocket de forma DESCRIPTIVA (Tarea 8) además de los endpoints
// REST de diagnóstico (/health, /rooms).
const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "StudyHub — Signaling Server WebRTC",
      version: "1.0.0",
      description: `
Servidor de **señalización WebRTC** (Repositorio 3) para videollamadas,
llamadas de audio y compartir pantalla. Es un **relay puro**: reenvía
offer/answer/ICE entre navegadores; el audio/video viaja P2P y **nunca** pasa
por aquí.

## Arquitectura

\`\`\`
                room-service (Repo 1, :3000)  — salas, auth, chat persistente
Frontend ──────  chat-service  (Repo 2, :8081) — mensajería en tiempo real
   │
   └── Socket.IO ──▶ signaling-server (Repo 3, :${env.port})  ◀── este servicio
            (offer / answer / ICE)         relay puro de señalización
\`\`\`

## Conexión (Tarea 2)

Socket.IO en el path por defecto (\`/socket.io\`):

\`\`\`js
import { io } from "socket.io-client";
const socket = io("http://localhost:${env.port}");

socket.on("connect", () => {
  socket.emit("introduction", { roomId: "MATH-7GBK", uid, username, avatar });
});
\`\`\`

## Estructura de salas/peers (Tarea 3)

\`\`\`js
rooms = {
  "MATH-7GBK": Map {
    "socketIdA" => { socketId, uid, username, avatar },
    "socketIdB" => { ... }
  }
}
\`\`\`

## Eventos WebSocket

| Evento | Dirección | Payload | Comportamiento |
|---|---|---|---|
| \`introduction\` | client → server | \`{ roomId, uid?, username?, avatar? }\` | **Tarea 4.** El peer entra a la sala y se presenta. |
| \`introduction\` | server → client | \`{ roomId, self, peers: PeerInfo[] }\` | Al recién llegado: **quién está conectado**. A los demás: **quién entra** (\`peers\` con el nuevo). |
| \`signal\` | client → server | \`{ to, signal }\` | **Tarea 5.** Transporta offer/answer/ICE. El server lo reenvía **sin modificar** a \`to\`. |
| \`signal\` | server → client | \`{ from, signal }\` | El mismo payload, anexando quién lo envió. |
| \`peer-left\` | server → sala | \`{ socketId, uid?, roomId }\` | **Tarea 6.** Un peer se desconectó; los demás cierran su conexión con él. |
| \`signal-error\` | server → client | \`{ error, message }\` | \`introduction\` sin \`roomId\` válido. |

> El cliente decide **quién inicia la oferta** comparando \`socketId\` (el mayor
> ofrece) para evitar colisiones ("glare"). El server no participa en esa
> decisión: solo reenvía.

## Logs (Tarea 7)

Cada acción se registra con timestamp ISO:

\`\`\`
[ts] INFO: Usuario conectado: <socketId>
[ts] INFO: Introduction: <username> (<socketId>) entró a la sala "<roomId>". Conectados ahora: N
[ts] INFO: Signal [OFFER] reenviada: <socketIdA> → <socketIdB>
[ts] INFO: Signal [ANSWER] reenviada: <socketIdB> → <socketIdA>
[ts] INFO: Signal [ICE] reenviada: <socketIdA> → <socketIdB>
[ts] INFO: Usuario desconectado: <username> (<socketId>) — motivo: <reason>
\`\`\`
`,
    },
    servers: [
      { url: `http://localhost:${env.port}`, description: "Desarrollo local" },
    ],
    tags: [
      {
        name: "Diagnóstico",
        description:
          "Endpoints REST de solo lectura para inspeccionar el estado del " +
          "servicio (health y salas/peers activos en memoria).",
      },
    ],
    components: {
      schemas: {
        PeerInfo: {
          type: "object",
          description:
            "Datos de un peer presente en una sala (Tarea 3). El audio/video " +
            "no pasa por aquí; solo se usa para la señalización y el grid.",
          required: ["socketId", "username"],
          properties: {
            socketId: { type: "string", example: "x8Jk2bQ..." },
            uid: { type: "string", example: "abc123", nullable: true },
            username: { type: "string", example: "Juan" },
            avatar: {
              type: "string",
              example: "https://.../avatar.png",
              nullable: true,
            },
          },
        },
      },
    },
  },
  apis: ["./src/app.ts"],
};

export const swaggerSpec = swaggerJsdoc(options);
