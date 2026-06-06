# Arquitectura — Backend Tiempo Real (Repositorio 2)

Evidencia de la **Tarea 5** (diagrama de arquitectura) y referencia del contrato
entre los dos backends.

## Visión general: dos servicios separados

| Repositorio | Servicio | Puerto | Responsabilidad |
|---|---|---|---|
| **Repo 1** | `room-service` (`backend/`) | 3000 | REST + Firestore. Crea/valida/elimina salas, auth Firebase, persistencia de mensajes. |
| **Repo 2** | `chat-service` (`chat-service/`) | 8081 | WebSocket. Presencia en vivo, unicidad de username, participantes activos. |

El `chat-service` **no** habla con Firestore ni valida tokens Firebase: confía
en que el `room-service` ya validó la sala y la membresía antes de "informar al
WebSocket".

## Flujo 1 — Un usuario entra a una sala

```
┌──────────┐   1. POST /api/rooms/:id/enter      ┌──────────────┐
│ Frontend │ ──────────────────────────────────▶ │ room-service │
└──────────┘   (Authorization: Bearer <token>)   │   (Repo 1)   │
     │                                            └──────┬───────┘
     │                                  2. valida sala + membresía (Firestore)
     │                                  + emite TICKET firmado (Tarea 10)
     │                            3. informa al WebSocket │ POST /internal/rooms/notify-join
     │                                                   ▼
     │                                            ┌──────────────┐
     │   4. { roomId, roomName,   ◀───────────────│ chat-service │
     │        username, chatTicket }              │   (Repo 2)   │
     │                                            └──────┬───────┘
     │   5. WebSocket connect  /ws/chat                  │ marca sala activa
     │      auth:{ ticket }                              │
     └─────────────────────────────────────────────────▶│ verifica ticket (Tarea 10)
                                                          │ valida username único (Tarea 8)
                                                          │ registra presencia (Tarea 7)
                       6. user_joined / participants ◀────┘ broadcast SOLO a la sala (Tareas 4 y 8)
```

## Flujo 2 — Se elimina una sala

```
┌──────────┐   1. DELETE /api/rooms/:id    ┌──────────────┐
│ Frontend │ ────────────────────────────▶ │ room-service │
└──────────┘                               │   (Repo 1)   │
                                           └──────┬───────┘
                              2. borra sala + mensajes (Firestore)
                                                  │
                       3. notifica al WebSocket   │ POST /internal/rooms/notify-closed
                                                  ▼
                                           ┌──────────────┐
                                           │ chat-service │
                                           │   (Repo 2)   │
                                           └──────┬───────┘
                              4. cierra TODAS las conexiones de la sala
                                 emite room_closed + socket.disconnect()
                                 marca la sala como cerrada (rechaza reconexión)
```

## Contrato entre servicios (rutas internas)

Protegidas con el header `X-Internal-Secret` (debe coincidir en ambos repos).

| Método | Ruta (chat-service) | La llama | Efecto |
|---|---|---|---|
| `POST` | `/internal/rooms/notify-join` | room-service al entrar un usuario | Marca la sala activa. |
| `POST` | `/internal/rooms/notify-closed` | room-service al eliminar una sala | Cierra conexiones. |

## Estado en memoria (Tarea 7)

`chat-service` mantiene el registro de presencia en memoria (equivalente al
`ConcurrentHashMap` del enunciado; en Node un `Map` ya es seguro porque el
event loop es de un solo hilo):

```
rooms: Map<roomId, Map<username, { socketId, uid?, joinedAt }>>

"123" ─▶ { "Juan" ─▶ {...}, "Ana" ─▶ {...} }
"456" ─▶ { "Carlos" ─▶ {...} }
```

La clave por sala es el **username**, lo que hace que la validación de la
Tarea 8 (`USERNAME_ALREADY_CONNECTED`) sea una simple comprobación de
existencia de clave.

## Autenticación coordinada (Tarea 10)

El chat-service **no** valida el Firebase ID Token (no carga credenciales de
Firebase Admin). En su lugar:

1. El frontend llama a `POST /api/rooms/:id/enter` del room-service con su token.
2. El room-service valida el token (ya lo hacía) y **emite un ticket** firmado
   con HMAC-SHA256 sobre el `INTERNAL_SECRET` compartido:

   ```
   ticket  = base64url(payload) + "." + base64url(HMAC_SHA256(payload))
   payload = { roomId, username, uid, exp }
   ```

3. El frontend pasa el ticket en el handshake: `io(url, { path: "/ws/chat", auth: { ticket } })`.
4. El chat-service **solo verifica la firma y la expiración**. Como únicamente un
   usuario autenticado pudo obtener el ticket del room-service, esto cumple
   "validar usuario autenticado antes de permitir la conexión".

El algoritmo es idéntico en ambos repos:
`backend/src/services/chatTicket.ts` (emite) ↔ `chat-service/src/services/ticketService.ts` (verifica).

> En desarrollo, si `INTERNAL_SECRET` está vacío, la verificación se desactiva y
> el handshake acepta `auth: { roomId, username, uid }` directamente.

## Persistencia de mensajes (mensaje → guardar → broadcast)

El chat-service **no** escribe en Firestore. Cuando llega un mensaje, lo delega
al room-service (que es el dueño de la base de datos) y luego lo difunde:

```
┌──────────┐  send_message {content}   ┌──────────────┐
│ Frontend │ ─────────────────────────▶│ chat-service │
└──────────┘                           │   (Repo 2)   │
     ▲                                  └──────┬───────┘
     │                     1. POST /internal/rooms/:id/messages
     │                        { username, content, uid }
     │                                         ▼
     │                                  ┌──────────────┐
     │                                  │ room-service │ 2. guarda en Firestore
     │                                  │   (Repo 1)   │    (rooms/{id}/messages)
     │                                  └──────┬───────┘
     │                     3. { message } (id + timestamp reales)
     │                                         ▼
     │   4. receive_message (mensaje canónico)  ┌──────────────┐
     └──────────────────────────────────────── │ chat-service │
        broadcast SOLO a la sala (Tareas 4 y 8) └──────────────┘
```

Difundir el mensaje **canónico** (con el `id` y `timestamp` que asignó el
room-service) garantiza que el historial (`GET /rooms/{id}/messages`) y el
mensaje en vivo sean idénticos → sincronización.

Si `ROOM_SERVICE_URL` no está configurado o la persistencia falla, el
chat-service degrada a un mensaje local (con id `local-*`) para que el chat
siga funcionando aunque el mensaje no quede en el historial.

## Contrato del mensaje y validaciones (Tareas 1, 5, 6)

El cliente envía solo `{ content }`; el servidor construye el mensaje completo:

```json
{ "roomId": "123", "username": "Juan", "content": "Hola", "timestamp": "2026-06-01T15:00:00.000Z" }
```

- `EMPTY_MESSAGE` si `content.trim()` queda vacío (Tarea 5).
- `MESSAGE_TOO_LONG` si supera 500 caracteres (Tarea 6).
- El `username` lo pone el servidor desde el handshake (no se confía en el body).
