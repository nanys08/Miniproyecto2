# Viabilidad técnica — Sprint 0

Documento de **validación técnica** del Sprint 0. Recorre el checklist de viabilidad (flujos del prototipo, auth, salas, tiempo real, riesgos, persistencia y ajustes recomendados) contrastándolo con lo que ya existe en el repo.

Complementa a:
- `backend/docs/historias-tecnicas.md` — refinamiento TS-01..TS-04.
- `backend/docs/flows.md` — flujos internos detallados.
- `backend/docs/sockets.md` — catálogo de eventos.
- `frontend/docs/navigation.md` — sitemap del prototipo.

> **Convención**
> - `✓` viable y ya soportado (al menos parcialmente) en el código.
> - `◐` viable con gap conocido.
> - `⚠` riesgo identificado que requiere ajuste.

---

## 1. Revisión de los flujos del prototipo

Resumen del estado técnico de cada flujo prototipado.

| Flujo                | Cómo funcionará técnicamente                                                                                          | Estado | Evidencia                                                                 |
|----------------------|-----------------------------------------------------------------------------------------------------------------------|--------|---------------------------------------------------------------------------|
| **Login**            | Firebase Auth en cliente → ID Token (JWT firmado) → backend verifica con `admin.auth().verifyIdToken()`               | ✓      | `frontend/src/context/AuthContext.tsx:118`, `backend/src/middlewares/authMiddleware.ts:27` |
| **Registro**         | `createUserWithEmailAndPassword` (cliente) → `POST /api/auth/register` con Bearer token → crea `users/{uid}` en Firestore | ✓      | `AuthContext.tsx:154-155`, `authService.ts:17-28`                          |
| **Salas (CRUD)**     | `POST/GET/PATCH/DELETE /api/rooms` + Socket.IO `join-room`. Soft-delete con `isActive`                                | ◐      | Modelo `Room.ts` listo; endpoints REST en Sprint 1 (`routes/index.ts:9-10`) |
| **Chat**             | Socket.IO `send-message` → persiste en `messages/{id}` → `receive-message` a la sala. Hidratación con `chat-history`  | ◐      | Retransmisión `socketManager.ts:58-71` ya funciona; persistencia pendiente |
| **Videollamadas**    | WebRTC P2P; Socket.IO solo intermedia signaling (SDP + ICE). Media nunca pasa por el backend                          | ✓ signaling / ○ cliente | `socketManager.ts:74-104`; cliente WebRTC en Sprint 2          |
| **Compartir pantalla** | Mismo `RTCPeerConnection` con un track de `getDisplayMedia()`; signaling idéntico al de video                       | ✓ signaling / ○ cliente | Sin código nuevo en backend                                       |

### 1.1 Mapeo de flujo end-to-end

```
Usuario          Frontend                Firebase Auth         Backend Express          Firestore
  │   abrir app     │                            │                     │                      │
  │ ─────────────▶  │ onAuthStateChanged hidrata │                     │                      │
  │                 │ ───────────────────────────│                     │                      │
  │   login         │ signInWithEmailAndPassword │                     │                      │
  │ ─────────────▶  │ ──────────────────────────▶│                     │                      │
  │                 │ ◀── idToken (JWT) ─────────│                     │                      │
  │                 │ POST /api/auth/me Authorization: Bearer <idToken>│                      │
  │                 │ ───────────────────────────────────────────────▶ │ verifyIdToken        │
  │                 │                                                  │ getUserProfile  ───▶ │ users/{uid}
  │ navigate /dashboard ◀──── { user } ─────────────────────────────── │ ◀──── doc ──────────│
  │                 │ connectSocket() con idToken                      │                      │
  │                 │ ═══════════════════════════════════════════════▶ │ users/{uid}.online=true
  │ entra a sala    │ socket.emit('join-room', id)                     │                      │
  │ ─────────────▶  │ ═══════════════════════════════════════════════▶ │ socket.join(id)      │
  │ envía mensaje   │ socket.emit('send-message', {id, content})       │                      │
  │ ─────────────▶  │ ═══════════════════════════════════════════════▶ │ io.to(id).emit       │
  │ inicia llamada  │ pc.createOffer + emit('webrtc-offer')            │                      │
  │ ─────────────▶  │ ═══════════════════════════════════════════════▶ │ forward a peer       │
  │                 │ ◀── P2P WebRTC (audio/video/pantalla) ─────────────────────────────────│ (no pasa por backend)
```

---

## 2. Validación del flujo de autenticación

### 2.1 Cómo funcionará el login

| Aspecto                | Implementación                                                       | Evidencia                                                  |
|------------------------|----------------------------------------------------------------------|-------------------------------------------------------------|
| Provider de credenciales | Firebase Authentication (email/password + Google)                  | `frontend/src/services/firebase.ts:22-32`                   |
| Token de sesión        | **Firebase ID Token** (JWT firmado por Google, válido 1h)            | Rotación automática del SDK; backend valida en cada request |
| Verificación servidor  | `admin.auth().verifyIdToken()` valida firma + expiración + revocación | `backend/src/middlewares/authMiddleware.ts:27`              |
| Modo demo (sin Firebase) | Sesión simulada en `localStorage` con prefijo `demo-`              | `frontend/src/context/AuthContext.tsx:65-77,106-130`        |

> El ejemplo del enunciado dice "JWT", y exactamente eso es lo que usamos. El JWT viene firmado por Firebase con la public key de Google, así el backend no necesita compartir secreto con el frontend.

### 2.2 Protección de rutas

**Frontend** (`frontend/src/routes/ProtectedRoute.tsx`):

```ts
if (loading) return <Loader label="Verificando sesión" fullscreen />;
if (!user)    return <Navigate to="/login" replace state={{ from: location }} />;
return <Outlet />;
```

- Espera la hidratación de Firebase Auth antes de decidir.
- Preserva la ruta original en `location.state.from` para volver tras el login.
- Aplica a `/dashboard`, `/profile`, `/room/:id` (`AppRouter.tsx:27-36`).

**Backend** (`backend/src/middlewares/authMiddleware.ts`):

- Middleware `verifyToken` aplicado a `POST /api/auth/register` y `GET /api/auth/me` (`authRoutes.ts:48,81`).
- Sin token: `401 "Token de autorización requerido"`.
- Token inválido/expirado: `401 "Token inválido o expirado"`.

**Socket.IO** (`backend/src/sockets/socketManager.ts:25-37`):

- Middleware `io.use(...)` exige el token en el handshake (`socket.handshake.auth.token`).
- Rechaza la conexión con `Token requerido` / `Token inválido` si falla.

### 2.3 Persistencia de sesión

| Capa            | Mecanismo                                                                                       | Estado |
|-----------------|--------------------------------------------------------------------------------------------------|--------|
| Cliente         | `browserLocalPersistence` de Firebase Auth → guarda credenciales en IndexedDB                   | ✓      |
| Recarga         | `onAuthStateChanged` rehidrata el usuario sin pedir credenciales otra vez                       | ✓      |
| Refresh de token| Firebase rota el ID Token cada hora automáticamente                                              | ✓      |
| Backend         | **Stateless** — no guarda sesiones; valida JWT en cada request                                   | ✓      |
| Logout          | `signOut(auth)` + `disconnectSocket()` → socket dispara `disconnect` → `users.online = false`    | ✓      |

Diagrama completo en `flows.md §1.3-1.4`.

### 2.4 Resultado de la validación

```
Usuario → Firebase Auth → idToken (JWT) → Backend (verifyIdToken) → ProtectedRoute → /dashboard
```

Cumple el patrón del enunciado y agrega:
- Verificación server-side real (no se confía en el cliente).
- Modo demo offline para desarrollo sin Firebase configurado.

---

## 3. Validación de la lógica de salas

> Estado global: **planificada** para Sprint 1. El modelo está listo y el flujo Socket.IO de "entrar/salir" ya existe; falta el CRUD HTTP.

### 3.1 Cómo se crearán

**Diseño** (`flows.md §2.2`):

```
POST /api/rooms     Auth: Bearer <token>     body: { name }
  └─▶ verifyToken
  └─▶ doc = rooms/{autoId}
  └─▶ doc.set({ id, name, createdBy: uid, participants: [uid], isActive: true, createdAt })
  └─▶ 201 { room }
```

- `createdBy` es el **host único** (`Room.ts:4`).
- Sin transferencia de host en MVP — simplifica gestión y evita disputas.
- `joinCode` corto humano-amigable: pendiente de decisión (recomendación: agregarlo en Sprint 1).

### 3.2 Cómo se unirán los usuarios

Dos caminos paralelos:

**A) Membresía persistente (HTTP):**
```
POST /api/rooms/:id/join  →  rooms/:id.participants += uid
```

**B) Presencia efímera (Socket.IO):**
```
socket.emit('join-room', roomId)
  └─▶ socket.join(roomId)
  └─▶ connectedUsers.set(socketId, { uid, username, roomId })
  └─▶ socket.to(roomId).emit('user-joined', { uid, username })
```

> Separación deliberada: un usuario puede **ser miembro** de una sala (Firestore) pero no estar **conectado ahora mismo** (Socket.IO room). La presencia efímera vive en memoria del servidor.

Implementación actual: solo la parte B (`socketManager.ts:49-55`).

### 3.3 Cómo manejar participantes

| Aspecto                 | Diseño                                                                | Evidencia                              |
|-------------------------|-----------------------------------------------------------------------|----------------------------------------|
| Lista persistente       | `rooms/{id}.participants: string[]` (uids con acceso)                 | `Room.ts:5`                            |
| Quién está conectado    | `connectedUsers: Map<socketId, {uid, username, roomId}>` en memoria   | `socketManager.ts:18-21`               |
| Notificación de entrada | Evento `user-joined` con `{ uid, username }`                          | `socketManager.ts:53`                  |
| Notificación de salida  | Evento `user-left` al `disconnect` si tenía `roomId`                  | `socketManager.ts:109-113`             |
| Host (edición/borrado)  | Solo `createdBy` puede `PATCH`/`DELETE` (403 si no)                   | `flows.md §2.4-2.5`                    |
| Eliminación de sala     | Soft-delete (`isActive: false`) + emit `room-closed` + desconectar sockets | `flows.md §2.5`                  |

### 3.4 Pendiente para Sprint 1

- Implementar `POST /api/rooms`, `POST /api/rooms/:id/join`, `PATCH /api/rooms/:id`, `DELETE /api/rooms/:id`.
- Emitir `room-updated` y `room-closed` desde el backend.
- Definir tope de participantes (ver §5 — riesgo de WebRTC mesh).
- Decidir si se agrega `joinCode` corto humano-amigable.

---

## 4. Análisis de funcionalidades en tiempo real

### 4.1 Socket.IO

| Punto                       | Estado | Evidencia                              |
|-----------------------------|--------|----------------------------------------|
| Servidor inicializado       | ✓      | `backend/src/server.ts:11-18`          |
| Cliente conectado           | ✓      | `frontend/src/services/socket.ts:15-34`|
| Handshake autenticado       | ✓      | `socketManager.ts:25-37`               |
| Rooms (broadcast por sala)  | ✓      | `socket.join(roomId)` + `io.to(roomId).emit` |
| CORS configurado            | ✓      | `server.ts:12-15` con `env.corsOrigin` |
| Reconexión automática       | ✓ (cliente)| `socket.io-client` la activa por defecto |

### 4.2 WebRTC

| Punto                          | Estado | Evidencia                          |
|--------------------------------|--------|------------------------------------|
| Signaling SDP (`offer/answer`) | ✓      | `socketManager.ts:74-93`           |
| ICE candidates                 | ✓      | `socketManager.ts:96-104`          |
| Patrón `targetSocketId`/`fromSocketId` | ✓ | Permite mesh entre N peers      |
| Tipos `SdpPayload` / `IceCandidatePayload` | ✓ | `socketManager.ts:5-13`        |
| `RTCPeerConnection` cliente    | ○      | Sprint 2 (no implementado)         |
| STUN/TURN configurado          | ⚠      | Falta TURN para NAT simétrico      |

### 4.3 Eventos en tiempo real

Catálogo completo (cruzando el ejemplo del enunciado):

| Evento (enunciado) | Equivalente real          | Estado | Notas                                            |
|--------------------|---------------------------|--------|--------------------------------------------------|
| `join-room`        | `join-room`               | ✓      | `socketManager.ts:49-55`                         |
| `send-message`     | `send-message`            | ◐      | Retransmite, no persiste todavía                 |
| `leave-room`       | `disconnect` + `user-left`| ✓      | Se infiere del cierre del socket                 |
| `start-call`       | `webrtc-offer`            | ✓      | Iniciar = primer `offer` SDP                     |
| `share-screen`     | (mismo flujo de video)    | ✓      | Reemplaza track de `RTCPeerConnection` con `getDisplayMedia()` |

> **Decisión técnica:** no creamos `leave-room` explícito porque el disconnect del socket ya cumple esa función y evita estados inconsistentes (cliente que dice "ya salí" pero sigue conectado). Si en Sprint 1 se necesita "salir de la sala sin desconectar el socket" (cambiar de sala sin recargar), se agregará `leave-room` como evento explícito con un `socket.leave(roomId)` y emisión de `user-left`.

Catálogo completo en `sockets.md §5` y `flows.md §6`.

---

## 5. Riesgos técnicos identificados

### 5.1 Riesgos críticos (a tener en cuenta ya)

| # | Riesgo                                                                | Impacto                          | Mitigación                                                        |
|---|-----------------------------------------------------------------------|----------------------------------|-------------------------------------------------------------------|
| ⚠1 | **NAT simétrico** sin TURN → la llamada no se establece para algunos usuarios | Bloquea T3/T4 en ~10-20% de redes | Configurar TURN (Twilio gratis o `coturn`) antes de demos Sprint 2 |
| ⚠2 | **WebRTC mesh** (P2P entre cada par) → cada cliente sube N-1 streams  | CPU/ancho de banda explotan en salas grandes | Limitar a ≤ 4-6 participantes en MVP; SFU (mediasoup, LiveKit) post-MVP |
| ⚠3 | **Compartir pantalla requiere permisos del navegador**                | El usuario debe aceptar el prompt nativo | UX explícita: explicar antes de invocar `getDisplayMedia()`; manejar `NotAllowedError` |
| ⚠4 | **Multi-pestaña / multi-dispositivo**: un mismo uid puede tener N sockets activos | `online: false` se setea al primer disconnect aunque otra pestaña siga abierta | Contador de sesiones por uid o `users/{uid}/sessions/{socketId}` |
| ⚠5 | **`send-message` no persiste** (gap Sprint 0)                         | Usuario que llega tarde no ve mensajes previos | Persistir en `messages/{id}` antes de retransmitir + emitir `chat-history` al `join-room` |

### 5.2 Riesgos medios

| # | Riesgo                                                                | Impacto                                | Mitigación                                                  |
|---|-----------------------------------------------------------------------|----------------------------------------|-------------------------------------------------------------|
| ⚠6 | **Render free tier** congela el proceso tras 15 min sin tráfico       | Primer hit lento, sockets se caen      | Health check cada 10 min o upgrade plan en demo final       |
| ⚠7 | **Firestore no es ideal para presencia** (escrituras costosas, ~250 ms) | Latencia visible en "está en línea"  | Ya mitigado: doble capa (Map en memoria + Firestore)        |
| ⚠8 | **`username` denormalizado** en mensajes                              | Cambiar username no actualiza mensajes viejos | Decisión consciente; aceptado para MVP                  |
| ⚠9 | **Backend con Admin SDK bypassa Firestore Security Rules**            | Si el frontend lee directo, las rules son la única protección | Mantener regla "todo pasa por REST" o endurecer rules más adelante |
| ⚠10 | **Sin rate limiting** en `send-message` y `register`                | Posible spam / brute force             | Agregar `express-rate-limit` + throttling Socket.IO en Sprint 2 |

### 5.3 Riesgos bajos (anotados pero sin acción Sprint 0)

| #   | Riesgo                                                          | Mitigación futura                            |
|-----|-----------------------------------------------------------------|----------------------------------------------|
| ⚠11 | Reconexión Socket.IO puede causar parpadeo de presencia         | Probar y debouncing en Sprint 1              |
| ⚠12 | Soporte WebRTC en navegadores antiguos (Safari iOS < 14)        | Documentar matriz de compatibilidad         |
| ⚠13 | Tamaño máximo de mensajes (sin validar)                         | Validación `content.length ≤ 2000`           |
| ⚠14 | Sin tests automatizados                                         | Vitest/Jest desde Sprint 1                   |

---

## 6. Validación de persistencia de datos

### 6.1 Tabla de persistencia

| Información                          | Persistente | Dónde vive                                | Justificación                                         |
|--------------------------------------|-------------|-------------------------------------------|-------------------------------------------------------|
| Usuarios (perfil)                    | ✅          | `users/{uid}` en Firestore                | Necesario entre sesiones                              |
| Credenciales                         | ✅ (externa)| Firebase Auth                             | El backend nunca ve la contraseña                     |
| Username                             | ✅          | `users/{uid}.username`                    | Único, validado server-side                           |
| Avatar                               | ✅          | `users/{uid}.avatar`                      | URL/path; default `default_avatar.png`                |
| Salas (metadata)                     | ✅          | `rooms/{roomId}` en Firestore             | Sprint 1                                              |
| Lista de participantes (membresía)   | ✅          | `rooms/{id}.participants: string[]`       | Quién tiene acceso a la sala                          |
| Mensajes de chat                     | ✅          | `messages/{id}` en Firestore              | Historial recuperable (T2)                            |
| Estado online                        | ✅ (efímero)| `users/{uid}.online` boolean              | Persistido pero se actualiza vivo                     |
| Sesión activa en cliente             | ✅ (local)  | IndexedDB de Firebase Auth                | `browserLocalPersistence`                             |
| **Socket connections**               | ❌          | `Map<socketId, {uid, username, roomId}>` en memoria | Se pierde si reinicia servidor (se reconstruye)|
| **Presencia por sala**               | ❌          | Misma `Map` en memoria                    | Inmediata, no necesita durar                          |
| **Estado micrófono / cámara**        | ❌          | `RTCPeerConnection` en cliente            | Solo importa durante la llamada                       |
| **Stream de audio/video**            | ❌          | P2P WebRTC                                | **Nunca toca el backend**                             |
| **Compartir pantalla**               | ❌          | Track en `RTCPeerConnection` cliente      | Idem video                                            |
| **ICE candidates**                   | ❌          | Intercambiados vía socket, no se guardan  | Sirven solo para handshake                            |
| **SDP offers/answers**               | ❌          | Idem                                      | Idem                                                  |
| Toasts / errores UI                  | ❌          | Estado React en `ToastContext`            | Visuales transitorios                                 |
| Token JWT                            | ❌ (servidor)| Firebase lo guarda en cliente (1h TTL)   | Backend no almacena tokens                            |

### 6.2 Lifecycle por colección

```
users/{uid}        ── creado en register ── modificado en login/logout/edit ── eliminado en delete account (cascade)
rooms/{roomId}     ── creado en POST /rooms ── editado por host ── soft-delete (isActive=false)
messages/{id}      ── creado en send-message ── persiste aunque la sala se cierre ── (TTL/purga manual en Sprint 3+)
```

### 6.3 Índices Firestore requeridos

| Colección  | Índice                                  | Para qué                            |
|------------|-----------------------------------------|-------------------------------------|
| `users`    | `username ASC`                          | `isUsernameTaken`                   |
| `rooms`    | `participants ARRAY_CONTAINS, isActive`| Listar mis salas activas            |
| `messages` | `roomId ASC, createdAt DESC`            | Paginar historial por sala          |

Firestore propone estos índices automáticamente cuando la query los necesita por primera vez.

---

## 7. Ajustes técnicos recomendados

Ordenados por prioridad y Sprint sugerido.

### 7.1 Prioridad alta — Sprint 1

| Problema detectado                                       | Ajuste recomendado                                                                                              |
|----------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------|
| ❌ Chat sin historial                                    | ✅ Persistir cada `send-message` en `messages/{id}` antes de retransmitir + emitir `chat-history` al `join-room` (últimos 50) |
| ❌ Salas sin CRUD HTTP                                   | ✅ Implementar `POST/GET/PATCH/DELETE /api/rooms` y `POST /api/rooms/:id/join`                                  |
| ❌ Compartir códigos de sala de 20 chars es incómodo     | ✅ Agregar `joinCode` corto (6 chars alfanuméricos) además del `id` autogenerado                                |
| ❌ `online:false` se setea aunque queden otras pestañas  | ✅ Contador de sesiones por uid (set en memoria) o subcolección `users/{uid}/sessions/{socketId}`               |
| ❌ Sin validación de tamaño/spam en `send-message`       | ✅ `content.length ≤ 2000` server-side + rate limit por socket                                                  |

### 7.2 Prioridad alta — Sprint 2 (cuando se prendan llamadas)

| Problema detectado                                       | Ajuste recomendado                                                                                              |
|----------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------|
| ❌ Sin TURN configurado → llamadas fallan en NAT simétrico | ✅ Integrar TURN gratuito de Twilio o `coturn` self-hosted; configurar `iceServers` en `RTCPeerConnection`     |
| ❌ Videollamada con 100 usuarios en mesh                 | ✅ Limitar inicialmente a **≤ 6 participantes**; mostrar mensaje "sala llena" al séptimo                        |
| ❌ Permisos de cámara/mic/pantalla denegados → app se rompe | ✅ Manejar `NotAllowedError` y `NotFoundError`; explicar al usuario con `role="alert"`                       |
| ❌ Sin manera de "salir de sala sin desconectar"         | ✅ Agregar evento `leave-room` explícito con `socket.leave(roomId)` + `user-left`                              |

### 7.3 Prioridad media — Sprint 2+

| Problema detectado                                       | Ajuste recomendado                                                                                              |
|----------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------|
| ❌ Errores REST sin código estable (solo string en español) | ✅ Agregar `code: "USERNAME_TAKEN" | "TOKEN_EXPIRED" | ...` además del `error` humano                          |
| ❌ Sin rate limiting global                              | ✅ `express-rate-limit` en `/auth/register` y middleware Socket.IO casero para eventos `send-message`           |
| ❌ Sin tests automáticos                                 | ✅ Vitest para servicios; supertest para endpoints REST                                                         |
| ❌ Render free tier congela tras 15 min                  | ✅ Cron de health check externo cada 10 min, o upgrade a plan starter para la demo final                       |

### 7.4 Prioridad baja — post-MVP

| Problema detectado                                       | Ajuste recomendado                                                                                              |
|----------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------|
| ❌ Mesh no escala a >6 participantes                     | ✅ Migrar a SFU (mediasoup o LiveKit) — único camino para llamadas medianas/grandes                            |
| ❌ Mensajes crecen indefinidamente                       | ✅ TTL (90 días) o archivado a Storage frío                                                                     |
| ❌ Sin transferencia de host                             | ✅ Reevaluar tras feedback de usuarios; si la sala "muere" cuando el host se desconecta, agregar herencia       |

---

## 8. Resumen — entregables del checklist

### Validación técnica

Todos los flujos del prototipo (login, registro, salas, chat, videollamadas, compartir pantalla) son **técnicamente viables** con el stack actual (React + Express + Socket.IO + Firebase + WebRTC). Los flujos sin código todavía están **diseñados, modelados y documentados** — no quedan incógnitas técnicas para Sprint 1+.

### Observaciones backend

- ✅ Auth + verificación de JWT funcionando end-to-end (REST y sockets).
- ✅ Modelos Firestore tipados (`User`, `Room`, `Message`).
- ✅ Signaling WebRTC operativo (offer/answer/ICE).
- ◐ Chat retransmite pero **no persiste**: gap puntual de Sprint 1.
- ◐ CRUD de salas modelado pero sin endpoints HTTP todavía.
- ⚠ Falta TURN antes de prender llamadas reales.
- ⚠ Manejo de multi-pestaña impreciso (un disconnect marca offline aunque otra pestaña siga abierta).

### Riesgos identificados

10 riesgos en §5 con prioridad y mitigación. Los críticos (⚠1..⚠5) están directamente atados a Sprint 1-2. Los medios y bajos pueden esperar a post-MVP sin bloquear el avance.

### Ajustes recomendados ya

Lista priorizada en §7 con 16 ajustes concretos. Los más urgentes:

1. **Persistir mensajes** + `chat-history` al unirse (Sprint 1).
2. **CRUD de salas** + `joinCode` corto (Sprint 1).
3. **TURN configurado** antes de las primeras llamadas (Sprint 2).
4. **Limitar a 6 participantes** mientras sigamos en mesh (Sprint 2).
5. **Sesiones por uid** para no parpadear el `online` con múltiples pestañas (Sprint 1).

Con estos ajustes el proyecto cierra Sprint 0 con un Sprint 1 enfocado y sin sorpresas técnicas.
