# Manual Técnico — Backend (Mini Proyecto 2)

Documentación técnica del backend de **EstudioColab**, una plataforma de salas
de estudio colaborativas con chat en tiempo real, presencia y video (WebRTC en
el frontend). El backend está dividido en **dos servicios independientes**.

> **Documentos relacionados**
> - Swagger room-service: `http://localhost:3000/api/docs`
> - Swagger chat-service: `http://localhost:8081/api/docs`
> - Arquitectura detallada del tiempo real: [`chat-service/docs/arquitectura.md`](chat-service/docs/arquitectura.md)
> - Modelo Firestore: [`backend/docs/firestore-model.md`](backend/docs/firestore-model.md)

---

## 1. Arquitectura general

```
                       ┌──────────────────────────────┐
                       │          Frontend            │
                       │   (React + socket.io-client) │
                       └───────┬───────────────┬──────┘
                  REST (HTTPS) │               │ WebSocket  /ws/chat
                               ▼               ▼
        ┌──────────────────────────┐   ┌──────────────────────────┐
        │   Repositorio 1          │   │   Repositorio 2          │
        │   backend-room-service   │◀─▶│   backend-chat-service   │
        │   (Express + Firebase)   │   │   (Express + Socket.IO)  │
        │   Puerto 3000            │   │   Puerto 8081            │
        └────────────┬─────────────┘   └──────────────────────────┘
                     │  HTTP interno (X-Internal-Secret)
                     ▼
        ┌──────────────────────────┐
        │        Firestore         │
        │  users / rooms / messages│
        └──────────────────────────┘
```

- **room-service (Repo 1)** es el dueño de la base de datos: autentica con
  Firebase, gestiona salas/usuarios y persiste mensajes en Firestore.
- **chat-service (Repo 2)** es el servidor de tiempo real: WebSocket, presencia,
  chat y validación de username. **No** habla con Firestore: delega la
  persistencia al room-service.
- Ambos se comunican por **HTTP interno** autenticado con un secreto compartido
  (`INTERNAL_SECRET`):
  - room-service → chat-service: avisa entradas y cierres de sala.
  - chat-service → room-service: persiste cada mensaje.
- La autenticación de la conexión WebSocket se **coordina** con un *ticket*
  firmado que emite el room-service tras validar el token de Firebase.

---

## 2. Repositorios

### Repositorio 1 — `backend-room-service` (`backend/`)

| | |
|---|---|
| **Responsable de** | Salas, Usuarios, Firestore |
| **Stack** | Node.js + TypeScript + Express 5 + Firebase Admin |
| **Puerto** | 3000 |
| **Responsabilidades** | Registro/login/perfil (Firebase Auth), CRUD de salas, persistencia de mensajes, historial, emisión de tickets de chat |

### Repositorio 2 — `backend-chat-service` (`chat-service/`)

| | |
|---|---|
| **Responsable de** | WebSocket, Chat, Participantes |
| **Stack** | Node.js + TypeScript + Express 5 + Socket.IO |
| **Puerto** | 8081 (endpoint WebSocket en `/ws/chat`) |
| **Responsabilidades** | Conexiones en tiempo real, presencia por sala, unicidad de username, broadcast de mensajes, validaciones de mensaje, cierre de salas |

> En este monorepo, "Repositorio 1/2" corresponden a las carpetas `backend/` y
> `chat-service/`. Cada una compila y se prueba de forma independiente.

---

## 3. Modelo de datos (Firestore)

Base de datos: **Cloud Firestore** (modo nativo). Colecciones:

### `users/{uid}`
```jsonc
{
  "uid": "abc123",
  "username": "juanp",          // único en la colección
  "fullName": "Juan Pérez",
  "email": "juan@correounivalle.edu.co",
  "avatar": "/avatars/avatar1.png",
  "provider": "password",       // "password" | "google"
  "online": false,
  "createdAt": "<Timestamp>"
}
```

### `rooms/{roomId}`
```jsonc
{
  "roomId": "aB3kXq9mZvL2wRtY",
  "name": "Sala Matemáticas",
  "ownerId": "abc123",
  "accessCode": "B6K3F2",       // código corto para unirse
  "participants": ["abc123"],
  "isActive": true,
  "createdAt": "<Timestamp>"
}
```

### `rooms/{roomId}/messages/{messageId}` (subcolección)
```jsonc
{
  "id": "msg001",
  "roomId": "aB3kXq9mZvL2wRtY",
  "senderUid": "abc123",
  "senderUsername": "Juan",
  "content": "Hola",
  "type": "text",               // "text" | "system"
  "createdAt": "<Timestamp>"    // timestamp del servidor → orden cronológico
}
```

**Decisiones de diseño**
- Los mensajes son una **subcolección** de la sala: evita índices compuestos,
  permite borrado en cascada y mantiene el agregado raíz (sala) coherente.
- El `createdAt` se fija en el servidor para que el orden cronológico sea
  consistente entre clientes con relojes desfasados.
- La unicidad de `username` se valida en la capa de servicio antes de escribir.

---

## 4. WebSocket (chat-service)

- **Endpoint:** `ws://<host>:8081/ws/chat` (Socket.IO, `path: "/ws/chat"`).
- **Conexión del cliente:**
  ```js
  io("http://localhost:8081", { path: "/ws/chat", auth: { ticket } });
  ```
- **Autenticación coordinada:** el handshake exige un *ticket* firmado
  (HMAC-SHA256 con `INTERNAL_SECRET`) que emite el room-service en
  `POST /api/rooms/{id}/enter`. El chat-service solo verifica la firma y la
  expiración → no necesita credenciales de Firebase.
- **Presencia (en memoria):** `Map<roomId, Map<username, conexión>>` — un
  username no puede estar conectado dos veces en la misma sala.

### Estructura del mensaje
```jsonc
{ "messageId": "001", "roomId": "123", "username": "Juan", "content": "Hola", "timestamp": "2026-06-01T15:00:00.000Z" }
```

### Eventos

| Evento | Dirección | Payload | Descripción |
|---|---|---|---|
| (handshake) | client → server | `auth: { ticket }` | Valida ticket; rechaza con `AUTH_REQUIRED` / `INVALID_TICKET` / `USERNAME_ALREADY_CONNECTED`. |
| `send_message` | client → server (ack) | `{ content }` | Valida vacío/longitud, **persiste** y difunde. |
| `receive_message` | server → sala | `ChatMessage` | Mensaje nuevo, solo a la sala. |
| `user_joined` / `user_left` | server → sala | `{ roomId, username }` | Presencia. |
| `participants` | server → sala | `{ roomId, participants[] }` | Lista de conectados. |
| `room_closed` | server → sala | `{ roomId, error: ROOM_CLOSED }` | La sala fue eliminada; el socket se desconecta. |

### Validaciones de mensaje
- Vacío / solo espacios → `EMPTY_MESSAGE`.
- Más de 500 caracteres → `MESSAGE_TOO_LONG`.

### Reconexión
- El cliente Socket.IO reintenta automáticamente.
- El servidor acepta el nuevo handshake; si es el mismo `uid`, **reemplaza** la
  sesión anterior en vez de rechazarla como duplicada.
- `connectionStateRecovery` recupera mensajes perdidos en cortes breves.

### Persistencia (mensaje → guardar → broadcast)
1. Llega `send_message { content }`.
2. El chat-service llama a `POST /internal/rooms/{id}/messages` del room-service.
3. El room-service guarda en Firestore y devuelve el mensaje canónico.
4. El chat-service difunde el mensaje canónico (id + timestamp reales) →
   historial y mensaje en vivo coinciden.

---

## 5. Backend principal (room-service)

- **Autenticación:** Firebase ID Token en `Authorization: Bearer <token>`,
  validado con `admin.auth().verifyIdToken()`. Las rutas privadas rechazan
  usuarios no autenticados con `401`.
- **Salas:** crear, listar (propias + unidas), obtener, editar nombre, eliminar
  y unirse por código.
- **Mensajes:** persistencia en Firestore e historial cronológico.
- **Integración con el chat-service:** informa entradas/cierres de sala y emite
  el ticket de conexión.

### Manejo uniforme de errores (accesibilidad / UX)

Todos los errores devuelven la **misma estructura**, lista para anunciar en un
`role="alert"` / `aria-live`:

```jsonc
{ "success": false, "error": "ROOM_NOT_FOUND", "message": "Sala no encontrada" }
```

- `success` siempre `false` en errores.
- `error` es un código estable (el frontend lo usa para i18n / flujo).
- `message` es texto claro en español, **nunca** un código pelado como `"500"`.

### Estados HTTP

| Código | Significado | Ejemplo |
|---|---|---|
| `200` | Éxito | Sala obtenida / historial cargado |
| `201` | Creado | Sala / mensaje creado |
| `204` | Éxito sin contenido | Sala eliminada |
| `400` | Solicitud inválida | `ROOM_NAME_INVALID`, `MISSING_FIELDS` |
| `401` | No autenticado | `MISSING_TOKEN`, `INVALID_TOKEN` |
| `403` | Sin permisos | `FORBIDDEN` (no es dueño / no es miembro) |
| `404` | No encontrado | `ROOM_NOT_FOUND`, `PROFILE_NOT_FOUND` |
| `500/503` | Error interno | `INTERNAL_ERROR` (detalles ocultos al cliente) |

---

## 6. Registro de endpoints

### REST — room-service (`/api`)

| Método | Endpoint | Función | US |
|---|---|---|---|
| `POST` | `/api/auth/register` | Registrar usuario (perfil) | US-01/02 |
| `GET` | `/api/auth/me` | Ver perfil propio | US-04 |
| `PATCH` | `/api/auth/me` | Editar perfil | US-04 |
| `DELETE` | `/api/auth/me` | Eliminar cuenta | US-05 |
| `GET` | `/api/auth/check-username` | Verificar username disponible | US-01/04 |
| `GET` | `/api/users/{uid}` | Perfil público de un usuario | US-09 |
| `POST` | `/api/rooms` | Crear sala | US-06 |
| `GET` | `/api/rooms` | Listar mis salas | US-06 |
| `GET` | `/api/rooms/{roomId}` | Obtener sala por ID | US-08 |
| `POST` | `/api/rooms/join` | **Unirse** a sala por código | US-08 |
| `GET` | `/api/rooms/join/{code}` | Unirse por código (variante GET) | US-08 |
| `POST` | `/api/rooms/{roomId}/enter` | Entrar (valida + ticket WS) | US-08 |
| `PUT` | `/api/rooms/{roomId}` | **Editar** nombre de sala | US-07 |
| `DELETE` | `/api/rooms/{roomId}` | **Eliminar** sala | US-07 |
| `GET` | `/api/rooms/{roomId}/messages` | **Historial** de chat | US-11 |
| `GET` | `/health` | Health check | — |

### Interno (service-to-service, `X-Internal-Secret`)

| Método | Endpoint | Servicio | Función |
|---|---|---|---|
| `POST` | `/internal/rooms/{roomId}/messages` | room-service | Persistir mensaje |
| `POST` | `/internal/rooms/notify-join` | chat-service | Marcar sala activa |
| `POST` | `/internal/rooms/notify-closed` | chat-service | Cerrar conexiones |

### REST — chat-service

| Método | Endpoint | Función | US |
|---|---|---|---|
| `GET` | `/participants?roomId=` | Participantes conectados | US-09/10 |
| `GET` | `/health` | Health check | — |

### WebSocket — chat-service (`/ws/chat`)

| Evento | Función | US |
|---|---|---|
| `send_message` / `receive_message` | **Mensajería instantánea** | US-10 |
| `user_joined` / `user_left` / `participants` | Presencia | US-09 |

---

## 7. Variables de entorno

### room-service (`backend/.env`)
| Variable | Descripción |
|---|---|
| `PORT` | Puerto (default 3000) |
| `CORS_ORIGIN` | Orígenes del frontend (coma-separados) |
| `FIREBASE_*` / `FIREBASE_ADMIN_*` | Credenciales Firebase (cliente + Admin SDK) |
| `CHAT_SERVICE_URL` | URL del chat-service para informar entradas/cierres |
| `INTERNAL_SECRET` | Secreto compartido (tickets + rutas internas) |

### chat-service (`chat-service/.env`)
| Variable | Descripción |
|---|---|
| `PORT` | Puerto (default 8081) |
| `WS_PATH` | Path del WebSocket (default `/ws/chat`) |
| `CORS_ORIGIN` | Orígenes del frontend |
| `ROOM_SERVICE_URL` | URL del room-service para persistir mensajes |
| `INTERNAL_SECRET` | **Debe coincidir** con el del room-service |

---

## 8. Ejecución y despliegue

### Local
```bash
# Repositorio 1 — room-service
cd backend
npm install
cp .env.example .env      # completar credenciales Firebase + INTERNAL_SECRET
npm run dev               # http://localhost:3000  (Swagger en /api/docs)

# Repositorio 2 — chat-service
cd chat-service
npm install
cp .env.example .env      # ROOM_SERVICE_URL + el mismo INTERNAL_SECRET
npm run dev               # http://localhost:8081  (Swagger en /api/docs)
```

### Pruebas
```bash
cd backend && npm test          # room-service
cd chat-service && npm test     # chat-service
```

### Despliegue (Render)
- Cada servicio tiene su propio `render.yaml` y se despliega como un **Web
  Service independiente** (URLs distintas).
- El chat-service **no** requiere credenciales de Firebase; solo
  `ROOM_SERVICE_URL`, `INTERNAL_SECRET` y `CORS_ORIGIN`.
- `INTERNAL_SECRET` debe ser **idéntico** en ambos servicios.

---

## 9. Historias de usuario cubiertas por el backend

| Historia | Cobertura backend |
|---|---|
| **US-07 — Editar y Eliminar Salas** | `PUT /api/rooms/{id}` + `DELETE /api/rooms/{id}` (solo dueño → 403 invitados) |
| **US-08 — Unirse a una Sala** | `POST /api/rooms/join`, `GET /api/rooms/join/{code}`, `POST /api/rooms/{id}/enter` |
| **US-10 — Mensajería Instantánea** | Eventos WS `send_message` → `receive_message` |
| **US-11 — Historial de Chat** | `GET /api/rooms/{id}/messages` (cronológico) + persistencia |

---

## 10. Evidencias técnicas (checklist)

Para el Documento Único de Evidencias, capturar:

- [ ] **Firestore** — consola con las colecciones `users`, `rooms` y la
  subcolección `messages` pobladas.
- [ ] **Swagger** — `/api/docs` de ambos servicios mostrando los endpoints y
  las referencias a las historias de usuario.
- [ ] **Postman** — colección ejecutando: crear sala, unirse (`POST /join`),
  editar (`PUT`), eliminar (`DELETE`), historial (`GET .../messages`), con
  capturas de **éxito** y de **error controlado** (p. ej. 404 `ROOM_NOT_FOUND`,
  403 `FORBIDDEN`).
- [ ] **Logs** — salida del chat-service mostrando conexión/desconexión,
  validación de username y persistencia de mensajes; logs del room-service
  mostrando el guardado y las notificaciones internas.
```
[INFO] Usuario conectado: "Juan" en sala 123 (1 en sala)
[INFO] room-service informó entrada a sala 123 ("Matemáticas") — usuario "Juan"
[WARN] Conexión rechazada: "Juan" ya conectado en sala 123
```

---

_Última actualización: backend de room-service + chat-service, con manejo
uniforme de errores, estados HTTP correctos y Swagger documentado por historia
de usuario._
