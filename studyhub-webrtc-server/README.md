# studyhub-webrtc-server — Signaling Server WebRTC (Repositorio 3)

Servidor de **señalización WebRTC** para videollamadas, llamadas de audio y
compartir pantalla de StudyHub. Es un servicio **independiente** del
room-service (Repo 1) y del chat-service (Repo 2): se ejecuta en su propia
consola y se despliega en su propio servicio de Render.

> **Relay puro:** este servidor solo reenvía mensajes de señalización
> (offer / answer / ICE) entre navegadores. El audio y el video viajan
> **P2P directo** (con ayuda de STUN/TURN) y **nunca** pasan por aquí.

## Stack

- Node.js + TypeScript
- `socket.io` — transporte de señalización (WebSocket)
- `express` + `cors` — HTTP (health, diagnóstico, Swagger)
- `swagger-jsdoc` + `swagger-ui-express` — documentación técnica

## Arranque local

```bash
npm install
cp .env.example .env      # ajusta CORS_ORIGIN si hace falta
npm run dev               # nodemon + ts-node  →  http://localhost:8082
```

Compilar y correr en producción:

```bash
npm run build
npm start
```

| Recurso | URL |
|---|---|
| Health | http://localhost:8082/health |
| Salas/peers activos | http://localhost:8082/rooms |
| Swagger (Tarea 8) | http://localhost:8082/api/docs |

## Variables de entorno

| Variable | Default | Descripción |
|---|---|---|
| `PORT` | `8082` | Puerto HTTP/WS. En Render lo inyecta la plataforma. |
| `NODE_ENV` | `development` | Entorno. |
| `CORS_ORIGIN` | dev locales | Orígenes del frontend (coma-separados). |

## Contrato de eventos (Tareas 4-6)

### `introduction` (Tarea 4)
El peer entra a una sala y se presenta.

```js
// client → server
socket.emit("introduction", { roomId, uid, username, avatar });

// server → recién llegado  (quién está conectado)
// server → resto de la sala (quién entra)
socket.on("introduction", ({ roomId, self, peers }) => { /* ... */ });
```

### `signal` (Tarea 5)
Transporta offer / answer / ICE **sin modificar**. El server solo lo reenvía.

```js
// client → server
socket.emit("signal", { to: targetSocketId, signal });   // signal = SDP | ICECandidate

// server → destinatario
socket.on("signal", ({ from, signal }) => { /* ... */ });
```

### `participant_joined` / `participant_left` (lista de participantes)
```js
// server → sala
socket.on("participant_joined", ({ id, uid, username, avatar, micOn, camOn }) => { /* añadir a la lista */ });
socket.on("participant_left",   ({ id, uid, username, roomId }) => { /* quitar de la lista */ });
```

### `media-state` y eventos AV discretos (estados de micrófono / cámara)
Sincroniza mic/cam entre peers. Se guarda en el peer y se reenvía a la sala;
los que entran después lo reciben en `introduction` / `participant_joined`.

```js
// agregado
socket.emit("media-state", { micOn: true, camOn: false });
socket.on("media-state", ({ socketId, uid, micOn, camOn }) => { /* ... */ });

// discretos (el front puede emitirlos o escucharlos)
socket.emit("camera_off");                 // o camera_on / mic_on / mic_off
socket.on("camera_off", ({ id, uid }) => { /* actualizar UI */ });
socket.on("mic_on",     ({ id, uid }) => { /* actualizar UI */ });
```

### `stream-started` / `media-error`
```js
socket.emit("stream-started");                 // media local lista (logs)
socket.emit("media-error", { reason: "..." }); // no se pudo acceder a cámara/micro
```

### `disconnect` (Tarea 6)
Al salir, el peer se elimina de la sala y se avisa al resto:

```js
socket.on("peer-left", ({ socketId, uid, roomId }) => { /* cerrar conexión */ });
```

### Reconexión
`connectionStateRecovery` (≤2 min) recupera la sesión tras cortes breves sin
perder los `signal` en vuelo. Ver `docs/arquitectura.md`.

## Estructura de salas (Tarea 3)

Estado en memoria, una `Map` por sala (clave = `socket.id`):

```js
rooms = {
  "MATH-7GBK": Map {
    "socketIdA" => { socketId, uid, username, avatar },
    "socketIdB" => { ... }
  }
}
```

## Logs (Tarea 7)

```
[ts] INFO: Usuario conectado: <socketId>
[ts] INFO: Introduction: <username> (<socketId>) entró a la sala "<roomId>". Conectados ahora: N
[ts] INFO: Signal [OFFER]  reenviada: <socketIdA> → <socketIdB>
[ts] INFO: Signal [ANSWER] reenviada: <socketIdB> → <socketIdA>
[ts] INFO: Signal [ICE]    reenviada: <socketIdA> → <socketIdB>
[ts] INFO: Usuario desconectado: <username> (<socketId>) — motivo: <reason>
```

## Despliegue en Render

`render.yaml` ya define el servicio web. Pasos:

1. Sube este directorio como su propio repositorio Git.
2. En Render: **New → Blueprint** apuntando al repo (o **New → Web Service**).
3. Build: `npm install --include=dev && npm run build` · Start: `npm start`.
4. Configura `CORS_ORIGIN` con la URL del frontend.
5. Copia la URL pública resultante en el frontend → `VITE_WEBRTC_URL`.

## Frontend

El frontend conecta con `io(VITE_WEBRTC_URL)` y usa el hook `useWebRTC`
(cámara/micrófono, malla P2P y compartir pantalla). La config de servidores
ICE (STUN + TURN de ExpressTURN) vive en el frontend (`VITE_TURN_*`).
