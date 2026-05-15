# Flujos técnicos del backend

Documento de **planificación** del Sprint 0. Define cómo deben comportarse internamente los procesos críticos del backend antes de implementarlos en Sprints posteriores. Acompaña a:

- `backend/README.md` — arquitectura general.
- `backend/docs/sockets.md` — eventos Socket.IO y signaling WebRTC.

> **Convenciones de los diagramas**
> - `─▶` flujo síncrono / request HTTP.
> - `═▶` evento Socket.IO.
> - `╌▶` escritura/lectura Firestore.
> - `(✓)` ya implementado en Sprint 0. `(○)` planificado para Sprints siguientes.

---

## 1. Autenticación

### 1.1 Registro de usuario (✓)

Trazabilidad: **T1 (Gestión de Identidad)** — historia TS-01.

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
    │ body: { username, avatar? }                │                   │
    ├────────────────────────────────────────────▶                   │
    │                                            │ verifyIdToken     │
    │                                            ├──▶ Firebase Auth  │
    │                                            │                   │
    │                                            │ isUsernameTaken   │
    │                                            ├──────────────────▶│
    │                                            │◀─── snapshot      │
    │                                            │                   │
    │                                            │ db.collection     │
    │                                            │  ('users').doc    │
    │                                            │  (uid).set(...)   │
    │                                            ├──────────────────▶│
    │  201 { user }                              │                   │
    │◀───────────────────────────────────────────┤                   │
```

**Validaciones:**
- Token válido (middleware `verifyToken`).
- `username` presente.
- `username` único (query `users.where('username', '==', x).limit(1)`).

**Documento creado en `users/{uid}`:**
```ts
{
  uid, username, email,
  avatar: 'default_avatar.png',
  createdAt: Timestamp.now(),
  online: false
}
```

**Errores:**
- `401` token ausente/inválido.
- `400` `username` faltante o ya en uso.

---

### 1.2 Login (✓)

```
┌────────┐                    ┌──────────────┐
│Frontend│                    │ Firebase Auth│
└───┬────┘                    └──────┬───────┘
    │ signInWithEmailAndPassword     │
    │   o signInWithPopup(Google)    │
    ├───────────────────────────────▶│
    │  ← user + idToken              │
    │◀───────────────────────────────┤
    │
    │ onAuthStateChanged → setUser
    │ (idToken se obtiene bajo demanda con currentUser.getIdToken())
```

**El backend no participa en el login** — Firebase Auth maneja credenciales. El backend solo se entera del usuario cuando llega un request con `Authorization: Bearer <idToken>`.

**Caso Google sign-in:** tras el popup, el frontend llama `GET /api/auth/me`. Si responde 404 (no hay perfil en Firestore), invoca automáticamente `POST /api/auth/register` derivando un username del `displayName`/`email`.

---

### 1.3 Persistencia de sesión (✓)

El backend es **stateless**: no guarda sesiones. El frontend usa `browserLocalPersistence` de Firebase Auth para mantener al usuario logueado entre recargas.

```
Recarga de página
       │
       ▼
Firebase Auth SDK lee IndexedDB
       │
       ▼
onAuthStateChanged emite usuario hidratado (con idToken refresh automático)
       │
       ▼
AuthContext.user pasa de null → User
       │
       ▼
ProtectedRoute deja pasar
```

**Refresh de token:** Firebase rota el ID Token cada hora automáticamente. El backend valida la firma + expiración en cada request — no requiere lógica extra.

---

### 1.4 Logout (✓)

```
Frontend                           Backend (Socket.IO)         Firestore
   │                                       │                       │
   │ AuthContext.logout()                  │                       │
   ├──▶ disconnectSocket()                 │                       │
   │       └─▶ socket.disconnect()  ══════▶│ on 'disconnect'       │
   │                                       ├─▶ setUserOnlineStatus │
   │                                       │   (uid, false) ╌╌╌╌╌╌▶│
   │ signOut(auth)                         │                       │
   ├──▶ limpia IndexedDB de Firebase       │                       │
   │ onAuthStateChanged(null)              │                       │
   │ → ProtectedRoute → /login             │                       │
```

**Side effects al desconectar el socket:**
- El servidor marca `online: false` en `users/{uid}`.
- Emite `user-left` a las salas donde estaba (`socket.rooms`).
- Libera el slot en el `Map<socketId, {uid, username, roomId}>` (`socketManager.ts:18`).

---

## 2. Salas (○ — planificación Sprint 1+)

Trazabilidad: **T1 (Gestión de Salas)**.

### 2.1 Modelo de host

```ts
interface Room {
  id: string;             // doc id
  name: string;
  createdBy: string;      // uid del HOST
  participants: string[]; // uids con acceso
  createdAt: Timestamp;
  isActive: boolean;
}
```

**Reglas del host:**
- El `createdBy` es el **host único** de la sala.
- Solo el host puede `PATCH /rooms/:id` (renombrar) y `DELETE /rooms/:id`.
- Si el host abandona la sala (no la elimina), la sala **sigue activa** para los demás participantes.
- Si el host elimina su cuenta: las salas que creó se eliminan en cascada (job batch en Sprint 2+).
- **No hay transferencia de host** en MVP. Simplifica la gestión y evita disputas. Decisión revisable post-MVP.

### 2.2 Crear sala

```
┌────────┐                ┌─────────┐               ┌───────────┐
│Frontend│                │ Backend │               │ Firestore │
└───┬────┘                └────┬────┘               └─────┬─────┘
    │ POST /api/rooms          │                          │
    │ Auth: Bearer <token>     │                          │
    │ body: { name }           │                          │
    ├─────────────────────────▶│                          │
    │                          │ verifyToken              │
    │                          │ doc = db.collection      │
    │                          │  ('rooms').doc()         │
    │                          │ doc.set({                │
    │                          │   id: doc.id,            │
    │                          │   name,                  │
    │                          │   createdBy: uid,        │
    │                          │   participants: [uid],   │
    │                          │   isActive: true,        │
    │                          │   createdAt: now         │
    │                          │ }) ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌▶│
    │ 201 { room }             │                          │
    │◀─────────────────────────┤                          │
```

**Código de sala:** se reusa `doc.id` (autogenerado por Firestore, 20 chars). Si se quiere un código corto humano-amigable (ej. 6 chars), se mantiene en un campo `joinCode` adicional y se valida unicidad antes de escribir.

### 2.3 Unirse a sala

Dos formas:

**A) Por ID/joinCode (HTTP):**
```
POST /api/rooms/:id/join  →  añade uid a room.participants
```

**B) En tiempo real (Socket.IO, ya implementado parcialmente):**
```
socket.emit('join-room', roomId)
   │
   ▼
servidor: socket.join(roomId)
   │
   ▼
emite 'user-joined' a la sala
   │
   ▼
(○ Sprint 1) opcionalmente persiste roomMembers/{roomId}/{uid}
```

> En Sprint 1 conviene **separar la membresía persistente (Firestore) de la presencia efímera (Socket.IO room)**: un usuario puede ser miembro de una sala pero no estar conectado.

### 2.4 Editar sala (○)

```
PATCH /api/rooms/:id    body: { name }
  ↳ verifyToken
  ↳ doc = rooms/:id
  ↳ si doc.createdBy !== uid → 403
  ↳ doc.update({ name })
  ↳ emite 'room-updated' a sala vía io.to(id)
```

### 2.5 Eliminar sala (○)

```
DELETE /api/rooms/:id
  ↳ verifyToken
  ↳ doc = rooms/:id
  ↳ si doc.createdBy !== uid → 403
  ↳ batch:
       - doc.update({ isActive: false })  ← soft delete
       - emite 'room-closed' a sala
       - servidor desconecta todos los sockets de la sala
  ↳ (opcional) job programado borra docs inactivos > 30 días
```

**Por qué soft-delete:** el historial de chat (`messages` con `roomId`) debe seguir accesible para queries de auditoría/UX (ej. "última actividad").

---

## 3. Tiempo real

### 3.1 Conexión Socket.IO autenticada (✓)

```
Frontend                              Backend
   │ const socket = io(SOCKET_URL,        │
   │   { auth: { token: idToken } })      │
   ├─────────────────────────────────────▶│ io.use(async (socket, next))
   │                                      │   token = handshake.auth.token
   │                                      │   verifyIdToken(token)
   │                                      │   socket.data.uid = decoded.uid
   │                                      │   next()
   │                                      │
   │                                      │ on 'connection':
   │                                      │   - profile = getUserProfile(uid)
   │                                      │   - connectedUsers.set(socket.id, {uid, username})
   │                                      │   - setUserOnlineStatus(uid, true) ╌▶ Firestore
   │ (conectado)                          │
   │◀═════════════════════════════════════│
```

**Multi-pestaña / multi-dispositivo:** un mismo `uid` puede tener N sockets activos. Implicaciones:
- El `Map<socketId, {uid, ...}>` permite N entradas para el mismo uid.
- `online: true` se setea al primer connect; `online: false` al último disconnect.
- **Sprint 1:** se debe llevar un contador o usar `users/{uid}/sessions/{socketId}` para no marcar offline si todavía hay otra sesión.

### 3.2 Presencia (usuarios activos)

**Dos capas de presencia:**

| Capa | Dónde vive | Granularidad | Latencia | Uso |
|------|-----------|--------------|----------|-----|
| Global | `users/{uid}.online` en Firestore | Por usuario | ~250ms (escritura) | Mostrar "en línea" en lista de contactos |
| Por sala | `connectedUsers` Map en memoria del servidor | Por socket | Inmediata | Mostrar quién está en la sala AHORA |

**Por qué dos capas:** Firestore no escala bien para presencia (escrituras costosas y propagación lenta). El Map en memoria es perfecto para "quién está en mi sala" porque solo importa mientras la sala está activa. Si el servidor reinicia, se reconstruye al reconectarse los clientes.

### 3.3 Chat con historial persistente (○ — gap actual)

**Implementación actual (Sprint 0):** `send-message` solo retransmite con `io.to(roomId).emit('receive-message', ...)`. No escribe en Firestore. Si un usuario llega tarde, no ve los mensajes anteriores.

**Diseño objetivo (Sprint 1):**

```
Cliente A                  Backend                     Firestore
   │ emit 'send-message'      │                            │
   │   {roomId, content}      │                            │
   ├═════════════════════════▶│                            │
   │                          │ msg = {                    │
   │                          │   roomId, senderUid,       │
   │                          │   senderUsername,          │
   │                          │   content, type:'text',    │
   │                          │   createdAt: now           │
   │                          │ }                          │
   │                          │ db.collection('messages')  │
   │                          │   .add(msg) ╌╌╌╌╌╌╌╌╌╌╌╌╌╌▶│
   │                          │   ← docRef                 │
   │                          │ msg.id = docRef.id         │
   │                          │                            │
   │                          │ io.to(roomId).emit         │
   │ 'receive-message' (con id)│ ('receive-message', msg)  │
   │◀═════════════════════════│═══════════════════════════▶│ Cliente B
```

**Hidratación al unirse:**
```
on 'join-room' (roomId):
  socket.join(roomId)
  history = db.collection('messages')
              .where('roomId', '==', roomId)
              .orderBy('createdAt', 'desc')
              .limit(50)
              .get()
  socket.emit('chat-history', history)   ← solo al que se acaba de unir
  socket.to(roomId).emit('user-joined', ...)
```

**Garantía:** at-least-once. El cliente debe deduplicar por `msg.id` (Firestore docId es único).

**Índices Firestore requeridos:**
- `messages` compuesto: `roomId ASC, createdAt DESC`.
- `users` simple: `username ASC` (para `isUsernameTaken`).

---

## 4. WebRTC signaling

Documento detallado: **[`docs/sockets.md` §3](./sockets.md)**.

Resumen:

```
A ─emit 'webrtc-offer' {targetSocketId, sdp}─▶ Backend ─emit 'webrtc-offer' {fromSocketId, sdp}─▶ B
B ─emit 'webrtc-answer' {targetSocketId, sdp}─▶ Backend ─emit 'webrtc-answer'─▶ A
A,B ─emit 'ice-candidate' {targetSocketId, candidate}─▶ Backend ─reenvía─▶ peer
                          (se repite por cada candidato)
[conexión P2P establecida — media fluye fuera del servidor]
```

El backend **nunca** ve audio/video — solo intermedia el handshake. La compartición de pantalla (T4) reutiliza la misma `RTCPeerConnection` con un track distinto (`getDisplayMedia()`), sin tocar el signaling.

**Limitaciones conocidas (a tener en cuenta para Sprint 2+):**
- NAT simétrico: requiere TURN server. Render no provee uno; se puede usar el TURN gratuito de Twilio o `coturn` self-hosted.
- Mesh vs SFU: la implementación actual es mesh (P2P entre cada par). Para salas de >4 personas se vuelve costoso en CPU/ancho de banda; un SFU (mediasoup, LiveKit) lo arregla pero queda fuera del MVP.

---

## 5. Modelo de persistencia Firestore

### 5.1 Colección `users/{uid}` (✓)

```ts
{
  uid: string,
  username: string,         // único
  email: string,
  avatar: string,
  createdAt: Timestamp,
  online: boolean
}
```

**Operaciones:**
- Crear: `POST /api/auth/register` (✓).
- Leer perfil propio: `GET /api/auth/me` (✓).
- Validar username: `GET /api/auth/check-username/:username` (✓).
- Toggle online: socket connect/disconnect (✓).
- Editar/eliminar perfil: Sprint 1 (○).

### 5.2 Colección `rooms/{roomId}` (○)

```ts
{
  id: string,
  name: string,
  createdBy: string,        // host
  participants: string[],   // uids con acceso
  createdAt: Timestamp,
  isActive: boolean         // soft-delete
}
```

**Reglas de seguridad (planificación, Sprint 1):**
- Lectura: solo si `uid in participants`.
- Escritura: solo si `uid == createdBy`.
- Como el backend usa Admin SDK, **bypasa rules**. Las rules importan si en algún momento el frontend consulta Firestore directo — el plan actual es **no** hacerlo, todo pasa por REST.

### 5.3 Colección `messages/{messageId}` (○)

```ts
{
  id: string,
  roomId: string,           // indexed
  senderUid: string,
  senderUsername: string,   // denormalizado para evitar joins
  content: string,
  type: 'text' | 'system',
  createdAt: Timestamp      // indexed (compuesto con roomId)
}
```

**Por qué username denormalizado:** Firestore no tiene JOIN. Guardar el username en el mensaje evita una segunda lectura por mensaje al pintar el chat. Si el usuario cambia username, los mensajes viejos mantienen el antiguo (decisión consciente para evitar reescribir miles de mensajes).

**Lifecycle:** los mensajes sobreviven a la eliminación de la sala (soft-delete en `rooms`). En Sprint 3+ se puede agregar TTL o purga manual.

### 5.4 Resumen de índices

| Colección | Índice | Por qué |
|-----------|--------|---------|
| `users`   | `username ASC` | `isUsernameTaken` |
| `rooms`   | `participants ARRAY_CONTAINS, isActive ==` | listar mis salas activas |
| `messages`| `roomId ASC, createdAt DESC` | paginar historial por sala |

Firestore detecta y sugiere índices automáticamente la primera vez que una query los necesita (mensaje de error con enlace para crearlos).

---

## 6. Resumen de eventos Socket.IO

(Detalle en `docs/sockets.md`)

| Evento             | Dirección     | Persistencia Firestore   | Estado     |
|--------------------|---------------|---------------------------|------------|
| connection         | C→S           | `users.online = true`     | ✓          |
| disconnect         | C→S           | `users.online = false`    | ✓          |
| join-room          | C→S           | —                         | ✓          |
| user-joined        | S→sala        | —                         | ✓          |
| user-left          | S→sala        | —                         | ✓          |
| send-message       | C→S           | **`messages.add(...)`**   | ✓ retransmite / ○ persiste |
| receive-message    | S→sala        | —                         | ✓          |
| chat-history       | S→socket      | lee últimos 50            | ○          |
| webrtc-offer       | C↔C vía S     | —                         | ✓          |
| webrtc-answer      | C↔C vía S     | —                         | ✓          |
| ice-candidate      | C↔C vía S     | —                         | ✓          |
| room-updated       | S→sala        | —                         | ○          |
| room-closed        | S→sala        | —                         | ○          |

---

## 7. Decisiones pendientes / abiertas

- **Códigos de sala humanos** (`joinCode` 6 chars) vs solo `roomId` de 20 chars. Recomendación: agregar `joinCode` en Sprint 1 — mejor UX para compartir verbalmente.
- **Límite de participantes por sala:** sin definir. WebRTC mesh sugiere ≤ 4-6. Decidir en Sprint 2 cuando se prueben llamadas reales.
- **Edición y eliminación de perfil** (T1 ciclo de vida completo): qué pasa con las salas creadas por un usuario eliminado, qué pasa con sus mensajes. Decisión inicial: salas → cascade delete; mensajes → conservar con `senderUsername` denormalizado.
- **Rate limiting** en `send-message` y `POST /auth/register`: por definir. Posiblemente `express-rate-limit` + middleware Socket.IO casero. Sprint 2.
- **Reconexión:** Socket.IO trae reconnect automático; falta probar qué pasa con la presencia (debería re-marcar online sin parpadeos).
