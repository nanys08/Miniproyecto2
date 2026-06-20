# Sprint 5 — Control de Audio/Video y Compartir Pantalla

**Proyecto:** StudyHub · Salón de Estudio Colaborativo
**Capa:** Frontend (React + TypeScript) sobre el Signaling Server WebRTC (Repo 3)
**Módulos clave:** `hooks/useWebRTC.ts`, `pages/RoomPage.tsx`, `components/room/ParticipantCard.tsx`, `components/room/VideoGrid.tsx`

Este documento cubre los cinco componentes del sprint:

| Comp. | Tema | Resumen |
|---|---|---|
| **C1** | Control real de audio/video | Mute/cámara reales sobre el track, anuncio por socket, avatar, accesibilidad. |
| **C2** | UI en tiempo real | Sincronizar indicadores AV de los participantes remotos al instante. |
| **C3** | Compartir pantalla | `getDisplayMedia`, sustituir la pista de cámara, layout spotlight, errores. |
| **C4** | Estabilidad WebRTC | `replaceTrack` sin renegociar, monitoreo de `connectionState`/`iceConnectionState`. |
| **C5** | Documentación | JSDoc, diagramas de flujo y mapa de la documentación del proyecto. |

---

## Nota importante sobre los nombres de eventos

El enunciado usa nombres ilustrativos (`mic_state_changed`, `camera_state_changed`,
`participant_mic_changed`, `participant_camera_changed`). **La implementación real
no usa esos nombres**: usa el contrato ya desplegado en el Signaling Server (Repo 3),
que es equivalente funcionalmente:

| Concepto del enunciado | Evento real implementado |
|---|---|
| `mic_state_changed` / `camera_state_changed` (emitir) | `media-state` agregado `{ micOn, camOn, presenting }` |
| `participant_mic_changed` / `participant_camera_changed` (escuchar) | `media-state` (server → sala) + discretos `mic_on`/`mic_off`/`camera_on`/`camera_off` |
| "compartiendo pantalla" | campo `presenting` dentro de `media-state` |

El estado completo (no diffs) viaja en `media-state`; los eventos discretos
(`mic_on`, etc.) son una vía alterna para refrescar un solo campo. Todo esto está
documentado en el Swagger del Signaling Server (`studyhub-webrtc-server/src/config/swagger.ts`).

---

# C1 — Control real de audio y video

**Objetivo:** que mutear y apagar la cámara actúen sobre la pista real (no solo la UI),
se anuncien a la sala y sean accesibles.

### Tarea 1 — Controles multimedia (botones)

La barra inferior de `RoomPage.tsx` define los controles (`controls: ToggleControl[]`,
`pages/RoomPage.tsx:385`):

| Botón | `aria-label` dinámico | Acción |
|---|---|---|
| 🎤 Micrófono | `Silenciar micrófono` / `Activar micrófono` | `toggleMic` |
| 📷 Cámara | `Apagar cámara` / `Encender cámara` | `toggleCam` |
| 🖥 Pantalla | `Compartir pantalla` / `Dejar de compartir` | `toggleScreenShare` |

### Tarea 2 — Mute real (audio)

`toggleMic` (`hooks/useWebRTC.ts:967`) actúa sobre la **pista de audio**, exactamente
como pide el enunciado:

```ts
localStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = next));
```

- `enabled = false` → la pista deja de transmitir muestras: **nadie te escucha**, pero
  la conexión sigue viva (no se renegocia, no se cierra el track).
- `enabled = true` → el audio vuelve al instante.

### Tarea 3 — Apagado de cámara (video)

`toggleCam` (`hooks/useWebRTC.ts:980`) actúa sobre la **pista de video**:

```ts
if (!screenSharing) {
  localStreamRef.current?.getVideoTracks().forEach((t) => (t.enabled = next));
}
```

> Detalle: si estás **compartiendo pantalla**, el sender de video lleva la pantalla,
> así que el toggle no toca esa pista — solo afecta la cámara real cuando vuelve.

### Tarea 4 — Anunciar el cambio por socket

Tras cada toggle se emite el estado a la sala (`emitMediaState`, `hooks/useWebRTC.ts:355`):

```ts
emitMediaState({ micOn: next, camOn }); // → socket.emit("media-state", …)
```

Esto reemplaza a los `mic_state_changed`/`camera_state_changed` del enunciado con el
evento agregado `media-state` (ver nota arriba). Además se notifica al room-service
vía `onLocalMediaChange` para la presencia del grid.

### Tarea 5 — Actualizar la UI local

El hook expone `micOn` / `camOn` como estado React; los botones cambian icono y
`aria-label` según ese estado (`RoomPage.tsx:387` y `:405`). El tile propio en
`ParticipantCard` muestra el micrófono tachado en rojo y el icono de cámara apagada.

### Tarea 6 — Mostrar avatar cuando la cámara está apagada

En `ParticipantCard.tsx:74`, `showVideo = !!stream && !cameraOff && !disconnected`.
Cuando la cámara está apagada se oculta el `<video>` y se renderiza el **avatar + nombre**
sobre fondo oscuro (`ParticipantCard.tsx:199-217`).

### Tarea 7 — Escuchar la sincronización (remotos)

El listener `onRemoteMediaState` (`hooks/useWebRTC.ts:879`) recibe el `media-state` de
otros peers y actualiza `remoteMedia[uid] = { micOn, camOn, presenting }`. También se
escuchan los discretos `mic_on/off`, `camera_on/off` (`:911-914`) que parchean un solo
campo. Esa es la "actualización de participantes remotos" que pide el enunciado.

### Tarea 8 — Accesibilidad

- Botones con `aria-label` dinámico y `focus-visible:ring`.
- `ParticipantCard` es `role="region"` con `aria-label` que resume nombre + estado
  ("micrófono silenciado", "cámara apagada", etc., `ParticipantCard.tsx:88-96`).
- Navegación por teclado: controles son `<button>` reales, enfocables y activables con
  Enter/Espacio.

### Entregable C1 (demo)

```
Ana entra → silencia mic → todos ven 🔇 (mic tachado) → nadie la escucha
         → apaga cámara → todos ven su avatar → el video deja de transmitirse
         → reactiva cámara → vuelve el video → reactiva mic → vuelve el audio
```

---

# C2 — UI en tiempo real (estados AV de los participantes)

**Objetivo:** que cuando un participante cambie su mic/cámara, el resto lo vea de inmediato.

### Tarea 1 — Escuchar los eventos de cambio

Igual que C1-Tarea 7: `media-state` + discretos (`hooks/useWebRTC.ts:924-928`). El
estado remoto vive en `remoteMedia` y se inyecta a cada tile.

### Tarea 2 — Actualizar `ParticipantCard`

`ParticipantCard` recibe `micOff` / `cameraOff` y muestra:

| Estado | Indicador |
|---|---|
| Mic activo | 🎙 (icono blanco) |
| Mic silenciado | micrófono tachado en **rojo** (`ParticipantCard.tsx:260`) |
| Cámara activa | video visible |
| Cámara apagada | icono de cámara tachada + avatar (`:274`) |
| Hablando | borde verde + ondas de audio (`:243`) |

### Tarea 3 — Sincronizar la lista de participantes

`RoomPage` combina la lista de participantes (presencia) con `remoteMedia` para construir
los `tiles` (`RoomPage.tsx` ~`:520-575`). Cada evento de socket dispara un re-render con
el estado AV correcto.

### Tarea 4 — Avatar + indicador cuando la cámara está apagada

Ya descrito (C1-Tarea 6): avatar de fondo **más** icono de cámara tachada en la barra
inferior del tile.

### Tarea 5 — Estado inicial al entrar

El que entra recibe el estado de todos sin esperar un cambio: el Signaling Server guarda
`micOn`/`camOn`/`presenting` en cada `PeerInfo` y los envía dentro de la lista `peers`
del evento `introduction`. El frontend los siembra al procesar `introduction`
(`onIntroduction`) y al recibir `media-state` (`:825`, `:894`).

### Tarea 6 — Accesibilidad

`aria-label` por tile resume el estado ("micrófono silenciado", "cámara apagada"),
`aria-hidden` en los iconos decorativos y badges con `aria-live="polite"`.

### Entregable C2 (demo)

```
Juan, Ana y Carlos entran → Juan silencia mic → Ana y Carlos ven 🔇 en el tile de Juan
                          → Juan apaga cámara → ambos ven el avatar de Juan
                          → Juan reactiva todo → el cambio se ve al instante en todos
```

---

# C3 — Compartir pantalla

**Objetivo:** capturar la pantalla, sustituir la pista de cámara y verla en todos los clientes.

### Tarea 1-2 — `getDisplayMedia()` y capturar `screenStream`

`startScreenShare` (`hooks/useWebRTC.ts:1020`):

```ts
display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
const screenTrack = display.getVideoTracks()[0];
screenTrackRef.current = screenTrack; // guardado para restaurar luego
```

### Tarea 3 — Reemplazar la pista de cámara en cada `RTCPeerConnection`

```ts
peersRef.current.forEach((ctx) => {
  const sender = ctx.pc.getSenders().find((s) => s.track?.kind === "video");
  if (sender) sender.replaceTrack(screenTrack);   // sin renegociar
  else ctx.pc.addTrack(screenTrack, localStreamRef.current ?? display); // renegocia
});
```

- **Caso normal (cámara activa):** `replaceTrack` cambia la pantalla en caliente, **sin**
  crear una conexión nueva ni intercambiar nuevos `offer/answer` (clave de C4).
- **Caso solo-audio (cámara denegada):** no hay sender de video → `addTrack`, que sí
  dispara una renegociación. Se asocia al stream del **micrófono** (no a `display`) para
  no perder el audio en el remoto (comentario en `:1039-1045`).

### Tarea 4 — Detectar finalización

```ts
screenTrack.onended = () => stopScreenShare();
```

Cubre el botón "Detener" del propio navegador. `stopScreenShare` (`:999`) restaura la
cámara con `replaceTrack(camTrack)` (o `removeTrack` si no había cámara) y anuncia
`presenting: false`.

### Tarea 5 — Indicador visual

El presentador emite `media-state { presenting: true }` (`:1054`). En cada tile el badge
**"🖥 Presentando"** aparece mientras dure (`ParticipantCard.tsx:147-157`).

### Tarea 6 — Layout (spotlight + miniaturas)

`VideoGrid` cambia de **grid** a **escenario (spotlight)** cuando alguien presenta
(`VideoGrid.tsx:103`): la pantalla compartida ocupa el escenario grande (con
`objectContain` para no recortar) y el resto pasa a una **tira de miniaturas**
(`VideoGrid.tsx:107-118`). Cualquiera puede además fijar a un participante con el botón
de "Fijar en el escenario".

### Tarea 7 — Manejo de errores

Si el usuario **cancela** el diálogo o falla el permiso, `getDisplayMedia` lanza y se
captura silenciosamente (`try/catch` en `:1027`): no se rompe la llamada ni se emite nada.
La incompatibilidad de navegador ya se filtra antes con `isWebRTCSupported()`.

### Tarea 8 — Accesibilidad

Botón con `aria-label="Compartir pantalla"` / `"Dejar de compartir"`, enfocable y
operable por teclado; badge "Presentando" con `aria-live="polite"`.

### Entregable C3 (demo)

```
Juan presiona "Compartir pantalla" → elige VS Code
   → Ana y Carlos ven VS Code (spotlight) → Juan detiene
   → la cámara de Juan vuelve automáticamente → todos vuelven a ver a Juan
```

---

# C4 — Estabilidad de la conexión WebRTC

**Objetivo:** que cambiar streams (mute, cámara, pantalla) nunca tire la conexión.

### Tareas 1-2 — `replaceTrack()` y restaurar el track original

La compartición usa `replaceTrack` (C3-Tarea 3) para **no** crear una conexión nueva, y
`stopScreenShare` restaura `cameraTrackRef.current` igual con `replaceTrack`
(`hooks/useWebRTC.ts:1008`). El mismo patrón se usa para cambiar de micrófono/cámara en
vivo (`switchAudioDevice`/`switchVideoDevice`, `:1069`) sin renegociar.

### Tareas 3-4 — Audio y video independientes

`enabled = false` (mute / cámara off) **no** desconecta ni renegocia: solo silencia esa
pista. Mutear no afecta al video y apagar la cámara no afecta al audio (son tracks
distintos del mismo `RTCPeerConnection`).

### Tarea 5 — Detectar errores de media

- Pista terminada → `screenTrack.onended` restaura la cámara.
- `getUserMedia`/`getDisplayMedia` clasifican fallos (`NotAllowedError`, `NotFoundError`,
  `NotReadableError`/`AbortError`) en mensajes claros (panel de permisos en `RoomPage`).
- Fallos reportados por el peer se difunden vía `media-error`.

### Tarea 6 — Monitorear el `PeerConnection`

Cada peer registra handlers en `ensurePeer` (`hooks/useWebRTC.ts:464-567`):

| Handler | Para qué |
|---|---|
| `onconnectionstatechange` | guarda `connectionState`, espeja por uid (tile "Desconectado"), y reporta al server `connection-state` (`connected`/`failed`/`disconnected`). |
| `oniceconnectionstatechange` | detecta `failed` (NAT sin TURN / TURN vencido) y lo loguea. |
| `onicecandidateerror` | TURN rechazando credenciales (401/701). |
| `ontrack` | engancha el stream remoto al tile por uid. |

### Tarea 7 — Accesibilidad (anuncios)

Badges con `aria-live` anuncian "Reconectando" / "Desconectado" / "Presentando";
el punto de estado de conexión cambia de color (verde/ámbar/rojo).

### Entregable C4 (prueba extrema)

```
Mutear → desmutear → apagar cámara → prender → compartir pantalla → detener
       → compartir otra vez → mutear otra vez
```
Durante todo eso: **no se cae WebRTC, no se pierde audio/video, nadie se desconecta y
Socket.IO sigue vivo**, porque todos los cambios usan `enabled` o `replaceTrack` (sin
recrear conexiones).

---

# C5 — Documentación

**Objetivo:** que el profesor encuentre y entienda toda la lógica WebRTC.

### Tareas 1-3 — Inicialización, PeerConnection y `replaceTrack`

- **`getUserMedia()`**: captura cámara+micro al activar dispositivos (`startMedia`).
- **`getDisplayMedia()`**: captura la pantalla (`startScreenShare`).
- **`RTCPeerConnection`**: se **crea** en `createPeerConnection()` (STUN+TURN+ICE), se
  **reutiliza** vía `ensurePeer()` (un peer por socketId, en `peersRef`), y se **destruye**
  en `closePeer()` (cierra `pc`, limpia handlers, borra el stream remoto).
- **`replaceTrack()`**: clave de compartir pantalla y del cambio de dispositivo en vivo —
  sustituye la pista del sender **sin renegociar**.

### Tarea 4 — JSDoc en funciones críticas

Equivalencia nombre del enunciado → función real (todas en `hooks/useWebRTC.ts`):

| Enunciado | Implementación |
|---|---|
| `initWebRTC()` | el efecto del hook `useWebRTC` (crea socket, listeners, ciclo de vida) |
| `createPeerConnection()` | `services/webrtcService.ts → createPeerConnection()` |
| `startScreenShare()` | `startScreenShare` (`:1020`) |
| `stopScreenShare()` | `stopScreenShare` (`:999`) |
| `toggleMicrophone()` | `toggleMic` (`:967`) |
| `toggleCamera()` | `toggleCam` (`:980`) |

### Tarea 5 — Diagramas de flujo

**Conexión de un usuario (señalización):**

```
Entrar a la sala
   ↓ getUserMedia (permisos)
Conectar socket WebRTC (:8082)
   ↓ emit introduction
Recibir introduction (lista de peers)
   ↓ el socketId mayor ofrece (anti-glare)
offer → answer → ICE
   ↓
Conexión P2P establecida (audio/video directo)
```

**Compartir pantalla:**

```
Click "Compartir pantalla"
   ↓ getDisplayMedia
¿hay sender de video?
   ├─ sí → replaceTrack(pantalla)   (sin renegociar)
   └─ no → addTrack(pantalla)       (renegocia: offer/answer/ICE)
   ↓ emit media-state { presenting: true }
Sala → layout spotlight + badge "Presentando"
   ↓ track.onended / botón "Detener"
replaceTrack(cámara) (o removeTrack) + emit presenting:false → vuelve a grid
```

### Tarea 6 — Errores documentados

| Error | Causa | Manejo |
|---|---|---|
| Permisos denegados | `NotAllowedError` | panel con ayuda por navegador + Reintentar |
| Dispositivo inexistente | `NotFoundError` | "No se encontró cámara ni micrófono" |
| Dispositivo ocupado | `NotReadableError`/`AbortError` | "cierra Zoom/Teams" |
| Pantalla no compartida | cancelación de `getDisplayMedia` | se ignora, la llamada sigue |
| Navegador incompatible | `isWebRTCSupported() === false` | pantalla "Navegador no compatible" |

### Mapa de la documentación (entregable C5)

| Repositorio | Dónde mirar |
|---|---|
| **Frontend** | `frontend/README.md`, `frontend/docs/sprint4/C1–C5*.md`, este doc (`sprint5/`), JSDoc en `hooks/useWebRTC.ts` y `services/webrtcService.ts` |
| **Backend (room-service)** | Swagger en `/api-docs` (`backend/src/config/swagger.ts`): endpoints, arquitectura, eventos Socket.IO |
| **WebRTC (signaling)** | Swagger en `/api-docs` (`studyhub-webrtc-server/src/config/swagger.ts`): eventos Socket.IO (`introduction`, `signal` con offer/answer/ICE), `media-state` (mute/cámara/compartir pantalla), `PeerInfo` |

Con esto el lector entiende: cómo se conecta un usuario, cómo se crean/reutilizan los
peers, cómo funciona la videollamada, cómo se sincronizan los estados AV y cómo funciona
compartir pantalla.
