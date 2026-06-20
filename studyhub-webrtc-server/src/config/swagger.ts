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
| \`introduction\` | server → client | \`{ roomId, self, peers: PeerInfo[] }\` | Al recién llegado: **quién está conectado**. A los demás: **quién entra** (\`peers\` con el nuevo). Cada \`PeerInfo\` incluye \`presenting\`, así un peer que entra tarde sabe **quién ya está compartiendo pantalla**. |
| \`participant_joined\` | server → sala | \`{ id, uid?, username, avatar?, micOn, camOn }\` | Un participante entró: **ID, nombre y estado inicial AV** (para la lista de la UI). |
| \`participant_left\` | server → sala | \`{ id, uid?, username?, roomId }\` | Un participante salió: actualizar la lista de participantes activos. |
| \`signal\` | client → server | \`{ to, signal }\` | Transporta offer/answer/ICE. El server lo reenvía **sin modificar** a \`to\`. |
| \`signal\` | server → client | \`{ from, signal }\` | El mismo payload, anexando quién lo envió. |
| \`stream-started\` | client → server | \`{ }\` | El peer ya tiene su media local lista. Solo para logs/evidencia. |
| \`permissions-granted\` | client → server | \`{ audio?, video? }\` | El navegador concedió cámara/micrófono. Log \`Permisos obtenidos\`. |
| \`connection-state\` | client → server | \`{ peerUid?, peerSocketId?, state }\` | Estado de la \`RTCPeerConnection\`: \`connected\` (conexión iniciada), \`failed\` (fallo), \`disconnected\`. |
| \`connection-error\` | server → sala | \`{ uid?, peerUid?, state }\` | Un peer reportó un **fallo de conexión** WebRTC; la UI puede reflejarlo. |
| \`media-state\` | client → server | \`{ micOn?, camOn?, presenting? }\` | Estado de micrófono/cámara **y de compartir pantalla** (agregado). Se guarda en el peer y se reenvía a la sala. \`presenting: true\` al empezar a compartir pantalla, \`false\` al dejar de hacerlo. |
| \`media-state\` | server → sala | \`{ socketId, uid?, micOn, camOn, presenting }\` | Cambio de mic/cam/**compartir pantalla** de un peer. Los nuevos joiners reciben el estado (incl. \`presenting\`) en la lista \`peers\` de \`introduction\`. |
| \`camera_on\` / \`camera_off\` | client → server **y** server → sala | \`{ id, uid? }\` | Evento AV **discreto** de cámara. El front puede emitirlo o escucharlo para actualizar la UI. |
| \`mic_on\` / \`mic_off\` | client → server **y** server → sala | \`{ id, uid? }\` | Evento AV **discreto** de micrófono. El front puede emitirlo o escucharlo para actualizar la UI. |
| \`media-error\` | client → server | \`{ reason? }\` | El peer no pudo acceder a cámara/micrófono. |
| \`media-error\` | server → sala | \`{ socketId, uid?, reason }\` | Aviso a la sala del problema de medios. |
| \`peer-left\` | server → sala | \`{ socketId, uid?, roomId }\` | Un peer se desconectó; los demás cierran su conexión con él. |
| \`signal-error\` | server → client | \`{ error, message }\` | \`introduction\` sin \`roomId\` válido. |

> El cliente decide **quién inicia la oferta** comparando \`socketId\` (el mayor
> ofrece) para evitar colisiones ("glare"). El server no participa en esa
> decisión: solo reenvía.

## Transmisión multimedia y estabilidad

Aunque el **audio/video viaja P2P** (no pasa por aquí), el servidor garantiza
una sesión estable mientras hay streams activos:

- **Señalización con streams:** \`offer\`/\`answer\`/\`ICE\` se reenvían igual con o
  sin media (el relay es agnóstico al contenido).
- **Reconexión:** \`connectionStateRecovery\` recupera la sesión tras cortes
  breves (≤2 min) sin perder los \`signal\` en vuelo. El handler detecta
  \`socket.recovered\`, re-registra el peer y reavisa a la sala.
- **Estados de medios:** \`media-state\` mantiene sincronizados mic/cam entre
  todos los peers (y para los que entran después, vía \`introduction\`).

## Compartir pantalla (presentación)

Compartir pantalla **no usa eventos propios**: reutiliza la señalización WebRTC
estándar más el estado agregado \`media-state\`. El servidor sigue siendo un
**relay puro** — el video de la pantalla viaja **P2P** igual que la cámara y
**nunca** pasa por aquí.

**Flujo completo (extremo a extremo):**

1. **Captura (front).** El presentador llama \`navigator.mediaDevices.getDisplayMedia()\`
   y obtiene la pista de video de la pantalla. Si cancela el diálogo del
   navegador, no pasa nada (no se emite ningún evento).
2. **Renegociación (front, P2P).** Por cada \`RTCPeerConnection\`:
   - Si ya hay un *sender* de video (la cámara estaba activa), reemplaza la
     pista con \`sender.replaceTrack(pantalla)\` → **sin renegociación**, no se
     emiten \`signal\` nuevos.
   - Si no hay *sender* de video (cámara denegada / modo solo-audio), hace
     \`pc.addTrack(pantalla)\` → **dispara renegociación**: se intercambian
     \`offer\`/\`answer\`/\`ICE\` por el evento \`signal\` (relay normal de este server).
3. **Anuncio a la sala.** El presentador emite
   \`media-state { micOn, camOn, presenting: true }\`. El server guarda
   \`presenting\` en el \`PeerInfo\` del peer y reenvía el \`media-state\`
   (con \`presenting\`) al resto de la sala. La UI pasa de *grid* a *spotlight*
   y muestra el badge **"Presentando"**.
4. **Dejar de compartir.** Al detenerla (botón o el chrome del navegador, vía
   \`track.onended\`), el front restaura la pista de cámara con \`replaceTrack\`
   (o \`removeTrack\` si no había cámara) y emite
   \`media-state { ..., presenting: false }\` → la sala vuelve a *grid*.

**Persistencia para late-joiners.** Como \`presenting\` se almacena en el
\`PeerInfo\` en memoria, un peer que entra **después** de iniciada la
presentación recibe \`presenting: true\` del presentador dentro de la lista
\`peers\` de su \`introduction\` (y también vía \`GET /rooms\`). No necesita esperar
a un nuevo \`media-state\`.

> **Notas.** El campo \`presenting\` se difunde **solo** por el \`media-state\`
> agregado; **no** existen eventos discretos tipo \`screen_on\`/\`screen_off\`
> (a diferencia de \`camera_on\`/\`mic_on\`). El cambio de \`presenting\` **no**
> genera una línea de log propia (sí lo hacen mic/cam); su evidencia es el
> tráfico de \`signal\` y el estado expuesto en \`GET /rooms\`.

## Logs

Cada acción se registra con timestamp ISO:

\`\`\`
[ts] INFO:  Usuario conectado: <socketId>
[ts] INFO:  Reconexión: <username> (<socketId>) recuperó la sala "<roomId>"
[ts] INFO:  Introduction: <username> (<socketId>) entró a la sala "<roomId>". Conectados ahora: N
[ts] INFO:  Permisos obtenidos: <username> → cámara + micrófono
[ts] INFO:  Inicio de stream: <username> en la sala "<roomId>"
[ts] INFO:  Signal [OFFER]  reenviada: <socketIdA> → <socketIdB>
[ts] INFO:  Signal [ANSWER] reenviada: <socketIdB> → <socketIdA>
[ts] INFO:  Signal [ICE]    reenviada: <socketIdA> → <socketIdB>
[ts] INFO:  Conexión iniciada (P2P establecida): <username> ↔ <peer>
[ts] INFO:  Estado micrófono: <username> (<socketId>) → ON | OFF
[ts] INFO:  Estado cámara: <username> (<socketId>) → ON | OFF
[ts] ERROR: Fallo de conexión WebRTC: <username> ↔ <peer>
[ts] ERROR: Error multimedia: <username> — <reason>
[ts] INFO:  Usuario desconectado: <username> (<socketId>) — motivo: <reason>
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
          required: ["socketId", "username", "micOn", "camOn"],
          properties: {
            socketId: { type: "string", example: "x8Jk2bQ..." },
            uid: { type: "string", example: "abc123", nullable: true },
            username: { type: "string", example: "Juan" },
            avatar: {
              type: "string",
              example: "https://.../avatar.png",
              nullable: true,
            },
            micOn: { type: "boolean", example: true },
            camOn: { type: "boolean", example: false },
            presenting: {
              type: "boolean",
              example: false,
              description:
                "`true` si el peer está compartiendo pantalla (modo presentador).",
            },
          },
        },
      },
    },
  },
  apis: ["./src/app.ts"],
};

export const swaggerSpec = swaggerJsdoc(options);
