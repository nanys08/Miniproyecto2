# Eventos Socket.IO y Signaling WebRTC

Documento de eventos en tiempo real del backend. Cubre las historias **TS-02** (chat / presencia) y **TS-03** (signaling WebRTC para audio, video y compartición de pantalla).

---

## 1. Conexión y autenticación

El cliente abre la conexión Socket.IO enviando el Firebase ID Token en el handshake:

```ts
import { io } from "socket.io-client";

const socket = io("http://localhost:3000", {
  auth: { token: firebaseIdToken },
});
```

Flujo en el servidor (`src/sockets/socketManager.ts`):

1. Middleware `io.use(...)` verifica el token con `admin.auth().verifyIdToken()`.
2. Si es válido, guarda `uid` en `socket.data.uid` y deja pasar la conexión.
3. Si no, emite el error `Token inválido` o `Token requerido` y rechaza la conexión.

Una vez conectado, el backend:
- Lee el perfil del usuario desde Firestore (`users/{uid}`).
- Registra al usuario en el mapa en memoria `connectedUsers: socketId → { uid, username, roomId }`.
- Marca al usuario `online: true` en Firestore.

---

## 2. TS-02 — Eventos de chat y presencia

### 2.1 `join-room` (cliente → servidor)

El usuario se une a una sala de estudio.

**Payload:** `roomId: string`

**Efecto:**
- `socket.join(roomId)`.
- Actualiza `connectedUsers` con el `roomId`.
- Emite `user-joined` a los demás miembros de la sala.

```ts
socket.emit("join-room", "sala-abc123");
```

### 2.2 `user-joined` (servidor → cliente)

Notifica a los miembros de una sala que un nuevo usuario se unió.

**Payload:**
```ts
{ uid: string; username: string }
```

### 2.3 `send-message` (cliente → servidor)

Envía un mensaje de texto al room.

**Payload:**
```ts
{ roomId: string; content: string }
```

**Efecto:** el servidor construye el mensaje con `senderUid`, `senderUsername`, `createdAt` y lo retransmite con `receive-message` a **todos** los sockets en `roomId` (incluido el emisor para confirmación visual).

> ⚠️ **Pendiente Sprint 1:** persistir el mensaje en la colección `messages` antes de retransmitir, para soportar el requisito T2 de "historial recuperable desde la base de datos".

### 2.4 `receive-message` (servidor → cliente)

**Payload:**
```ts
{
  senderUid: string;
  senderUsername: string;
  content: string;
  roomId: string;
  createdAt: string; // ISO-8601
}
```

### 2.5 `user-left` (servidor → cliente)

Se emite cuando un socket que estaba en una sala se desconecta.

**Payload:**
```ts
{ uid: string; username: string }
```

### 2.6 `disconnect` (cliente → servidor — evento nativo)

Disparado automáticamente por Socket.IO al cerrar la conexión.

**Efecto:**
- Emite `user-left` a la sala (si tenía `roomId`).
- Elimina al socket de `connectedUsers`.
- Marca al usuario `online: false` en Firestore.

---

## 3. TS-03 — Signaling WebRTC

Socket.IO actúa como **signaling server**: transporta SDP e ICE candidates entre pares; **no** maneja media. La media (audio, video, screen-share) viaja P2P por WebRTC entre los navegadores.

Patrón usado: emisor envía al servidor el `targetSocketId`, el servidor reenvía al socket destino añadiendo `fromSocketId`.

### 3.1 `webrtc-offer`

Oferta SDP del que inicia la llamada.

**Cliente → servidor:**
```ts
{
  targetSocketId: string;
  sdp: { type: "offer" | "answer" | "pranswer" | "rollback"; sdp?: string };
}
```

**Servidor → cliente destino:**
```ts
{ fromSocketId: string; sdp: { type, sdp } }
```

### 3.2 `webrtc-answer`

Respuesta SDP del receptor.

Mismo shape que `webrtc-offer`.

### 3.3 `ice-candidate`

Candidato ICE recolectado por uno de los peers.

**Cliente → servidor:**
```ts
{
  targetSocketId: string;
  candidate: {
    candidate: string;
    sdpMid?: string | null;
    sdpMLineIndex?: number | null;
  };
}
```

**Servidor → cliente destino:**
```ts
{ fromSocketId: string; candidate: {...} }
```

---

## 4. Flujo completo de una llamada (TS-03 / T4)

```
A: getUserMedia()                         B: getUserMedia()
A: pc.createOffer() → setLocalDescription
A ──webrtc-offer──▶ servidor ──webrtc-offer──▶ B
                                            B: setRemoteDescription
                                            B: pc.createAnswer() → setLocalDescription
B ──webrtc-answer──▶ servidor ──webrtc-answer──▶ A
A: setRemoteDescription

A ──ice-candidate──▶ servidor ──ice-candidate──▶ B
B ──ice-candidate──▶ servidor ──ice-candidate──▶ A
        (se repite por cada candidato recolectado)

(conexión P2P establecida — media fluye sin pasar por el servidor)
```

Para **compartición de pantalla** (T4), el frontend usa `navigator.mediaDevices.getDisplayMedia()` y reemplaza el track de video en la misma `RTCPeerConnection`; el flujo de signaling no cambia.

---

## 5. Resumen de eventos

| Evento             | Dirección        | Historia | Propósito                                    |
|--------------------|------------------|----------|----------------------------------------------|
| `join-room`        | cliente → server | TS-02    | Entrar a una sala                            |
| `user-joined`      | server → sala    | TS-02    | Avisar de nuevo miembro                      |
| `send-message`     | cliente → server | TS-02    | Enviar mensaje al room                       |
| `receive-message`  | server → sala    | TS-02    | Difundir mensaje                             |
| `user-left`        | server → sala    | TS-02    | Avisar de salida                             |
| `disconnect`       | cliente → server | TS-02    | Limpiar estado y marcar offline              |
| `webrtc-offer`     | bidireccional    | TS-03    | Iniciar negociación SDP                      |
| `webrtc-answer`    | bidireccional    | TS-03    | Aceptar negociación SDP                      |
| `ice-candidate`    | bidireccional    | TS-03    | Intercambiar candidatos ICE para NAT/STUN    |
