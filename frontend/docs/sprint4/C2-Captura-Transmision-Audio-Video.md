# C2 — Captura, Transmisión y Visualización de Audio y Video

**Sprint 4 · Frontend (React + TypeScript) · StudyHub**
**Módulos:** `hooks/useWebRTC.ts`, `components/room/ParticipantCard.tsx`, `pages/RoomPage.tsx`
**Rol:** Capturar la cámara/micrófono local, transmitirlos por la malla P2P y renderizar los streams remotos.

---

## Objetivo

Implementar la captura de medios locales con `getUserMedia`, integrarlos en las
`RTCPeerConnection` para enviarlos a los demás participantes, recibir y renderizar
los streams remotos (`ontrack`), manejar los errores de acceso a dispositivos y
mantener la sesión estable ante reconexiones, todo con accesibilidad en los
controles.

---

## Tarea 1 — Solicitar permisos multimedia

**Qué se debía implementar:** `getUserMedia({ audio: true, video: true })`; si el
usuario acepta, crear el stream; si rechaza, mostrar error.

**Implementación (`hooks/useWebRTC.ts`):**

```ts
stream = await navigator.mediaDevices.getUserMedia({
  audio: buildAudioConstraint(selectedMicId),   // mic elegido o true
  video: buildVideoConstraint(selectedCamId),   // cámara elegida, 1280×720
});
setMediaStatus("granted");
```

- Si la cámara falla pero el micrófono no, hay **fallback a solo audio**
  (`audio-only`) en vez de fallar por completo.
- Si todo falla, se clasifica el error y se pasa a estado `denied` (ver Tarea 5).

---

## Tarea 2 — Crear Local Media Stream y mostrar "Mi cámara"

**Qué se debía implementar:** guardar audio y video local y mostrar la propia
cámara.

**Implementación:**

- El stream se guarda en `localStreamRef` y en el estado `localStream`.
- `RoomPage` lo renderiza como un `ParticipantCard` propio (`isYou`, `muted`,
  `mirror`) → el tile **"Mi cámara"**, silenciado para evitar eco y espejado.

---

## Tarea 3 — Integrar el stream con `PeerConnection`

**Qué se debía implementar:** agregar el stream a la `RTCPeerConnection` para
enviarlo a los demás.

**Implementación (en `ensurePeer`):**

```ts
const ls = localStreamRef.current;
if (ls) ls.getTracks().forEach((track) => pc.addTrack(track, ls));
```

- Al crear cada peer se adjuntan las pistas locales (cámara + micrófono).
- `addTrack` dispara `onnegotiationneeded`, que genera la **offer** y la envía por
  el socket de señalización.
- El cambio de dispositivo y compartir pantalla usan `replaceTrack` para no
  renegociar innecesariamente.

---

## Tarea 4 — Recibir streams remotos (`ontrack`)

**Qué se debía implementar:** escuchar `ontrack` y renderizar el video de cada
participante.

**Implementación:**

```ts
pc.ontrack = ({ track, streams }) => {
  const [stream] = streams;
  const key = ctx.uid ?? uidBySocketRef.current.get(remoteSocketId);
  if (key && stream) setRemoteStreams((prev) => ({ ...prev, [key]: stream }));
};
```

- Los streams remotos se indexan por `uid` (`remoteStreams[uid]`).
- `ParticipantCard` engancha el stream al `<video>` por `srcObject` y llama
  `play()` explícito (algunos navegadores bloquean el autoplay con audio).

---

## Tarea 5 — Manejar errores multimedia

**Qué se debía implementar:** mostrar mensajes como *"No se pudo acceder a la
cámara"* o *"Micrófono no disponible"*.

**Implementación:** `classifyMediaError()` traduce el `DOMException.name` a un tipo
y muestra el mensaje y la pantalla correctos:

| `error.name` | Tipo | Mensaje al usuario |
|---|---|---|
| `NotAllowedError` / `SecurityError` | `permission` | "No se pudo acceder a la cámara ni al micrófono. Revisa los permisos…" |
| `NotReadableError` / `AbortError` | `busy` | "Tu cámara/micrófono está siendo usado por otra aplicación (Zoom/Teams)…" |
| `NotFoundError` | `notfound` | "No se encontró cámara ni micrófono en este dispositivo." |

El motivo del error también se reporta al signaling server (`media-error`).

---

## Tarea 6 — Reconexión automática

**Qué se debía implementar:** ante pérdida de conexión, mostrar *"Reconectando…"*
e intentar recuperar la `PeerConnection` y el stream.

**Implementación:**

- El socket de señalización reconecta solo (`reconnectionAttempts: Infinity`). Al
  caer, `signalingStatus` pasa a `reconnecting` → badge **"Reconectando…"** en el
  header.
- Al reconectar, el cliente re-emite `introduction`, lo que **rehace la malla** de
  peers automáticamente.
- El estado P2P de cada peer (`peerState[uid]`) marca el tile como "Reconectando" /
  "Desconectado" y muestra el overlay *"Conectando participantes…"*.

---

## Tarea 7 — Accesibilidad

**Qué se debía implementar:** `aria-label` en los controles AV, navegación por
teclado, focus visible y lectura por pantalla.

**Implementación:**

- Controles de micrófono, cámara, compartir pantalla y colgar con `aria-label` y
  `aria-pressed` descriptivos.
- `focus-visible:ring-*` en todos los botones (foco visible para teclado).
- `ParticipantCard` usa `role="region"` + `aria-label` dinámico que resume nombre y
  estado (mic/cam/hablando/desconectado).
- Mensajes de estado con `aria-live` para los lectores de pantalla.

---

## Entregable final del C2

Flujo verificado:

```
Juan entra → acepta permisos → ve su cámara
Ana entra  → acepta permisos → ve su cámara
        ↓
Ambos se ven  ·  Ambos se escuchan
        ↓
Si ocurre un error → se informa correctamente (pantalla + mensaje por tipo)
Si hay desconexión → "Reconectando…" e intento de recuperar la conexión
```
