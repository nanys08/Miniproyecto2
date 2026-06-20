# C4 — Estados Multimedia Visibles

**Sprint 4 · Frontend (React + TypeScript) · StudyHub**
**Módulos:** `pages/RoomPage.tsx` (`MediaEmptyPanel`, `MediaLoadingPanel`, `PermissionDeniedPanel`), `hooks/useWebRTC.ts`
**Rol:** Implementar todos los estados multimedia visibles para el usuario (vacío, cargando, éxito, error) con reintento, accesibilidad y responsive.

---

## Objetivo

Cubrir el ciclo de vida completo del acceso a cámara/micrófono con estados visuales
claros: vacío (antes de activar), cargando (mientras se piden permisos), éxito
(medios conectados) y error (con mensajes específicos y botón Reintentar), todo
accesible y responsive.

Estos estados se derivan de `mediaStatus` (`hooks/useWebRTC.ts`):
`idle → requesting → granted | audio-only | denied | unsupported`.

---

## Tarea 1 — Estado vacío

**Qué se debía implementar:** mostrar, cuando `stream === null`, *"Activa tu cámara
y micrófono para comenzar"*.

**Implementación (`MediaEmptyPanel`):** mientras el usuario no activa sus
dispositivos (`started === false`), `mediaStatus` se queda en `idle` y **no se pide
`getUserMedia`**. Se muestra el panel con el texto requerido y el botón **"Activar
cámara y micrófono"** (`onStart` → `startMedia()`).

---

## Tarea 2 — Estado cargando

**Qué se debía implementar:** mientras `getUserMedia()` está pendiente, mostrar
*"Conectando audio y video…"*.

**Implementación (`MediaLoadingPanel`):** cuando `mediaStatus === "requesting"` se
muestra un spinner con `aria-busy="true"`, el texto *"Conectando audio y video…"* e
indicadores independientes de audio y video.

---

## Tarea 3 — Estado éxito

**Qué se debía implementar:** cuando `stream !== null`, mostrar el video y un aviso
*"Audio y video conectados"*.

**Implementación:** cuando `mediaStatus === "granted"` se renderiza el `VideoGrid`
con el tile propio y los remotos, y se dispara un **toast** *"Audio y video
conectados"* (una sola vez por sesión, vía `mediaGrantedToastRef`).

---

## Tarea 4 — Estado error

**Qué se debía implementar:** capturar `NotAllowedError`, `NotFoundError`,
`AbortError` y mostrar mensajes específicos.

**Implementación (`PermissionDeniedPanel` + `classifyMediaError`):** cada tipo de
fallo tiene su icono, título, mensaje y etiquetas de botón:

| `error.name` | Tipo | Título / Mensaje |
|---|---|---|
| `NotAllowedError` | `permission` | "Permisos denegados" + ayuda por navegador (Chrome/Firefox/Safari) |
| `NotReadableError` / `AbortError` | `busy` | "No se pudo acceder a los dispositivos" (cerrar Zoom/Teams) |
| `NotFoundError` | `notfound` | "No se encontró cámara ni micrófono" |
| (sin soporte) | `unsupported` | "Navegador no compatible" |

---

## Tarea 5 — Botón Reintentar

**Qué se debía implementar:** permitir volver a llamar a `getUserMedia()`.

**Implementación:** `retryMedia()` incrementa `retryKey`, lo que re-ejecuta el
efecto de captura. El botón se etiqueta según el caso ("Reintentar", "Reintentar
detección", "Reintentar tras habilitar"). Además se ofrece **"Continuar sin
dispositivos"** (modo recepción) y, tras **3 intentos fallidos**, se sugiere y
ofrece **"Recargar página"**.

---

## Tarea 6 — Accesibilidad

**Qué se debía implementar:** `aria-live` y `aria-label` en mensajes, botones y
estados.

**Implementación:**

- Estado vacío: `role="status"` + `aria-live="polite"`; botón con `aria-label`.
- Cargando: `aria-busy="true"` + `aria-label="Conectando audio y video"`.
- Error: `role="alert"` + `aria-live="assertive"` (lo anuncia de inmediato).
- Todos los botones con `focus-visible:ring`.

---

## Tarea 7 — Responsive

**Qué se debía implementar:** visualización correcta en desktop, tablet y móvil.

**Implementación:** los paneles usan layout centrado con `flex-1`, anchos máximos
(`max-w-sm`) y botones que se apilan en móvil (`flex-col sm:flex-row`) y se alinean
en fila en pantallas mayores.

---

## Entregable final del C4

Flujos verificados:

```
Usuario entra → Estado VACÍO ("Activa tu cámara y micrófono…")
        ↓ solicita permisos
Estado CARGANDO ("Conectando audio y video…")
        ↓ acepta
Estado ÉXITO (video visible + toast "Audio y video conectados")

  — o —

Usuario rechaza permisos → Estado ERROR → mensaje claro por tipo → botón Reintentar
```
