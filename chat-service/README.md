# chat-service — Backend Tiempo Real (Repositorio 2)

Servidor **WebSocket** de presencia y chat para EstudioColab, **separado** del
`room-service` (Repositorio 1).

### Servidor WebSocket (mensajería en tiempo real)

| Tarea | Qué resuelve | Dónde |
|---|---|---|
| **1** | Estructura del mensaje `{ roomId, username, content, timestamp }`. | `src/models/Message.ts` |
| **2** | Endpoint WebSocket en **`/ws/chat`**. | `src/server.ts` (`path`) |
| **3** | Recibir mensajes (`send_message` con `{ content }`). | `src/sockets/chatSocket.ts` |
| **4** | Broadcast SOLO a la sala (`io.to(roomId)`). | `src/sockets/chatSocket.ts` |
| **5** | Mensaje vacío → `EMPTY_MESSAGE`. | `src/sockets/chatSocket.ts` |
| **6** | Longitud > 500 → `MESSAGE_TOO_LONG`. | `src/models/Message.ts`, `chatSocket.ts` |
| **7** | Reconexión (mismo `uid` reemplaza sesión; `connectionStateRecovery`). | `src/sockets/chatSocket.ts`, `server.ts` |
| **8** | Salas separadas: un mensaje de A nunca llega a B. | `src/sockets/chatSocket.ts` |
| **9** | Exponer username/roomId (los entrega el room-service vía ticket + notify). | `chatTicket.ts` (Repo 1) |
| **10** | Autenticación coordinada: ticket firmado validado antes de conectar. | `src/services/ticketService.ts` |

### Persistencia de mensajes (entrega de historial)

| Tarea | Qué resuelve | Dónde |
|---|---|---|
| **Persistencia** | Cada mensaje se guarda antes de difundirse (`mensaje → guardar → broadcast`). El chat-service **delega** el guardado al room-service (no usa Firebase). | `src/services/persistenceClient.ts` |
| **Sincronización** | El broadcast usa el mensaje canónico (id + timestamp reales), así historial y mensaje en vivo coinciden. | `src/sockets/chatSocket.ts` |

### Presencia y ciclo de vida de la sala

| Tarea (entrega anterior) | Qué resuelve | Dónde |
|---|---|---|
| Comunicación WS | El room-service valida la sala e informa; al eliminarla cierra conexiones. | `src/controllers/internalController.ts` |
| Usuarios conectados | `Map<roomId, Map<username,…>>` (equivalente a `ConcurrentHashMap`). | `src/services/presenceService.ts` |
| Username único | Bloquea con `USERNAME_ALREADY_CONNECTED`. | `src/sockets/chatSocket.ts` |
| Participantes activos | `GET /participants` → `["Juan","Ana"]`. | `src/controllers/participantsController.ts` |

## Requisitos

- Node.js >= 20

## Puesta en marcha

```bash
cd chat-service
npm install
cp .env.example .env   # ajusta PORT, CORS_ORIGIN e INTERNAL_SECRET
npm run dev            # http://localhost:8081
```

Documentación Swagger: **http://localhost:8081/api/docs**

## Variables de entorno

| Variable | Default | Descripción |
|---|---|---|
| `PORT` | `8081` | Puerto del servidor (ejemplo del enunciado). |
| `WS_PATH` | `/ws/chat` | Path del endpoint WebSocket (Tarea 2). |
| `CORS_ORIGIN` | `http://localhost:5173` | Orígenes permitidos del frontend (coma-separados). |
| `INTERNAL_SECRET` | _(vacío)_ | Secreto compartido con el room-service. Firma los tickets de conexión (Tarea 10) y protege las rutas `/internal/*`. **Debe coincidir** con el del room-service. Si está vacío → modo desarrollo sin auth. |
| `ROOM_SERVICE_URL` | _(vacío)_ | URL del room-service (Repo 1) para persistir mensajes. Si está vacío, los mensajes se difunden pero NO se guardan en el historial. |

## Cómo lo consume el frontend

```ts
import { io } from "socket.io-client";

// 1) Pide al room-service entrar a la sala (valida + informa + emite ticket)
//    POST /api/rooms/:roomId/enter
//    -> { roomId, roomName, username, chatTicket }

// 2) Conecta el WebSocket al chat-service en el path /ws/chat con el ticket
const socket = io("http://localhost:8081", {
  path: "/ws/chat",                 // Tarea 2
  auth: { ticket: chatTicket },     // Tarea 10 (autenticación coordinada)
  // Socket.IO reconecta solo (Tarea 7); por defecto reconnection: true.
});

socket.on("connect_error", (err) => {
  // err.message:
  //   "AUTH_REQUIRED" / "INVALID_TICKET"        -> ticket ausente/expirado (Tarea 10)
  //   "USERNAME_ALREADY_CONNECTED"              -> nombre en uso (Tarea 8)
  //   "ROOM_CLOSED"                             -> la sala fue eliminada
});

socket.on("participants", ({ participants }) => { /* ["Juan","Ana"] */ });
socket.on("user_joined", ({ username }) => {});
socket.on("user_left", ({ username }) => {});
socket.on("room_closed", () => { /* redirigir al dashboard */ });

// Enviar mensaje (Tarea 3). El ack informa validación (Tareas 5 y 6).
socket.emit("send_message", { content: "Hola" }, (ack) => {
  // ack.ok === false -> ack.error: "EMPTY_MESSAGE" | "MESSAGE_TOO_LONG"
});
// Recibir mensaje (Tarea 1): { roomId, username, content, timestamp }
socket.on("receive_message", (msg) => {});
```

> **Modo desarrollo sin secreto:** si `INTERNAL_SECRET` está vacío, la
> autenticación por ticket se desactiva y puedes conectarte con
> `auth: { roomId, username, uid }` directamente (útil para probar con Postman/
> cliente WS sin pasar por el room-service).

## Endpoints REST

| Método | Ruta | Tarea | Descripción |
|---|---|---|---|
| `GET` | `/participants?roomId=123` | 9 | Usernames conectados ahora mismo. |
| `GET` | `/health` | — | Estado del servicio. |
| `POST` | `/internal/rooms/notify-join` | 5 | (room-service) sala validada. |
| `POST` | `/internal/rooms/notify-closed` | 5 | (room-service) sala eliminada → cerrar conexiones. |

## Pruebas

```bash
npm test
```

Cubre la gestión de presencia (Tarea 7), la unicidad de username (Tarea 8),
la lista de participantes (Tarea 9) y el cierre de sala (Tarea 5).

## Arquitectura

Ver [`docs/arquitectura.md`](docs/arquitectura.md) para los diagramas de los
flujos "usuario entra" y "sala eliminada", y el contrato entre los dos repos.
