# C5 — Integración y Validación de la Experiencia Visual

**Sprint 4 · Frontend (React + TypeScript) · StudyHub**
**Módulos:** `pages/RoomPage.tsx` + todos los componentes de C1–C4
**Rol:** Integrar y validar toda la experiencia visual de la videollamada (grid, tarjetas, estados, contador) y reunir las evidencias.

---

## Objetivo

Integrar los componentes construidos en C1–C4 dentro de `RoomPage`, validar el
comportamiento responsive y de accesibilidad, optimizar la UI (evitar renders y
problemas de layout) y producir las evidencias visuales del Sprint.

---

## Tarea 1 — Integración final

**Qué se debía implementar:** verificar el funcionamiento conjunto de `VideoGrid`,
`ParticipantCard`, los estados multimedia y el contador.

**Implementación (`pages/RoomPage.tsx`):** la página orquesta todo:

- `useWebRTC` provee `localStream`, `remoteStreams`, `remoteMedia`, `peerState`,
  `mediaStatus`, etc.
- Según `mediaStatus` se renderiza el panel correcto (vacío / cargando / error /
  `VideoGrid`).
- `VideoGrid` recibe los `tiles` (incluido el propio) y delega cada uno en
  `ParticipantCard`; el contador vive dentro del grid.

```ts
{mediaStatus === "idle"      ? <MediaEmptyPanel onStart={startMedia} />
 : mediaStatus === "requesting" ? <MediaLoadingPanel />
 : (mediaStatus === "denied" || "unsupported") && !proceedAnyway
   ? <PermissionDeniedPanel ... />
 : <VideoGrid tiles={tiles} spotlightUid={...} pinnedUid={...} onPin={...} />}
```

---

## Tarea 2 — Validar responsive

**Qué se debía implementar:** probar en desktop, tablet y móvil.

**Implementación:** el grid usa `columnsFor()` + `useNarrow()` (media query
`max-width: 639px`) para adaptar columnas; en móvil máximo 2 columnas y paginación
a partir de 10 participantes. Paneles de estado con anchos máximos y botones
apilables. Validado en los tres breakpoints.

---

## Tarea 3 — Optimización de UI

**Qué se debía implementar:** corregir errores visuales, renders innecesarios y
problemas de layout.

**Implementación:**

- Callbacks e identidad guardados en `ref` para no recrear listeners/efectos en
  cada render (`onPeerJoinedRef`, `identityRef`, …).
- `tiles` memoizado (`useMemo`) y `key={uid}` estable → React reordena sin remontar
  los `<video>` (no se corta el stream).
- Detección de voz que solo dispara render cuando cambia el conjunto de hablantes.
- `replaceTrack` (en vez de renegociar) al cambiar de dispositivo o compartir
  pantalla → menos parpadeo.

---

## Tarea 4 — Accesibilidad final

**Qué se debía implementar:** validar ARIA, focus, teclado y lectores de pantalla.

**Implementación (resumen de C2–C4):** `role`/`aria-label`/`aria-live` en tarjetas,
contador, badges y paneles de estado; `aria-pressed` en toggles; `focus-visible`
en todos los controles; navegación completa por teclado. Detalle en
`docs/accessibility.md`.

---

## Tarea 5 — Evidencias visuales

**Qué se debía implementar:** capturas de la videollamada funcionando, grid
completo, estados multimedia, avatar y participantes.

**Implementación:** evidencias recopiladas en `docs/EVIDENCIAS.md` (videollamada
2+ participantes, grid reorganizándose, estados vacío/cargando/éxito/error, avatar
con cámara apagada, badge "Hablando", contador en vivo).

---

## Entregables Frontend (C5)

| Entregable | Estado |
|---|---|
| UI final integrada | ✅ `RoomPage` orquesta C1–C4 |
| Responsive validado | ✅ desktop / tablet / móvil |
| Accesibilidad validada | ✅ ARIA, focus, teclado, lectores |
| Evidencias visuales | ✅ `docs/EVIDENCIAS.md` |

---

## Sustentación final del Sprint 4

Recorrido demostrado de extremo a extremo:

```
1.  Usuario entra a la sala
2.  Solicita permisos (estado cargando)
3.  Se conecta WebRTC (offer/answer/ICE → P2P establecida)
4.  Aparece en el grid
5.  Otro usuario entra
6.  Ambos se ven
7.  Ambos se escuchan
8.  El contador aumenta
9.  Un usuario apaga la cámara
10. Aparece su avatar
11. Un usuario sale
12. El grid se actualiza
13. Se muestran logs y arquitectura
14. Se evidencian los 4 repositorios:
    - Frontend
    - Backend Principal (room-service)
    - Chat Server (chat-service)
    - WebRTC Server (signaling-server)
```
