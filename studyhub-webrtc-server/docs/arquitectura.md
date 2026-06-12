# Arquitectura WebRTC — StudyHub Signaling Server

## 1. Visión general

StudyHub usa **tres servicios backend independientes**, cada uno en su propio
repositorio y su propio despliegue de Render:

```
                 ┌────────────────────────────┐
                 │  room-service (Repo 1, :3000)│  salas, auth, chat persistente
   REST / WS ───▶│  chat-service (Repo 2, :8081)│  mensajería en tiempo real
                 │  signaling    (Repo 3, :8082)│  señalización WebRTC ◀── este
                 └────────────────────────────┘
```

El **signaling server** (este repo) solo coordina cómo los navegadores se
encuentran y negocian la conexión. El **audio/video viaja P2P** entre los
navegadores y **nunca pasa por el servidor**.

## 2. Por qué se necesita señalización

WebRTC establece conexiones directas navegador-a-navegador, pero los dos
extremos primero deben intercambiar:

1. **SDP (offer / answer)** — qué códecs, pistas y parámetros usarán.
2. **ICE candidates** — rutas de red posibles (IP/puerto locales, reflexivas
   vía STUN, o relay vía TURN).

Ese intercambio necesita un canal previo: ahí entra este servidor (un relay de
mensajes por Socket.IO). Una vez negociada la conexión, el media fluye P2P.

## 3. Topología: malla completa (mesh)

Para salas pequeñas (el grid es 2x2 → ≤4 personas) se usa **full mesh**: cada
par de participantes abre una `RTCPeerConnection` directa.

```
   A ───── B
   │ \   / │        N participantes → N·(N-1)/2 conexiones
   │   X   │        4 personas → 6 conexiones P2P
   │ /   \ │
   C ───── D
```

Por encima de ~5-6 personas el mesh se vuelve costoso (ancho de banda de subida)
y convendría un **SFU** (servidor que reenvía media). Fuera del alcance actual.

## 4. Flujo de señalización

```
A (ya en sala)                SIGNALING SERVER                 B (entra)
     │                              │                              │
     │                              │◀──── introduction(roomId) ───│
     │◀── introduction(peers:[B]) ──│──── introduction(peers:[A])─▶│
     │                              │                              │
     │   (el de socketId mayor inicia la oferta; aquí, B)          │
     │                              │◀──── signal(offer → A) ──────│
     │◀──── signal(offer, from:B) ──│                              │
     │───── signal(answer → B) ────▶│──── signal(answer, from:A)──▶│
     │◀──── signal(ICE) ◀──────────▶│◀──────── signal(ICE) ───────▶│
     │                              │                              │
     │═══════════ media P2P (audio/video/pantalla) ═══════════════│
```

### ICE: STUN + TURN

La config de servidores ICE vive en el **frontend** (`VITE_TURN_*`):

- **STUN** (Google) — el peer descubre su IP pública (NAT reflexiva). Gratis,
  suficiente en redes simples.
- **TURN** (ExpressTURN) — relay de media cuando la conexión directa es
  imposible (NAT simétrica, firewalls). Garantiza que la llamada funcione.

## 5. Sincronización de participantes

Además de la malla, el servidor mantiene sincronizada la **lista de
participantes** para la UI del front:

- **`participant_joined`** `{ id, uid, username, avatar, micOn, camOn }` — al
  entrar alguien. Lleva ID, nombre y **estado inicial AV**.
- **`participant_left`** `{ id, uid, username, roomId }` — al salir alguien
  (en paralelo a `peer-left`, que cierra la conexión P2P de la malla).

La estructura `rooms` (una `Map` por sala) es la fuente de verdad de quién está
activo en cada momento.

## 6. Estados de medios (mic / cam)

El estado de micrófono/cámara se sincroniza de **dos formas complementarias**:

1. **`media-state`** `{ socketId, uid, micOn, camOn }` — estado agregado, usado
   por la malla y para sembrar a los nuevos joiners.
2. **Eventos discretos** `camera_on` / `camera_off` / `mic_on` / `mic_off`
   `{ id, uid }` — uno por cambio, pensados para que el front actualice la UI de
   forma puntual. El front puede **emitirlos** o **escucharlos**.

```
B apaga su cámara
     │── camera_off  (o media-state{camOn:false}) ─▶ SERVER
                                                     │  guarda peer.camOn=false
                                                     │── media-state(...) ───────▶ resto de la sala
                                                     │── camera_off({id,uid}) ───▶ resto de la sala
```

Los participantes que entran **después** reciben el estado actual dentro de
`introduction` / `participant_joined` (cada `PeerInfo` incluye `micOn`/`camOn`).

## 7. Reconexión y estabilidad

Aunque el media no pasa por el servidor, la **sesión de señalización debe
mantenerse estable** mientras hay streams activos:

- **`connectionStateRecovery`** (≤2 min): ante un corte breve (cambio de red,
  suspensión del equipo), el cliente recupera la **misma** sesión sin perder los
  `signal` en vuelo. El servidor detecta `socket.recovered`, re-registra al peer
  en su sala y reavisa con `introduction` para rehacer la malla.
- **Reintentos del cliente:** Socket.IO reconecta solo; al `connect`, el
  frontend re-emite `introduction`, así que la malla se rehace incluso si la
  recuperación de estado expiró.
- **Limpieza determinista:** al `disconnect` se emite `peer-left` y el peer se
  borra de la sala; si la sala queda vacía, se libera de memoria.

### Manejo de errores y diagnóstico

El servidor registra (y, cuando aplica, informa a la sala) el ciclo de vida
completo de la conexión:

| Situación | Quién la detecta | Evento / Log |
|---|---|---|
| Permisos de cámara/micro concedidos | cliente (`getUserMedia`) | `permissions-granted` → log `Permisos obtenidos` |
| Conexión P2P establecida | cliente (`pc.connectionState=connected`) | `connection-state` → log `Conexión iniciada (P2P establecida)` |
| **Fallo de conexión P2P** | cliente (`pc.connectionState=failed`) | `connection-state` → log `ERROR Fallo de conexión WebRTC` + `connection-error` a la sala |
| Conexión P2P interrumpida | cliente (`disconnected`) | `connection-state` → log `Conexión WebRTC interrumpida` |
| Error de cámara/micro | cliente (`getUserMedia` falla) | `media-error` → log `ERROR Error multimedia` |
| Handshake de señalización rechazado | servidor (`engine.connection_error`) | log `Conexión Socket.IO rechazada` |
| Reconexión recuperada | servidor (`socket.recovered`) | log `Reconexión` |
| Desconexión | servidor (`disconnect`) | log `Usuario desconectado` + `peer-left`/`participant_left` |

Los fallos de la conexión **P2P** no los puede ver el servidor directamente
(el media no pasa por él), por eso el **cliente los reporta** vía
`connection-state`; el servidor los centraliza en logs y los reenvía a la sala.

## 8. Estado en memoria

```js
rooms = {
  "MATH-7GBK": Map {
    "socketIdA" => { socketId, uid, username, avatar, micOn, camOn },
    "socketIdB" => { ... }
  }
}
```

Es **efímero**: si el servicio reinicia (deploy, escalado), los clientes se
reconectan y vuelven a emitir `introduction`. No hay base de datos: la
autorización de la sala la hace el room-service (Repo 1).

## 9. Seguridad / límites

- El servidor es un **relay puro**: no inspecciona ni almacena el contenido
  multimedia.
- CORS restringido a los orígenes del frontend (`CORS_ORIGIN`).
- La pertenencia a la sala se valida en el room-service; aquí el `roomId` actúa
  como canal de agrupación de la señalización.
- Plan free de Render: el servicio "duerme" tras inactividad; la primera
  conexión puede tardar ~30-50 s en despertar.
