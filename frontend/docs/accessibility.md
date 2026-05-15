# Auditoría y plan de Accesibilidad — WCAG 2.2 (TS-04)

Este documento sustenta la **historia TS-04 del Sprint 0**: dejar el frontend configurado con buenas prácticas de accesibilidad desde el día 1, enfocado en cumplir las pautas **WCAG 2.2 nivel AA** y prestando atención especial al caso de **ceguera total** (uso exclusivo de lector de pantalla y teclado).

---

## 1. Principio rector

> "Operable y comprensible sin ver la pantalla."

Todo flujo crítico (autenticación, navegación, creación/unión a sala, envío de mensajes) debe poder completarse **únicamente con teclado** y producir **anuncios coherentes** en un lector de pantalla.

---

## 2. Pautas WCAG 2.2 aplicadas en Sprint 0

| Pauta                                   | Nivel | Cómo se cumple en el código                                                                 | Cómo se validó                                       |
|-----------------------------------------|-------|----------------------------------------------------------------------------------------------|-------------------------------------------------------|
| **1.1.1 Non-text Content**              | A     | Iconos decorativos llevan `aria-hidden="true"`; botones solo-ícono exigen `aria-label`.      | Validación en tiempo de desarrollo en `Button`.       |
| **1.3.1 Info and Relationships**        | A     | `Card` se renderiza como `<section aria-labelledby>`; `Input` usa `<label htmlFor>` y `aria-describedby` para hint/error. | Inspección de árbol semántico en DevTools.            |
| **1.3.5 Identify Input Purpose**        | AA    | Campos con `autoComplete` adecuado (`email`, `current-password`, `new-password`, `username`). | Revisión manual de formularios.                       |
| **1.4.3 Contrast (Minimum)**            | AA    | Paleta `brand-*` y combinaciones de texto/fondo verificadas (≥ 4.5:1 texto normal).         | Cálculo de contraste con herramienta WebAIM.          |
| **1.4.11 Non-text Contrast**            | AA    | Bordes de inputs, aros de foco y estados activos con ≥ 3:1 contra el fondo.                  | Revisión manual.                                      |
| **1.4.13 Content on Hover or Focus**    | AA    | Sin tooltips que aparezcan solo con hover; los hints viven dentro del campo.                 | N/A en Sprint 0 (no se usan tooltips flotantes).      |
| **2.1.1 Keyboard**                      | A     | Todos los componentes interactivos son `<button>`, `<a>` o `<input>` nativos.                | Recorrido completo con Tab en cada página.            |
| **2.1.2 No Keyboard Trap**              | A     | `Modal` permite cerrar con Escape; el focus trap es cíclico, no destructivo.                 | Prueba manual abriendo/cerrando con teclado.          |
| **2.4.1 Bypass Blocks**                 | A     | `SkipLink` al inicio de `App`, visible al recibir foco, apunta a `#main-content`.            | Tab al cargar cualquier página.                       |
| **2.4.3 Focus Order**                   | A     | `Modal` guarda y devuelve el foco al elemento que la abrió.                                  | Prueba manual.                                        |
| **2.4.6 Headings and Labels**           | AA    | Cada página tiene un `<h1>` único; `Card` con `headingLevel` evita saltos de nivel.          | Inspección de árbol de encabezados.                   |
| **2.4.7 Focus Visible**                 | AA    | `:focus-visible` global en `index.css` con outline de 3 px y offset.                         | Tab por toda la app.                                  |
| **2.5.8 Target Size (Minimum)**         | AA    | Variantes `md` y `lg` de `Button` ≥ 44 px; `sm` se reserva para zonas con espaciado adecuado. | Medición en DevTools.                                 |
| **3.2.1 On Focus**                      | A     | Ningún componente cambia de contexto al recibir foco.                                        | Revisión manual.                                      |
| **3.3.1 Error Identification**          | A     | Errores en `Input` se anuncian con `role="alert"` y se asocian con `aria-describedby`.       | Forzar errores en formulario de login/registro.       |
| **3.3.2 Labels or Instructions**        | A     | `Input` requiere prop `label`; campos requeridos marcados visualmente y con `sr-only`.       | Revisión de tipos (`label` es obligatorio).           |
| **4.1.2 Name, Role, Value**             | A     | `Modal` con `role="dialog"` + `aria-modal` + `aria-labelledby`. Botones de cierre con `aria-label`. | Inspección en árbol de accesibilidad.                 |
| **4.1.3 Status Messages**               | AA    | `Loader` con `role="status"` + `aria-live="polite"`; errores con `role="alert"`.             | Prueba con lector NVDA/VoiceOver.                     |

---

## 3. Decisión de pauta foco (entregable Sprint 0)

> **Pauta destacada:** **WCAG 2.4.7 Focus Visible (AA)** + **2.1.1 Keyboard (A)**.

**Justificación:** para un usuario con ceguera total que navega con lector de pantalla y teclado, perder el foco visible no es solo un problema visual — significa **perder el contexto** de dónde se va a actuar. Aún más crítico: si una zona de la app **captura el foco sin liberarlo** (keyboard trap), el usuario queda atascado. Por eso priorizamos:

1. Aro de foco global vía `:focus-visible` definido en `src/index.css`.
2. `Modal` con focus trap cíclico y restauración de foco al cerrar.
3. `SkipLink` para evitar tabular toda la navegación en cada página.

**Validación** (Sprint 0):
- Recorrido completo de `/login`, `/register`, `/dashboard`, `/room/:id` y `/profile` solo con teclado (Tab, Shift+Tab, Enter, Esc).
- Prueba puntual con NVDA (Windows) verificando que cada control anuncia rol + nombre + estado.
- Lint en CI: `eslint-plugin-jsx-a11y` con reglas críticas en `error` (ver `eslint.config.js`).

**Validación planificada para Sprints siguientes:**
- Sprint 1: pruebas de usuario con compañero usando solo NVDA.
- Sprint 2: validación automática con `axe-core` en flujos de chat y videollamada.

---

## 4. Reglas ESLint a11y activas

Configuración en `eslint.config.js`. Plugin: `eslint-plugin-jsx-a11y` (preset `flat/recommended`) + refuerzos:

```js
"jsx-a11y/anchor-is-valid": "error",
"jsx-a11y/label-has-associated-control": "error",
"jsx-a11y/no-noninteractive-element-interactions": "warn",
"jsx-a11y/click-events-have-key-events": "warn",
"jsx-a11y/no-static-element-interactions": "warn",
```

El preset cubre además: `alt-text`, `aria-props`, `aria-role`, `aria-unsupported-elements`, `heading-has-content`, `iframe-has-title`, `img-redundant-alt`, `interactive-supports-focus`, `media-has-caption`, `mouse-events-have-key-events`, `no-access-key`, `no-autofocus`, `no-distracting-elements`, `no-redundant-roles`, `role-has-required-aria-props`, `role-supports-aria-props`, `scope`, `tabindex-no-positive`, etc.

---

## 5. Checklist para Sprints siguientes

Cuando se agreguen funcionalidades reales, validar:

- [ ] Chat: anunciar mensajes nuevos con `aria-live="polite"` en la lista.
- [ ] Videollamada: subtítulos o alternativas para audio (WCAG 1.2.2 Captions).
- [ ] Estados de cámara/micrófono: comunicarse con texto, no solo color (WCAG 1.4.1 Use of Color).
- [ ] Notificaciones de "usuario se unió/salió" con `role="status"`.
- [ ] Atajos de teclado documentados y configurables (WCAG 2.1.4 Character Key Shortcuts).
- [ ] Tiempo de inactividad / reconexión con avisos accesibles (WCAG 2.2.1 Timing Adjustable).
