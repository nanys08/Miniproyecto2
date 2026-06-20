# C1 — Implementar Cliente WebRTC

**Sprint 4 · Frontend (React + TypeScript) · StudyHub**
**Módulos:** `services/webrtcSocket.ts`, `services/webrtcService.ts`, `hooks/useWebRTC.ts`
**Rol:** Cliente WebRTC que se conecta al Signaling Server (Repo 3), negocia las conexiones P2P en malla y gestiona los peers.

---

## Objetivo

Conectar la aplicación React al **Signaling Server WebRTC** y construir el cliente
que crea las `RTCPeerConnection`, intercambia `offer` / `answer` / `ICE` a través
del socket de señalización, y mantiene un mapa de peers con su estado. El audio y
el video viajan **P2P directo** entre navegadores; el servidor solo reenvía la
señalización.

---

## Tarea 1 — Conectar React al nuevo servidor

**Qué se debía implementar:** además de los sockets ya existentes (Backend
principal y Chat), añadir un tercer socket para WebRTC (`socketWebRTC`).

**Implementación (`services/webrtcSocket.ts`):**

- Socket **dedicado e independiente** del socket del room-service (puerto 3000) y
  del chat-service (8081). Apunta al signaling-server.
- Se crea una conexión **nueva por llamada**; el hook `useWebRTC` es dueño de su
  ciclo de vida y la desconecta al salir de la sala.

```ts
export function createWebrtcSocket(): Socket {
  return io(WEBRTC_URL, {
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });
}
```

- La URL se resuelve por prioridad: `VITE_WEBRTC_URL` → `localhost:8082` en
  desarrollo → servicio de Render en producción.

| Socket | Servicio | Uso |
|---|---|---|
| Backend | room-service (:3000) | salas, auth, presencia |
| Chat | chat-service (:8081) | mensajería en tiempo real |
| **WebRTC** | **signaling-server (:8082)** | **offer / answer / ICE** |

---

## Tarea 2 — Validar soporte del navegador

**Qué se debía implementar:** comprobar `window.RTCPeerConnection` y mostrar
*"Tu navegador no soporta WebRTC"* si no está disponible.

**Implementación (`services/webrtcService.ts`):**

```ts
export function isWebRTCSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.RTCPeerConnection === "function" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  );
}
```

- `useWebRTC` evalúa esto una vez (`supported`). Si es `false`, no intenta acceder
  a medios y la UI muestra la pantalla **"Navegador no compatible"** con el mensaje
  *"Tu navegador no soporta WebRTC"*.

---

## Tarea 3 — Crear el servicio WebRTC

**Qué se debía implementar:** un servicio (`services/webrtcService.js`)
responsable de la lógica de `offer` / `answer` / `ICE`.

**Implementación (`services/webrtcService.ts`):** centraliza la "fontanería"
WebRTC que usa el hook:

- `isWebRTCSupported()` — soporte del navegador (Tarea 2).
- `getIceServers()` / `buildPeerConfig()` — configuración STUN + TURN (Tarea 6).
- `createPeerConnection()` — fábrica de `RTCPeerConnection` ya configurada.
- `rtcLog()` / `rtcWarn()` / `logIceConfig()` — logger de cliente para la demo.

El intercambio de offer/answer/ICE lo orquesta `useWebRTC`, que delega aquí la
configuración y el registro.

---

## Tarea 4 — Escuchar `introduction`

**Qué se debía implementar:** al recibir `introduction`, crear los peers.

**Implementación (`hooks/useWebRTC.ts`):**

```ts
socket.on("introduction", onIntroduction);

const onIntroduction = ({ peers }) => {
  const selfId = socket.id;
  peers.forEach((p) => {
    if (!p.socketId || p.socketId === selfId) return;
    if (p.uid) uidBySocketRef.current.set(p.socketId, p.uid); // sembrar uid
    // El peer con socketId MAYOR inicia la oferta (anti-glare):
    if (selfId > p.socketId) ensurePeer(p.socketId, p.uid);
    // Si somos el menor, esperamos su oferta.
  });
};
```

- Por cada peer recibido se decide **quién inicia** la conexión comparando el
  `socketId` local con el remoto (se usa **nuestro propio `socket.id`**, no el
  `self` del payload — fix crítico que hacía que la conexión solo cuajara ~50% de
  las veces).
- También se siembra el `uid` y el estado inicial mic/cam del peer.

---

## Tarea 5 — Escuchar `signal`

**Qué se debía implementar:** al recibir `signal`, procesar `offer`, `answer` e
`ICE`.

**Implementación:** patrón **perfect negotiation** (MDN) para soportar
renegociación (al compartir pantalla) sin colisiones:

```ts
const onSignal = async ({ from, signal }) => {
  const ctx = ensurePeer(from, uidBySocketRef.current.get(from));
  const { pc } = ctx;
  if (isSdp(signal)) {                       // OFFER / ANSWER
    const collision = signal.type === "offer" &&
      (ctx.makingOffer || pc.signalingState !== "stable");
    ctx.ignoreOffer = !ctx.polite && collision;
    if (ctx.ignoreOffer) return;
    await pc.setRemoteDescription(signal);
    if (signal.type === "offer") {
      await pc.setLocalDescription();
      socket.emit("signal", { to: from, signal: pc.localDescription }); // ANSWER
    }
  } else {
    await pc.addIceCandidate(signal);        // ICE
  }
};
```

---

## Tarea 6 — Crear `RTCPeerConnection`

**Qué se debía implementar:** `new RTCPeerConnection()` configurada con STUN, TURN
e ICE.

**Implementación (`services/webrtcService.ts`):**

```ts
export function getIceServers(): RTCIceServer[] {
  return [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302", ...] },
    // TURN del entorno (VITE_TURN_*) o fallback (ExpressTURN + Open Relay TCP/443)
  ];
}

export function createPeerConnection(): RTCPeerConnection {
  return new RTCPeerConnection({
    iceServers: getIceServers(),
    iceTransportPolicy: "all",
    bundlePolicy: "max-bundle",
  });
}
```

| Servidor ICE | Función |
|---|---|
| **STUN** (Google) | descubrir la IP pública (NAT reflexiva). |
| **TURN** (ExpressTURN / Open Relay) | relay cuando el P2P directo es imposible (NAT simétrica, firewalls). Incluye TCP/443 para redes que bloquean UDP. |

La config TURN vive en variables de entorno (`VITE_TURN_*`) con un fallback en código.

---

## Tarea 7 — Gestionar peers

**Qué se debía implementar:** estructura de peers que guarde `socketId`,
`peerConnection` y estado.

**Implementación (`hooks/useWebRTC.ts`):** un `Map<socketId, PeerCtx>`:

```ts
interface PeerCtx {
  socketId: string;                       // clave del mapa
  pc: RTCPeerConnection;                   // la conexión
  polite: boolean;                         // rol (perfect negotiation)
  makingOffer: boolean;
  ignoreOffer: boolean;
  uid?: string;                            // uid del participante
  connectionState: RTCPeerConnectionState; // estado P2P
}
const peersRef = useRef<Map<string, PeerCtx>>(new Map());
```

- `ensurePeer()` crea o devuelve el peer, adjunta las pistas locales y registra los
  handlers (`onicecandidate`, `ontrack`, `onnegotiationneeded`,
  `onconnectionstatechange`, …).
- `onconnectionstatechange` guarda el estado del peer y lo reporta al servidor vía
  `connection-state` (`connected` / `failed` / `disconnected`).

---

## Tarea 8 — Manejo de desconexión

**Qué se debía implementar:** escuchar `disconnect` / salida de un peer, eliminarlo
y actualizar la UI.

**Implementación:**

```ts
socket.on("peer-left", ({ socketId, uid }) => {
  rtcLog(`Peer desconectado: ${uid ?? socketId}`);
  closePeer(socketId);   // cierra la RTCPeerConnection y limpia los handlers
});
```

`closePeer()` cierra la conexión, la borra del mapa, elimina el stream remoto
asociado y actualiza `peerState` → la UI quita el tile / lo marca "Desconectado".
Al desmontar la sala se cierran **todos** los peers y se desconecta el socket
(lo que dispara `disconnect` en el server → `peer-left` para el resto).

---

## Logs de cliente

El servicio imprime el flujo completo en la consola del navegador con prefijo
`[WebRTC]`:

```
[WebRTC] Juan conectado <socketId>
[WebRTC] Introduction enviada { roomId }
[WebRTC] RTCPeerConnection creada con <peer> (rol: impolite)
[WebRTC] Offer enviada → <peer>
[WebRTC] Answer recibida ← <peer>
[WebRTC] ICE enviado → <peer> [srflx]
[WebRTC] ICE recibido ← <peer>
[WebRTC] P2P establecida con <peer>
```

`logIceConfig()` además imprime la configuración STUN/TURN efectiva al iniciar la
llamada (primera pista para diagnosticar fallos de NAT).

---

## Entregables Frontend (C1)

| Entregable | Estado |
|---|---|
| Conexión al servidor WebRTC | ✅ `webrtcSocket.ts` (socket dedicado) |
| `RTCPeerConnection` | ✅ `createPeerConnection()` (STUN+TURN+ICE) |
| Offer / Answer / ICE | ✅ perfect negotiation en `useWebRTC` |
| Peers | ✅ `Map<socketId, PeerCtx>` |
| Reconexión | ✅ reconexión Socket.IO + re-`introduction` |
| Logs cliente | ✅ `[WebRTC]` (conectado/offer/answer/ICE/P2P) |

---

## Demo final del C1

Con **Juan** (Navegador 1) y **Ana** (Navegador 2), la consola muestra:

```
Juan conectado
Ana conectada
Introduction enviada
Offer enviada
Answer recibida
ICE recibido
P2P establecida
```

Resultado: ambos navegadores establecen la conexión P2P y quedan listos para
transmitir audio/video (C2).
