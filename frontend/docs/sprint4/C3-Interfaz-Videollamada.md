# C3 — Interfaz Visual de la Videollamada

**Sprint 4 · Frontend (React + TypeScript) · StudyHub**
**Módulos:** `components/room/VideoGrid.tsx`, `components/room/ParticipantCard.tsx`, `hooks/useSpeakingDetection.ts`, `pages/RoomPage.tsx`
**Rol:** Construir toda la interfaz visual de la videollamada (grid, tarjetas, contador, estados visuales).

---

## Objetivo

Construir la UI de la videollamada: una cuadrícula responsive de participantes que
se reorganiza dinámicamente con las entradas/salidas, tarjetas por participante con
video o avatar, contador en vivo, resaltado del que habla y soporte de
accesibilidad.

---

## Tarea 1 — Componente `VideoGrid`

**Qué se debía implementar:** un componente responsable de la distribución de los
participantes.

**Implementación (`components/room/VideoGrid.tsx`):** cuadrícula con dos modos:

- **Grid equitativo:** todos los tiles del mismo tamaño; columnas según cantidad y
  ancho de pantalla; pagina a partir de 10 participantes (bloques de 9).
- **Escenario (spotlight):** cuando alguien comparte pantalla o fija a un
  participante, ese tile se muestra grande y el resto pasa a una tira de
  miniaturas, con transiciones suaves.

---

## Tarea 2 — Componente `ParticipantCard`

**Qué se debía implementar:** mostrar video, avatar, nombre y estados.

**Implementación (`components/room/ParticipantCard.tsx`):** tarjeta por capas:

1. **Video o avatar** — el stream ocupa el tile; si la cámara está apagada, se
   muestra el avatar.
2. **Barra inferior** — nombre + íconos de mic/cámara + punto de estado de conexión
   (verde activo / ámbar reconectando / rojo desconectado).
3. **Badges contextuales** — "Hablando" / "Reconectando" / "Desconectado" /
   "Presentando".

---

## Tarea 3 — Renderizar participantes dinámicamente

**Qué se debía implementar:** renderizar desde `participants[]`, agregando los
nuevos y quitando los desconectados.

**Implementación (`pages/RoomPage.tsx`):** se construye `tiles: GridTile[]` a partir
de `participants` (presencia en vivo). El `key={uid}` estable hace que React añada o
quite tiles sin recargar; el grid se reordena solo cuando cambia la lista.

```ts
const tiles = participants.map((p) => ({
  uid: p.uid, name: p.name, avatar: p.avatar,
  stream: streamsByUid[p.uid], cameraOff: !p.camOn, micOff: !p.micOn,
  speaking: !!speaking[p.uid] && !micOff, connection: ...,
}));
```

---

## Tarea 4 — Mostrar contador

**Qué se debía implementar:** un contador tipo *"Participantes conectados: 5"* que
se actualice automáticamente.

**Implementación:** el subcomponente `Counter` de `VideoGrid` muestra
`{count} participante(s)` con `aria-live="polite"`; se recalcula con `tiles.length`,
así que se actualiza solo ante cada entrada/salida.

---

## Tarea 5 — Avatar cuando la cámara está apagada

**Qué se debía implementar:** cuando `cameraOff === true`, mostrar avatar + nombre.

**Implementación:** en `ParticipantCard`, `showVideo = stream && !cameraOff &&
!disconnected`. Si es falso, se renderiza el avatar (imagen del usuario o iniciales
con el componente `Avatar`) sobre fondo oscuro, con el nombre siempre visible en la
barra inferior.

---

## Tarea 6 — Detectar usuario hablando

**Qué se debía implementar:** usar la actividad de audio para mostrar la etiqueta
"Hablando" o un borde destacado.

**Implementación (`hooks/useSpeakingDetection.ts`):** analiza la pista de audio de
cada stream con la **Web Audio API** (RMS en el dominio del tiempo) y aplica un
umbral + *hangover* de 1.5 s para no parpadear. Devuelve qué `uid` están hablando.

`ParticipantCard` lo refleja con: **borde verde con pulso**, leve zoom, badge
**"🎙 Hablando"** y ondas de audio animadas.

---

## Tarea 7 — Responsive

**Qué se debía implementar:** adaptar a desktop, tablet y móvil.

**Implementación (`columnsFor` + `useNarrow` en `VideoGrid`):**

| Participantes | Desktop / Tablet | Móvil (<640px) |
|---|---|---|
| 1 | 1 columna | 1 columna |
| 2–4 | 2 columnas | 2 (apila 1–2) |
| 5–9 | 3 columnas | 2 columnas |
| 10+ | paginado (9 por página) | paginado |

`grid-template-columns/rows` dinámico con transición suave; en móvil nunca más de 2
columnas.

---

## Tarea 8 — Accesibilidad

**Qué se debía implementar:** ARIA, focus y lectores de pantalla.

**Implementación:**

- `ParticipantCard` con `role="region"` + `aria-label` que resume nombre y estado.
- Contador y badges con `aria-live="polite"`.
- Navegación de páginas con botones `aria-label` ("Página anterior/siguiente") y
  `focus-visible:ring`.
- Botón de fijar con `aria-pressed` y etiqueta dinámica.

---

## Entregable final del C3

Flujo verificado:

```
Juan entra      → aparece en el grid
Ana entra       → el grid se reorganiza
Carlos entra    → el contador aumenta
Ana habla       → se resalta visualmente (borde verde + badge)
Carlos apaga cámara → aparece su avatar
Juan sale       → el grid se actualiza automáticamente
```
