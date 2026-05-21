# Refinamiento de Historias Técnicas — Soporte de Backend (Sprint 0)

Documento de **refinamiento de historias técnicas** del Sprint 0 desde el lado del backend. Para cada historia (TS-01, TS-02, TS-03, TS-04) se lista qué está realmente implementado en `src/`, qué evidencia lo respalda (archivo y línea) y qué queda pendiente para Sprints siguientes.

Complementa a:
- `backend/docs/flows.md` — flujos internos paso a paso.
- `backend/docs/sockets.md` — eventos Socket.IO y signaling WebRTC.
- `backend/README.md` — arquitectura general y stack.

> **Convención de estado**
> - `✓` implementado en Sprint 0 y verificable en código.
> - `◐` parcialmente implementado (con gap conocido).
> - `○` planificado, no implementado todavía.

---

## 1. TS-01 — Identidad y rutas privadas

> **Objetivo de la historia:** un usuario puede registrarse y autenticarse con Firebase, su perfil queda persistido en Firestore con un `username` único, y las rutas privadas del backend exigen un token válido.

### 1.1 Resumen de soporte backend

| Punto requerido           | Estado | Evidencia                                                       |
|---------------------------|--------|-----------------------------------------------------------------|
| Firebase Auth             | ✓      | `src/config/firebase.ts:6-22`, `src/middlewares/authMiddleware.ts:27` |
| Firestore (perfil)        | ✓      | `src/services/authService.ts`, `src/models/User.ts`             |
| Campos completos del perfil (`uid, username, fullName, email, avatar, provider, createdAt`) | ✓ | `src/models/User.ts:1-15` |
| Login Email/Password      | ✓      | El cliente lo hace con SDK Firebase; el backend solo verifica el ID Token resultante en cada request privado |
| Login Google + detección de usuario nuevo | ✓ | Cliente hace `signInWithPopup`; tras `signIn`, el frontend llama a `GET /api/auth/me` → si 404 ⇒ pide username y llama `POST /register` con `provider: "google"` |
| Validación de username único | ✓   | `src/services/authService.ts` (`isUsernameTaken`) + endpoint público `/check-username` + chequeo en `register` |
| Validación de formato (`username` regex, `provider` enum) | ✓ | `src/controllers/authController.ts:5-7,30-42` |
| Rutas privadas            | ✓      | `src/middlewares/authMiddleware.ts:12-33` aplicado en `src/routes/authRoutes.ts` |
| Reglas Firestore          | ✓      | `firestore.rules` (raíz del repo) — solo el dueño escribe su `users/{uid}`, campos inmutables, default-deny |
| Estado online del usuario | ✓      | `src/services/authService.ts` (`setUserOnlineStatus`, toggle en connect/disconnect del socket) |
| Revocar tokens (logout forzado) | ✓ (utilitario) | `src/services/authService.ts` (`revokeUserTokens`, no expuesto aún por REST) |
| Códigos de error estables (no filtrar Firebase) | ✓ | `src/utils/errors.ts` + `AppError`; respuestas con shape `{ error: CODE, message }` |
| Concurrencia username (transacción Firestore) | ✓ | `src/services/authService.ts` (`db.runTransaction` chequea + escribe atómicamente) |
| Detección de tokens revocados | ✓ | `authMiddleware.verifyToken` pasa `checkRevoked: true` a `auth.verifyIdToken`; el handshake del socket hace lo mismo (`src/sockets/socketManager.ts`) |
| Tests automatizados       | ✓      | `backend/tests/authService.test.ts` + `authController.test.ts` + `authMiddleware.test.ts` (33 casos: registro, persistencia exacta, duplicados, concurrencia, login posterior, validaciones, no-leak, acceso autorizado, sin token, header mal formado, token inválido/expirado/revocado) — `npm test` |

### 1.2 Firebase Auth

El backend **no** crea usuarios ni gestiona contraseñas: eso lo hace el frontend con el SDK cliente de Firebase. El backend solo **verifica** ID Tokens (JWT) en cada request HTTP privado y en el handshake de Socket.IO.

```
Frontend                                  Backend
   │ signInWithEmailAndPassword               │
   │ (o signInWithPopup Google)               │
   ├─▶ Firebase Auth                          │
   │ ← idToken                                │
   │                                          │
   │ Authorization: Bearer <idToken>          │
   ├─────────────────────────────────────────▶│ verifyToken middleware
   │                                          │   auth.verifyIdToken(token)
   │                                          │   req.user = { uid, email }
```

Implementación clave (`src/middlewares/authMiddleware.ts`):

```ts
export const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json(buildError(ErrorCode.MISSING_TOKEN));
    return;
  }
  const token = authHeader.split("Bearer ")[1];
  if (!token) {
    res.status(401).json(buildError(ErrorCode.MISSING_TOKEN));
    return;
  }
  try {
    // checkRevoked=true: respeta revocaciones server-side de inmediato.
    const decoded = await auth.verifyIdToken(token, true);
    req.user = { uid: decoded.uid, email: decoded.email };
    next();
  } catch (err) {
    logger.warn("Token rechazado", err);
    res.status(401).json(buildError(ErrorCode.INVALID_TOKEN));
  }
};
```

**Por qué `checkRevoked: true`.** Sin ese flag, después de `revokeUserTokens(uid)` el cliente podría seguir usando el ID Token hasta su expiración natural (≤1h). Con él, Firebase comprueba en cada request si el token fue revocado y rechaza al instante (`auth/id-token-revoked`). El costo es una lectura extra a Firebase Auth por request — aceptable para el tamaño del proyecto.

**Escenarios cubiertos por tests** (`backend/tests/authMiddleware.test.ts`):
- Acceso autorizado: token válido → `next()` + `req.user = { uid, email }`.
- Sin header `Authorization` → 401 `MISSING_TOKEN`.
- Header sin prefijo `Bearer ` → 401 `MISSING_TOKEN`.
- `Bearer ` vacío → 401 `MISSING_TOKEN`.
- Firma inválida (`auth/argument-error`) → 401 `INVALID_TOKEN`.
- Token expirado (`auth/id-token-expired`) → 401 `INVALID_TOKEN`.
- Token revocado (`auth/id-token-revoked`) → 401 `INVALID_TOKEN`.
- Error interno de Firebase no se filtra al cliente.

### 1.3 Firestore — perfil de usuario

Al registrarse el usuario en `POST /api/auth/register`, el servicio crea el documento `users/{uid}`:

```ts
const newUser: User = {
  uid,
  username,
  fullName,
  email,
  avatar,                  // default "default_avatar.png"
  provider,                // 'password' | 'google'
  createdAt: new Date(),
  online: false,
};
await db.collection(USERS_COLLECTION).doc(uid).set(newUser);
```

El servicio rechaza el registro si:
- ya existe un perfil para ese `uid` (HTTP `409`),
- el `username` está tomado por otro usuario (HTTP `409`),
- faltan campos requeridos o el `username` no cumple la regex `/^[a-zA-Z0-9_]{3,20}$/` (HTTP `400`).

Lectura del perfil: `getUserProfile(uid)` en `src/services/authService.ts:42-45` (usado por `GET /api/auth/me` y por el socket al conectarse).

### 1.4 Validación de username único

Dos puntos de validación:

1. **En el registro** (server-side, fuente de verdad): `authService.registerUserProfile` llama a `isUsernameTaken` antes de crear el doc (`src/services/authService.ts:12-15`). Si está tomado, lanza error y el controller devuelve `400`.
2. **Disponibilidad en vivo** (UX del frontend): endpoint público `GET /api/auth/check-username/:username` → `{ available: boolean }` (`src/controllers/authController.ts:53-65`).

Query Firestore (`src/services/authService.ts:32-39`):

```ts
const snapshot = await db
  .collection(USERS_COLLECTION)
  .where("username", "==", username)
  .limit(1)
  .get();
return !snapshot.empty;
```

> Requiere índice simple `users.username ASC` (Firestore lo sugiere automáticamente la primera vez).

### 1.5 Rutas privadas

Toda ruta privada se monta así (`src/routes/authRoutes.ts:48`):

```ts
router.post("/register", verifyToken, authController.register);
router.get("/me",        verifyToken, authController.getMe);
router.get("/check-username/:username", authController.checkUsername); // pública
```

| Método | Ruta                                  | Auth | Responde                     |
|--------|---------------------------------------|------|------------------------------|
| POST   | `/api/auth/register`                  | ✓    | `201 { user }`               |
| GET    | `/api/auth/me`                        | ✓    | `200 { user }` o `404`       |
| GET    | `/api/auth/check-username/:username`  | —    | `200 { available }`          |

Documentación interactiva en `/api/docs` (Swagger UI) — ver `src/config/swagger.ts`.

### 1.6 Diagrama — Registro completo (TS-01)

```
┌────────┐         ┌──────────────┐         ┌─────────┐        ┌───────────┐
│Frontend│         │ Firebase Auth│         │ Backend │        │ Firestore │
└───┬────┘         └──────┬───────┘         └────┬────┘        └─────┬─────┘
    │ createUserWith       │                     │                   │
    │ EmailAndPassword     │                     │                   │
    ├─────────────────────▶│                     │                   │
    │  ← uid + idToken     │                     │                   │
    │◀─────────────────────┤                     │                   │
    │                      │                     │                   │
    │ POST /api/auth/register                    │                   │
    │ Authorization: Bearer <idToken>            │                   │
    │ body: { username, fullName, provider, avatar? }                │
    ├────────────────────────────────────────────▶                   │
    │                                            │ verifyIdToken     │
    │                                            ├──▶ Firebase Auth  │
    │                                            │                   │
    │                                            │ isUsernameTaken   │
    │                                            ├──────────────────▶│
    │                                            │◀── snapshot       │
    │                                            │                   │
    │                                            │ users/{uid}.set() │
    │                                            ├──────────────────▶│
    │  201 { user }                              │                   │
    │◀───────────────────────────────────────────┤                   │
```

### 1.7 Flujo de login con Google (detalle)

El backend no expone un endpoint `POST /api/auth/login/google`: con Firebase Auth ese paso vive en el cliente. El backend solo participa después, para crear o recuperar el perfil:

```
Frontend                               Backend                Firestore
  │ signInWithPopup(google)               │                       │
  ├─▶ Firebase Auth                       │                       │
  │  ← uid + idToken + email + photoURL   │                       │
  │                                       │                       │
  │ GET /api/auth/me                      │                       │
  ├──────────────────────────────────────▶│ verifyToken           │
  │                                       │ getUserProfile(uid)   │
  │                                       ├──────────────────────▶│
  │  200 { user }  ───── usuario existente, listo                 │
  │  404 { error: "Perfil no encontrado" } ── usuario NUEVO       │
  │                                       │                       │
  │ (UI pide username + fullName)         │                       │
  │ POST /api/auth/register               │                       │
  │ body: { username, fullName, provider: "google", avatar }      │
  ├──────────────────────────────────────▶│ verifyToken           │
  │                                       │ isUsernameTaken? ────▶│
  │                                       │ users/{uid}.set() ───▶│
  │  201 { user }                         │                       │
  │  409 si username duplicado            │                       │
```

Notas:
- El campo `provider` queda guardado en el doc para que el backend sepa de dónde vino el usuario (auditoría, futuras políticas).
- Si dos navegadores intentan registrar el mismo `username` a la vez, gana el primero — el segundo recibe `409`. La validación en vivo (`/check-username`) es solo UX; la verdad la dice `register`.

### 1.8 Pendiente para Sprints siguientes

- Endpoints para **editar perfil** (`PATCH /api/auth/me`) y **eliminar cuenta** con cascada de salas/mensajes.
- Exponer `revokeUserTokens` como acción administrativa (`POST /api/auth/revoke`).
- Reforzar `firestore.rules` cuando se agreguen colecciones nuevas (rooms/messages).

---

## 2. TS-02 — Tiempo real: chat, salas y presencia

> **Objetivo de la historia:** el backend ofrece un canal Socket.IO autenticado donde los usuarios se unen a salas, intercambian mensajes en tiempo real y reciben notificaciones de entrada/salida. El historial debe poder recuperarse al re-entrar.

### 2.1 Resumen de soporte backend

| Punto requerido            | Estado | Evidencia                                                     |
|----------------------------|--------|---------------------------------------------------------------|
| Socket.IO autenticado      | ✓      | `src/sockets/socketManager.ts:25-37` (middleware con `verifyIdToken`) |
| Eventos realtime           | ✓      | `src/sockets/socketManager.ts:49-118`                         |
| Rooms (`socket.join`)      | ✓      | `src/sockets/socketManager.ts:50`                             |
| Presencia global (Firestore)| ✓     | `src/sockets/socketManager.ts:45,116` + `setUserOnlineStatus` |
| Presencia por sala (Map)   | ✓      | `src/sockets/socketManager.ts:18-21,44,51`                    |
| Historial de mensajes      | ◐      | Mensajes se retransmiten **pero no se persisten** en Firestore (gap) |
| Modelo `messages/{id}`     | ✓ (interface) | `src/models/Message.ts:1-12`                          |

### 2.2 Socket.IO — conexión autenticada

El handshake exige el Firebase ID Token. Si falta o es inválido, el servidor rechaza la conexión (`src/sockets/socketManager.ts:25-37`):

```ts
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token as string | undefined;
  if (!token) return next(new Error("Token requerido"));
  try {
    const decoded = await auth.verifyIdToken(token);
    socket.data.uid = decoded.uid;
    next();
  } catch {
    next(new Error("Token inválido"));
  }
});
```

Tras conectar (`src/sockets/socketManager.ts:39-46`):
- Lee el perfil (`getUserProfile(uid)`) para resolver el `username`.
- Registra al socket en `connectedUsers: socketId → { uid, username, roomId? }`.
- Marca al usuario `online: true` en Firestore.

### 2.3 Catálogo de eventos (TS-02)

| Evento            | Dirección       | Payload                                                  | Efecto                                                              |
|-------------------|-----------------|----------------------------------------------------------|---------------------------------------------------------------------|
| `connection`      | C→S (nativo)    | —                                                        | Marca online, registra en `connectedUsers`                          |
| `join-room`       | C→S             | `roomId: string`                                         | `socket.join(roomId)` + emite `user-joined` a la sala               |
| `user-joined`     | S→sala          | `{ uid, username }`                                      | Notifica a los demás miembros                                       |
| `send-message`    | C→S             | `{ roomId, content }`                                    | Construye `{senderUid, senderUsername, content, roomId, createdAt}` y emite `receive-message` a toda la sala (incluido el emisor) |
| `receive-message` | S→sala          | `{ senderUid, senderUsername, content, roomId, createdAt }` | Lo entregan los clientes en el chat                              |
| `user-left`       | S→sala          | `{ uid, username }`                                      | Se emite al `disconnect` si el socket tenía sala                    |
| `disconnect`      | C→S (nativo)    | —                                                        | Emite `user-left`, limpia el Map, marca `online: false` en Firestore|

Detalle de payloads y ejemplos: `backend/docs/sockets.md §2`.

### 2.4 Diagrama — Ciclo de vida en una sala

```
Cliente A                Servidor                       Cliente B
   │ io({auth:{token}})     │                              │
   ├═══════════════════════▶│ verifyIdToken (handshake)    │
   │                        │ connectedUsers.set(...)      │
   │                        │ users/{uid}.online=true ╌╌╌▶ Firestore
   │ emit 'join-room'(R)    │                              │
   ├═══════════════════════▶│ socket.join(R)               │
   │                        │ emit 'user-joined'(A) ══════▶│ (si B ya estaba)
   │                        │                              │
   │ emit 'send-message'    │                              │
   │   {roomId:R,content}   │                              │
   ├═══════════════════════▶│ io.to(R).emit                │
   │                        │  ('receive-message', msg)    │
   │◀════════════════════════ (eco)                    ════▶│
   │                        │                              │
   │ disconnect             │                              │
   ├═══════════════════════▶│ emit 'user-left'(A) ════════▶│
   │                        │ users/{uid}.online=false ╌╌▶ Firestore
```

### 2.5 Presencia — dos capas

| Capa         | Dónde vive                                | Granularidad | Uso                                |
|--------------|-------------------------------------------|--------------|------------------------------------|
| Global       | `users/{uid}.online` en Firestore         | Por usuario  | Mostrar "en línea" en contactos    |
| Por sala     | `connectedUsers` Map en memoria del server| Por socket   | Quién está en la sala **ahora**    |

Justificación: Firestore no escala bien para presencia (escrituras costosas y propagación de ~250 ms). El Map en memoria es perfecto para "quién está en mi sala" y se reconstruye solo si el servidor reinicia (los clientes se reconectan). Detalle en `flows.md §3.2`.

### 2.6 Historial de mensajes (gap actual)

**Hoy** (`src/sockets/socketManager.ts:58-71`): `send-message` solo retransmite con `io.to(roomId).emit(...)`. **No** escribe en Firestore. Un usuario que llega tarde a la sala **no ve los mensajes previos**.

**Diseño objetivo (Sprint 1)** — ver `flows.md §3.3`:

1. En `send-message`, antes de emitir, persistir:
   ```ts
   const ref = await db.collection("messages").add({
     roomId, senderUid, senderUsername,
     content, type: "text",
     createdAt: FieldValue.serverTimestamp(),
   });
   io.to(roomId).emit("receive-message", { id: ref.id, ...msg });
   ```
2. En `join-room`, hidratar al recién llegado:
   ```ts
   const history = await db.collection("messages")
     .where("roomId", "==", roomId)
     .orderBy("createdAt", "desc")
     .limit(50)
     .get();
   socket.emit("chat-history", history.docs.map(d => d.data()));
   ```
3. Cliente deduplica por `msg.id` (garantía at-least-once).

Índice Firestore requerido: compuesto `roomId ASC, createdAt DESC` (sugerido automáticamente por Firestore).

### 2.7 Pendiente para Sprints siguientes

- **Persistencia de `send-message`** + emisión de `chat-history` al unirse (Sprint 1).
- **Membresía persistente** de salas: separar `rooms/{roomId}.participants` (Firestore) de la presencia efímera (Map en memoria).
- **Eventos `room-updated` / `room-closed`** para CRUD de salas (Sprint 1).
- **Reconexión / multi-pestaña:** llevar contador de sesiones por uid para no marcar `online:false` si todavía queda otra pestaña abierta (ver `flows.md §3.1`).
- **Rate limiting** en `send-message` y `register`.

---

## 3. TS-03 — Signaling WebRTC (audio, video, pantalla)

> **Objetivo de la historia:** el backend actúa como **signaling server** para que dos navegadores negocien una conexión WebRTC P2P y se intercambien streams de audio, video y pantalla. La media **nunca** pasa por el backend.

### 3.1 Resumen de soporte backend

| Punto requerido        | Estado | Evidencia                                            |
|------------------------|--------|------------------------------------------------------|
| Signaling SDP (offer)  | ✓      | `src/sockets/socketManager.ts:74-82`                 |
| Signaling SDP (answer) | ✓      | `src/sockets/socketManager.ts:85-93`                 |
| ICE candidate exchange | ✓      | `src/sockets/socketManager.ts:96-104`                |
| Peer connections (cliente)| ○   | Lado frontend (Sprint 2+). El backend no las gestiona — son P2P. |
| Intercambio de streams (media) | ○ | Viaja P2P fuera del backend. No requiere código nuevo en backend (solo TURN opcional). |

### 3.2 Patrón de signaling

El backend solo intermedia el **handshake**. Patrón usado: el emisor incluye `targetSocketId`; el servidor reenvía al destino añadiendo `fromSocketId`.

```ts
// src/sockets/socketManager.ts:74-82
socket.on("webrtc-offer", (payload: { targetSocketId, sdp }) => {
  io.to(payload.targetSocketId).emit("webrtc-offer", {
    fromSocketId: socket.id,
    sdp: payload.sdp,
  });
});
```

Mismo patrón para `webrtc-answer` y `ice-candidate`.

### 3.3 Catálogo de eventos (TS-03)

| Evento          | Dirección     | Payload C→S                                                | Payload S→destino                                         |
|-----------------|---------------|------------------------------------------------------------|-----------------------------------------------------------|
| `webrtc-offer`  | bidireccional | `{ targetSocketId, sdp: {type, sdp?} }`                    | `{ fromSocketId, sdp }`                                   |
| `webrtc-answer` | bidireccional | `{ targetSocketId, sdp: {type, sdp?} }`                    | `{ fromSocketId, sdp }`                                   |
| `ice-candidate` | bidireccional | `{ targetSocketId, candidate: {candidate, sdpMid?, sdpMLineIndex?} }` | `{ fromSocketId, candidate }`                  |

Tipos en `src/sockets/socketManager.ts:5-13` (`SdpPayload`, `IceCandidatePayload`) — definidos a mano porque las APIs WebRTC del navegador no existen en Node.

### 3.4 Diagrama — Llamada completa (audio / video / pantalla)

```
A: getUserMedia() / getDisplayMedia()      B: getUserMedia() / getDisplayMedia()
A: pc.createOffer() → setLocalDescription
A ──webrtc-offer──▶ servidor ──webrtc-offer──▶ B
                                             B: setRemoteDescription
                                             B: pc.createAnswer() → setLocalDescription
B ──webrtc-answer──▶ servidor ──webrtc-answer──▶ A
A: setRemoteDescription

A ──ice-candidate──▶ servidor ──ice-candidate──▶ B
B ──ice-candidate──▶ servidor ──ice-candidate──▶ A
        (se repite por cada candidato recolectado)

[conexión P2P establecida]
audio/video/pantalla ◄══════ P2P ══════► (NO pasa por el backend)
```

### 3.5 Compartición de pantalla (T4)

No requiere eventos nuevos. El frontend reemplaza el track de video de la misma `RTCPeerConnection` por uno proveniente de `navigator.mediaDevices.getDisplayMedia()`. El signaling es idéntico.

### 3.6 Limitaciones conocidas

- **NAT simétrico:** requiere TURN. Render no provee uno; opciones: TURN gratuito de Twilio o `coturn` self-hosted.
- **Topología mesh:** la implementación actual es P2P entre cada par. Para salas de más de 4-6 participantes el ancho de banda y el CPU del cliente se vuelven prohibitivos; en ese caso se necesita un SFU (mediasoup, LiveKit). Queda fuera del MVP.

### 3.7 Pendiente para Sprints siguientes

- Implementación cliente de `RTCPeerConnection` (Sprint 2).
- Configurar STUN/TURN (Sprint 2).
- Definir tope de participantes por sala antes de migrar a SFU.

---

## 4. TS-04 — Soporte backend para accesibilidad

> **Objetivo de la historia:** la accesibilidad vive sobre todo en el frontend (`frontend/docs/accessibility.md`), pero el backend debe ofrecer **mensajes accesibles, eventos claros y respuestas consistentes** para que el frontend pueda anunciarlos correctamente con `aria-live`, `role="alert"`, etc.

### 4.1 Resumen de soporte backend

| Punto requerido          | Estado | Evidencia                                                |
|--------------------------|--------|----------------------------------------------------------|
| Mensajes accesibles      | ✓      | Errores con texto humano en español; ver §4.2            |
| Eventos claros           | ✓      | Nombres semánticos (`user-joined`, `receive-message`, etc.) — `docs/sockets.md §5` |
| Respuestas consistentes  | ✓      | Esquema único de error y de éxito; ver §4.3              |
| Códigos HTTP correctos   | ✓      | `201 / 200 / 400 / 401 / 404` documentados en Swagger    |
| Documentación máquina-legible | ✓ | OpenAPI 3 en `/api/docs.json` (`src/config/swagger.ts`)   |

### 4.2 Mensajes accesibles (errores en español, legibles)

Todos los errores REST devuelven un objeto `{ error: CODE, message }` con un **código estable** (legible por máquina, listo para i18n) y un **mensaje humano en español** apto para `role="alert"`. El cliente decide qué campo usar: `error` para lógica, `message` para mostrar.

Catálogo de códigos (`src/utils/errors.ts`):

| Código                       | HTTP | Mensaje default                                                                            | Origen                                          |
|------------------------------|------|--------------------------------------------------------------------------------------------|-------------------------------------------------|
| `MISSING_TOKEN`              | 401  | "Token de autorización requerido"                                                          | `authMiddleware` cuando no hay `Authorization`  |
| `INVALID_TOKEN`              | 401  | "Token inválido o expirado"                                                                | `authMiddleware` si `verifyIdToken` falla       |
| `MISSING_FIELDS`             | 400  | "Faltan campos obligatorios en la solicitud"                                               | `register` sin `username/fullName/provider`     |
| `USERNAME_INVALID`           | 400  | "username inválido: 3-20 caracteres, solo letras, números y guion bajo"                    | `register`, `checkUsername`                     |
| `PROVIDER_INVALID`           | 400  | "provider debe ser 'password' o 'google'"                                                  | `register` con provider distinto                |
| `USERNAME_ALREADY_EXISTS`    | 409  | "El nombre de usuario ya está en uso"                                                      | `authService.registerUserProfile` (transacción) |
| `PROFILE_ALREADY_EXISTS`     | 409  | "El perfil ya existe para este usuario"                                                    | `authService.registerUserProfile` (transacción) |
| `PROFILE_NOT_FOUND`          | 404  | "Perfil no encontrado"                                                                     | `getMe` cuando no existe `users/{uid}`          |
| `INTERNAL_ERROR`             | 500  | "Error interno del servidor"                                                               | **Cualquier error inesperado** (catch-all)      |

**Garantía de no-leak**: el controller envuelve todo en `sendError(res, err, context)`. Si `err` no es un `AppError`, se loggea internamente con `logger.error` y al cliente solo le llega `{ error: "INTERNAL_ERROR", message: "Error interno del servidor" }`. Tests específicos verifican que el mensaje original de Firebase (`"FIRESTORE: permission_denied..."`, stacks, etc.) **nunca** aparece en el body de respuesta — `backend/tests/authController.test.ts`.

Para Socket.IO los errores de auth se devuelven en el callback de conexión con texto plano (`"Token requerido"`, `"Token inválido"` — `socketManager.ts:28,35`), de modo que el cliente puede anunciar el motivo de desconexión.

### 4.3 Respuestas consistentes (esquema único)

Los esquemas reutilizables están en `src/config/swagger.ts:36-77`:

```yaml
Error:
  type: object
  required: [error, message]
  properties:
    error:
      type: string
      enum: [MISSING_TOKEN, INVALID_TOKEN, MISSING_FIELDS, USERNAME_INVALID,
             PROVIDER_INVALID, USERNAME_ALREADY_EXISTS, PROFILE_ALREADY_EXISTS,
             PROFILE_NOT_FOUND, INTERNAL_ERROR]
      example: "USERNAME_ALREADY_EXISTS"
    message:
      type: string
      example: "El nombre de usuario ya está en uso"

User:
  type: object
  required: [uid, username, fullName, email, avatar, provider, online]
  properties:
    uid: string
    username: string
    fullName: string
    email: email
    avatar: string
    provider: enum [password, google]
    createdAt: date-time
    online: boolean
```

Forma de respuesta:
- **Éxito:** `{ user: User }` para endpoints de auth, `{ available: boolean }` para check-username, `{ status, env }` para health.
- **Error:** siempre `{ error: string }` con código HTTP apropiado.

Esta uniformidad permite al frontend tener **un solo `handleApiError(res)` reutilizable** que extrae `res.error` y lo manda a un anunciador ARIA.

### 4.4 Eventos claros (Socket.IO)

Los nombres de evento son semánticos y autoexplicativos — el frontend puede mapearlos directamente a `aria-live` regions:

| Evento backend     | Anuncio sugerido (lector pantalla)                      |
|--------------------|--------------------------------------------------------|
| `user-joined`      | "Se ha unido {username}"                                |
| `user-left`        | "Ha salido {username}"                                  |
| `receive-message`  | "{senderUsername} dice: {content}"                      |
| `room-closed` (○)  | "La sala fue cerrada por el anfitrión"                  |
| (error handshake)  | "No fue posible conectarse: {motivo}"                   |

### 4.5 Pendiente para Sprints siguientes

- **Eventos `system`-type en chat** (mensajes generados por servidor: "Juan se unió") para que el cliente los anuncie con voz distinta a los mensajes humanos. Reutiliza `Message.type = 'system'` ya tipado en `models/Message.ts`.
- **Throttling de `aria-live`:** no es backend, pero el catálogo de eventos debe evitar emisiones excesivas que saturen al lector.

---

## 5. Modelos técnicos

Las interfaces TypeScript son la fuente de verdad del shape de cada documento Firestore. Se mantienen explícitamente separadas de los DTOs HTTP para poder evolucionarlas sin romper el contrato externo.

### 5.1 `User` — `src/models/User.ts`

```ts
export type AuthProvider = "password" | "google";

export interface User {
  uid: string;                                           // = Firebase Auth uid
  username: string;                                      // único, validado server-side
  fullName: string;                                      // nombre visible en UI
  email: string;
  avatar: string;                                        // default "default_avatar.png"
  provider: AuthProvider;                                // origen de la cuenta
  createdAt: FirebaseFirestore.Timestamp | Date;
  online: boolean;                                       // toggle en connect/disconnect
}
export const USERS_COLLECTION = "users";                 // users/{uid}
```

**Operaciones implementadas:**
- Crear: `POST /api/auth/register` → `authService.registerUserProfile` (`✓`).
- Leer propio: `GET /api/auth/me` → `authService.getUserProfile` (`✓`).
- Disponibilidad username: `GET /api/auth/check-username/:username` (`✓`).
- Toggle `online`: socket connect/disconnect (`✓`).
- Editar/eliminar perfil: Sprint 1 (`○`).

### 5.2 `Room` — `src/models/Room.ts`

```ts
export interface Room {
  id: string;                                            // = doc id
  name: string;
  createdBy: string;                                     // uid del HOST (único)
  participants: string[];                                // uids con acceso
  createdAt: FirebaseFirestore.Timestamp | Date;
  isActive: boolean;                                     // soft-delete
}
export const ROOMS_COLLECTION = "rooms";                 // rooms/{roomId}
```

**Reglas (planificación Sprint 1 — `flows.md §2.1`):**
- `createdBy` es host único; sin transferencia de host en MVP.
- Solo el host puede `PATCH` y `DELETE`.
- Eliminación = soft-delete (`isActive: false`) para preservar historial de chat.

**Operaciones:** todas planificadas para Sprint 1 (`○`). El modelo ya está tipado para que el código socket pueda anticipar la integración (`socketManager.ts` usa `roomId: string` consistentemente).

### 5.3 `Message` — `src/models/Message.ts`

```ts
export interface Message {
  id: string;
  roomId: string;                                        // indexado
  senderUid: string;
  senderUsername: string;                                // denormalizado (no JOIN en Firestore)
  content: string;
  type: "text" | "system";                               // permite mensajes de sistema accesibles
  createdAt: FirebaseFirestore.Timestamp | Date;         // indexado (compuesto con roomId)
}
export const MESSAGES_COLLECTION = "messages";           // messages/{messageId}
```

**Decisiones de diseño:**
- `senderUsername` se **denormaliza** dentro del mensaje porque Firestore no soporta JOIN. Cambiar el username después **no** reescribe los mensajes viejos (decisión consciente).
- `type: "system"` reservado para mensajes generados por servidor (entradas/salidas, anuncios), útil para accesibilidad (se pueden anunciar con voz distinta).
- Los mensajes **sobreviven** al soft-delete de la sala.

**Operaciones:**
- Retransmisión en vivo: `send-message` → `receive-message` (`✓`).
- Persistencia + `chat-history` al unirse: Sprint 1 (`◐` — el modelo ya existe, falta la lógica).

### 5.4 Índices Firestore

| Colección  | Índice                                  | Para qué                           |
|------------|-----------------------------------------|------------------------------------|
| `users`    | `username ASC` (simple)                 | `isUsernameTaken`                  |
| `rooms`    | `participants ARRAY_CONTAINS, isActive` | Listar mis salas activas (Sprint 1)|
| `messages` | `roomId ASC, createdAt DESC` (compuesto)| Paginar historial por sala         |

Firestore detecta y propone los índices automáticamente la primera vez que una query los necesita.

---

## 6. Evidencias

### 6.1 Historias técnicas completas — checklist por archivo

| Historia | Archivos clave                                                                                  |
|----------|--------------------------------------------------------------------------------------------------|
| TS-01    | `src/middlewares/authMiddleware.ts`, `src/services/authService.ts`, `src/controllers/authController.ts`, `src/routes/authRoutes.ts`, `src/models/User.ts`, `src/utils/errors.ts`, `firestore.rules`, `tests/authService.test.ts`, `tests/authController.test.ts`, `tests/authMiddleware.test.ts` |
| TS-02    | `src/sockets/socketManager.ts` (chat + presencia + rooms), `src/models/Message.ts`, `src/models/Room.ts` |
| TS-03    | `src/sockets/socketManager.ts:74-104` (signaling SDP/ICE)                                       |
| TS-04    | `src/config/swagger.ts` (esquemas consistentes), `src/middlewares/authMiddleware.ts` y `src/controllers/authController.ts` (mensajes accesibles), `docs/sockets.md §5` (catálogo de eventos) |

### 6.2 Diagramas backend

| Diagrama                              | Ubicación                                      |
|---------------------------------------|------------------------------------------------|
| Arquitectura general                  | `backend/README.md §3`                         |
| Registro de usuario (TS-01)           | `backend/docs/flows.md §1.1` + §1.6 de este doc |
| Login + persistencia sesión           | `backend/docs/flows.md §1.2-1.3`               |
| Logout y side effects                 | `backend/docs/flows.md §1.4`                   |
| Conexión Socket.IO autenticada (TS-02)| `backend/docs/flows.md §3.1` + §2.4 de este doc |
| Ciclo de vida en sala (TS-02)         | §2.4 de este doc                               |
| Llamada WebRTC completa (TS-03)       | `backend/docs/flows.md §4` + `backend/docs/sockets.md §4` + §3.4 de este doc |

### 6.3 Eventos definidos

Catálogo completo en `backend/docs/sockets.md §5` y `backend/docs/flows.md §6`. Resumen ejecutivo:

| Evento            | Historia | Estado     |
|-------------------|----------|------------|
| `connection`      | TS-02    | ✓          |
| `disconnect`      | TS-02    | ✓          |
| `join-room`       | TS-02    | ✓          |
| `user-joined`     | TS-02    | ✓          |
| `user-left`       | TS-02    | ✓          |
| `send-message`    | TS-02    | ◐ (retransmite, falta persistir) |
| `receive-message` | TS-02    | ✓          |
| `chat-history`    | TS-02    | ○          |
| `webrtc-offer`    | TS-03    | ✓          |
| `webrtc-answer`   | TS-03    | ✓          |
| `ice-candidate`   | TS-03    | ✓          |
| `room-updated`    | TS-02    | ○          |
| `room-closed`     | TS-02    | ○          |

---

## 7. Resumen ejecutivo

| Historia | Estado global | Gap principal                                     |
|----------|---------------|---------------------------------------------------|
| TS-01    | ✓ completa    | Editar/eliminar perfil → Sprint 1                 |
| TS-02    | ◐ parcial     | Persistir `send-message` y emitir `chat-history`  |
| TS-03    | ✓ signaling listo | Implementación cliente y TURN → Sprint 2      |
| TS-04    | ✓ contrato listo | Mensajes `system` en chat                |

El backend de Sprint 0 cubre **toda la base técnica** que los demás Sprints requieren: identidad y rutas privadas reales, signaling WebRTC funcionando, canal Socket.IO autenticado con presencia y rooms, y modelos de datos tipados para `User`, `Room` y `Message`. Los gaps conocidos (persistencia de chat, CRUD de salas, códigos de error estables) están planificados con diseño concreto en `flows.md` y modelo de datos ya listo en `models/`.
