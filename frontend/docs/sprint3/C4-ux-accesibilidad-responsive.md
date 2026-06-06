# C4 — UX, Accesibilidad y Responsive

> **Objetivo:** llevar el diseño (Figma) a la interfaz real, con estados
> visuales, accesibilidad WCAG 2.2, focus visible, navegación por teclado,
> alertas accesibles y diseño responsive.

## Mapa de tareas → implementación

| Tarea | Implementación |
|---|---|
| **1** Aplicar diseño UX (Figma → real) | `tailwind.config.js` (tokens) + `layouts/DashboardLayout.tsx` + componentes |
| **2** Estados visuales (vacío/error/éxito/cargando) | Componentes de chat, modales, `ErrorState`, toasts |
| **3** Accesibilidad (labels, aria) | Todos los componentes (`<label htmlFor>`, `aria-*`) |
| **4** Focus visible (TAB) | `index.css` (`:focus-visible`) |
| **5** Navegación teclado (TAB/ENTER/ESC) | `Modal.tsx` (focus-trap, Esc), inputs/botones |
| **6** Alertas accesibles (`role="alert"`) | Toasts + mensajes de error |
| **7** Responsive (Desktop/Tablet/Mobile) | Clases Tailwind `sm:`/`md:`/`lg:` + `DashboardLayout` |

---

## Tarea 1 · Design System (tokens)

`tailwind.config.js` define la paleta del Figma:
```js
brand: { 50:"#eff6ff", 500:"#2563eb", 600:"#1d4ed8", 700:"#1e40af", 900:"#1e3a8a" },
navy:  { DEFAULT:"#1e3a5f" },   // header / navegación
surface:"#f9fafb",              // sidenav y listas
canvas: "#fafbfc",              // área de contenido
```

**Alta fidelidad aplicada:**
- **Header navy** full-width (`DashboardLayout`): logo blanco + avatar + `@username`
  + botón azul "+ Crear sala".
- **Sidebar** sobre `surface` con etiqueta "MENÚ", ítem activo en azul y "Cerrar
  sesión" en rojo.
- **Avatares con color por inicial** (`components/Avatar.tsx`, paleta determinista).
- **Card "Unirme a sala" destacada** (borde + fondo azul claro) en el Dashboard.
- **Badges de estado** con punto + color (Activa/Inactiva) en `RoomCard`.
- **Modal "Unirse"**: input de código monospace azul claro + "Validar y entrar →".

## Tarea 2 · Estados visuales

Cada flujo tiene sus 4-5 estados con **ícono + texto + color** (nunca solo color):
- **Vacío:** "Aún no hay mensajes en esta sala" (`role="status"`).
- **Error:** "Código inválido", "No fue posible cargar el historial" (`role="alert"`).
- **Éxito:** toasts "Sala actualizada correctamente", "La sala fue creada…".
- **Cargando:** "Cargando historial…", "Conectando…", "Guardando cambios…".

## Tarea 3 · Accesibilidad (labels + aria)

- Todo `<input>`/`<textarea>` tiene `<label htmlFor>` o `aria-label`
  (p. ej. `aria-label="Campo de mensaje"`, `aria-label="Enviar mensaje"`).
- Errores con `aria-invalid="true"` + `aria-describedby`.
- Modales: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`.
- Íconos decorativos con `aria-hidden="true"`.

## Tarea 4 · Focus visible

`index.css` aplica un aro global con `:focus-visible` (solo con teclado):
```css
:focus-visible { outline: 3px solid theme("colors.brand.600"); outline-offset: 2px; }
```
Nunca se anula el outline sin reemplazo.

## Tarea 5 · Navegación por teclado

- `Modal.tsx`: **focus-trap** (Tab/Shift+Tab ciclan dentro), **Esc** cierra y el
  foco **retorna** al elemento que abrió el modal.
- Chat: **Enter** envía, **Shift+Enter** salto de línea.
- En la configuración de sala, al cambiar de vista el foco salta al input
  relevante (nombre / confirmación de borrado).

## Tarea 6 · Alertas accesibles

- **Toasts** (`context/ToastContext.tsx`) para éxito/info/error.
- Errores inline con `role="alert"` (anuncio inmediato).
- Estados no críticos con `role="status"` + `aria-live="polite"`.

## Tarea 7 · Responsive

- **Header navy:** full-width; en móvil incluye botón hamburguesa.
- **Sidebar:** fijo (`md:block`) en desktop/tablet; **drawer** superpuesto en móvil
  (se cierra con Esc o tocando fuera).
- **Dashboard / Mis salas:** grids `sm:grid-cols-2` que colapsan a 1 columna.
- **Sala:** `lg:grid-cols-[1fr_360px]` (video + chat) que se apila en pantallas
  pequeñas.

| Dispositivo | Ancho | Comportamiento |
|---|---|---|
| Desktop | ≥1280px | Sidebar fijo + 2 columnas |
| Tablet | 768–1024px | Sidebar visible, grids 1–2 columnas |
| Mobile | 375–414px | Hamburguesa + columnas apiladas |

> **Evidencia:** capturas en los 3 anchos (ver `docs/EVIDENCIAS.md`).

## Nota de auditoría WCAG aplicada
Se corrigió el contraste de los **timestamps** (`slate-400` → `slate-500`) para
cumplir el ratio ≥ 4.5:1 sobre blanco (hallazgo de la auditoría).

## Archivos involucrados
- `tailwind.config.js`, `src/index.css`
- `layouts/DashboardLayout.tsx`, `components/Logo.tsx`, `components/Avatar.tsx`
- `components/Modal.tsx`, `components/Button.tsx`, `components/ErrorState.tsx`
- `context/ToastContext.tsx`
- `pages/DashboardPage.tsx`, `pages/MyRoomsPage.tsx`, `components/rooms/*`
