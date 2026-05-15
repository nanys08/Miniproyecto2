# Navegación y experiencia de usuario

Documento de **diseño** del Sprint 0. Define cómo el usuario se mueve dentro de la SPA, qué vistas existen, cómo se conectan entre sí y qué feedback recibe en cada paso. Acompaña a `frontend/README.md` y `frontend/docs/accessibility.md`.

---

## 1. Sitemap

```
                         ┌─────────────────────┐
                         │  /  (raíz)          │
                         │  Redirige → /login  │
                         └──────────┬──────────┘
                                    │
                ┌───────────────────┴───────────────────┐
                │                                       │
        Rutas públicas                          Rutas protegidas
        (AuthLayout)                          (ProtectedRoute)
                │                                       │
        ┌───────┴───────┐                  ┌────────────┼────────────┐
        ▼               ▼                  ▼            ▼            ▼
     /login         /register         /dashboard    /profile   /room/:id
        │               │                  │            │            │
        │               │           (DashboardLayout)            (RoomLayout)
        │               │                  │            │            │
        └─→ Tras éxito ─┴──────────────────▶ /dashboard │            │
                                                        │            │
                                              ┌─────────┴────────────┘
                                              │
                                          (común)
                                              │
                                              ▼
                                         /*  → NotFoundPage (404)
```

**Niveles:**
- **Público** (`AuthLayout`): `/login`, `/register`.
- **Privado** (`ProtectedRoute` + `DashboardLayout`): `/dashboard`, `/profile`.
- **Privado, layout especial** (`ProtectedRoute` + `RoomLayout`): `/room/:id`.
- **Catch-all:** `*` → 404 con link a `/dashboard`.

---

## 2. Flujos de navegación

### 2.1 Primer ingreso — registro con email

```
Usuario abre app
       │
       ▼
   /  (raíz)
       │
       ▼ redirección automática
   /login
       │
       ├─ click "Regístrate"
       ▼
   /register
       │
       ├─ llena formulario (username, email, password)
       ├─ submit
       │      └─▶ valida username único contra backend (GET /auth/check-username/...)
       │      └─▶ crea cuenta en Firebase Auth
       │      └─▶ POST /auth/register → crea perfil en Firestore
       │
       ▼ toast "Cuenta creada correctamente"
   /dashboard  (replace history, sin botón "atrás" a /register)
```

### 2.2 Login con cuenta existente

```
   /login
       │
       ├─ Si Firebase Auth ya tiene sesión persistida:
       │      └─ onAuthStateChanged hidrata user
       │      └─ ProtectedRoute permite acceso si llega a ruta protegida
       │
       ├─ Si no:
       │      ├─ Email/Password: signInWithEmailAndPassword
       │      └─ Google: signInWithPopup → ensureProfileExists (auto-registra si es nuevo)
       │
       ▼ toast "Sesión iniciada"
   /dashboard
```

### 2.3 Login Google con cuenta nueva

```
   /login
       │
       ├─ click "Continuar con Google"
       │      └─▶ popup Google → obtiene { uid, email, displayName }
       │      └─▶ GET /auth/me  → 404 (no hay perfil)
       │      └─▶ deriva username de displayName/email
       │      └─▶ POST /auth/register  → si 400 (taken), agrega sufijo y reintenta
       │
       ▼ toast "Cuenta creada con Google"
   /dashboard
```

### 2.4 Logout

```
   (cualquier ruta protegida)
       │
       ├─ click "Cerrar sesión" (header o menú móvil)
       │      ├─▶ disconnectSocket()
       │      ├─▶ signOut(auth)
       │      ├─▶ onAuthStateChanged emite null
       │      └─▶ ProtectedRoute detecta user=null
       │
       ▼ toast "Sesión cerrada"
   /login
```

### 2.5 Crear sala y unirse  *(planificación Sprint 1)*

```
   /dashboard
       │
       ├─ click "Crear sala nueva"
       │      └─▶ Modal con form (nombre de sala)
       │      └─▶ POST /api/rooms → 201 { room }
       │
       ▼ toast "Sala creada"
   /room/:roomId
       │
       ├─ Socket.IO connect (si no estaba)
       ├─ emit 'join-room'
       │
       ▼ recibe 'chat-history' (mensajes anteriores)
   (sala activa: chat + video + screen-share)
       │
       ├─ click "Salir de la sala"
       │
       ▼
   /dashboard
```

### 2.6 Intento de acceso a ruta protegida sin sesión

```
Usuario pega en navegador /room/abc123 directamente
       │
       ▼
   ProtectedRoute detecta user=null
       │
       ▼ Navigate replace + state={ from: "/room/abc123" }
   /login
       │
       ├─ Tras login exitoso:
       │      └─▶ (Sprint 1) leer location.state.from y redirigir allí
       │
       ▼
   /room/abc123
```

---

## 3. Wireframes ASCII

Notación: `[ Botón ]` `( radio )` `[ ___ ]` campo de texto. Las "regiones" coinciden con landmarks ARIA (`<header>`, `<main>`, `<nav>`, `<aside>`).

### 3.1 `/login`

```
┌─────────────────────────────────────────────────────────────┐
│  Salón de Estudio Colaborativo                              │ ← <header>
├─────────────────────────────────────────────────────────────┤
│                                                             │
│              ┌───────────────────────────────┐              │
│              │  Iniciar sesión               │ ← <h2>       │
│              │                               │              │
│              │  Correo electrónico *         │              │
│              │  [_______________________]    │              │
│              │                               │              │
│              │  Contraseña *                 │              │
│              │  [_______________________]    │              │
│              │                               │              │
│              │  [        Entrar         ]    │              │
│              │                               │              │
│              │  ──────── o ────────          │              │
│              │                               │              │
│              │  [ 🟦 Continuar con Google ]  │              │
│              │                               │              │
│              │  ¿No tienes cuenta?           │              │
│              │  Regístrate                   │              │
│              └───────────────────────────────┘              │
│                                                             │ ← <main>
└─────────────────────────────────────────────────────────────┘
                                            ┌───────────────┐
                                            │ ✓ Sesión inic.│ ← toast region
                                            └───────────────┘ (aria-live)
```

### 3.2 `/register`

Idéntico a `/login` con campo extra **Nombre de usuario** arriba (con hint "Debe ser único y será visible en las salas") y link inverso "¿Ya tienes cuenta? Inicia sesión".

### 3.3 `/dashboard` (desktop)

```
┌─────────────────────────────────────────────────────────────┐
│ Salón de Estudio    [Salas] [Perfil]   user@ex   [Cerrar]   │ ← <header>+<nav>
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Mis salas                              [Crear sala nueva]  │ ← <h1>
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Aún no tienes salas                                   │  │ ← Card empty state
│  │                                                       │  │
│  │ Crea una sala para invitar a tus compañeros...        │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘ ← <main>
```

**Estado con salas (Sprint 1+):**
```
  Mis salas                              [Crear sala nueva]
  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
  │ Sala demo   │ │ Estudio JS  │ │ Grupo Cálc  │
  │ 3 personas  │ │ 0 personas  │ │ 5 personas  │
  │ [ Entrar ]  │ │ [ Entrar ]  │ │ [ Entrar ]  │
  └─────────────┘ └─────────────┘ └─────────────┘
```

### 3.4 `/dashboard` (mobile)

```
┌─────────────────────────┐
│ Salón de Estudio     ☰  │ ← header con hamburguesa
├─────────────────────────┤
│ Mis salas               │
│         [Crear sala]    │
│ ┌─────────────────────┐ │
│ │ Aún no tienes salas │ │
│ │ ...                 │ │
│ └─────────────────────┘ │
└─────────────────────────┘

Menú abierto (☰ → ×):
┌─────────────────────────┐
│ Salón de Estudio     ×  │
├─────────────────────────┤
│  Salas                  │
│  Perfil                 │
│  ─────                  │
│  user@example.com       │
│  [ Cerrar sesión ]      │
├─────────────────────────┤
│ (resto del contenido)   │
```

### 3.5 `/room/:id`

```
┌─────────────────────────────────────────────────────────────┐
│ SALA                                            [Salir]     │ ← <header>
│ ───────                                                     │
│ abc123                                                      │ ← <h1>
├──────────────────────────────────────┬──────────────────────┤
│                                      │ Chat            │ ← <h2>
│                                      │                      │
│   ┌──────────────┐ ┌──────────────┐  │ (mensajes scroll)    │ ← <section>
│   │              │ │              │  │                      │   "Área de video"
│   │   Video 1    │ │   Video 2    │  │ ─────────────        │
│   │   (alt: tu   │ │   (alt: peer │  │ [_____________] [→]  │
│   │    cámara)   │ │     cámara)  │  │                      │ ← <aside>
│   └──────────────┘ └──────────────┘  │                      │   chat
│                                      │                      │
│   [🎤] [📷] [🖥️] [📞 colgar]        │                      │
│   mic  cam  share  end                │                      │
└──────────────────────────────────────┴──────────────────────┘
```

En mobile: el `<aside>` del chat se apila debajo del video (CSS grid `lg:grid-cols-[1fr_320px]` colapsa a 1 columna).

### 3.6 `/profile`

```
┌─────────────────────────────────────────────────────────────┐
│ Salón de Estudio    [Salas] [Perfil]   user@ex   [Cerrar]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Mi perfil                                                  │ ← <h1>
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Datos de la cuenta                                    │  │ ← <h2>
│  │                                                       │  │
│  │   UID    abc123-def456-...                            │  │ ← <dl>
│  │   Email  user@example.com                             │  │
│  │                                                       │  │
│  │  (Sprint 1: botones Editar perfil / Eliminar cuenta)  │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.7 `/* (404)`

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                     ERROR 404                               │
│                                                             │
│                Página no encontrada                         │ ← <h1>
│                                                             │
│              La ruta a la que intentas                      │
│              acceder no existe o fue movida.                │
│                                                             │
│                [ Volver al inicio ]                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Diseño de feedback al usuario

### 4.1 Cuándo usar cada patrón

| Patrón | Componente | Cuándo | aria role |
|--------|-----------|--------|-----------|
| **Toast** | `useToast()` | Acciones puntuales que terminan: login OK, sala creada, mensaje enviado, error temporal de red. **Se auto-descarta a los 4s**. | `status` (success/info) o `alert` (error) |
| **Inline error en form** | `<p role="alert">` dentro del form | Validación fallida en un campo o submit. Persiste hasta corregir. | `alert` |
| **Banner persistente** | Componente local en la página | Estado degradado (ej. modo demo, sin conexión). Permanece hasta cambiar el estado. | `status` |
| **Modal de error** | `ErrorBoundary` | Crash de render. Reemplaza toda la UI con detalles + botón "Reintentar". | `alert` |
| **Loader inline** | `<Loader>` | Operación bloqueante visible en una zona específica (botón, lista cargando). | `status` con `aria-live="polite"` |
| **Loader fullscreen** | `<Loader fullscreen />` | Operación que bloquea la app entera (hidratación de sesión inicial). | `status` |
| **Estado vacío** | Texto + ilustración + CTA | Lista sin items (sin salas, sin mensajes). Informa Y guía al siguiente paso. | n/a (es contenido) |

### 4.2 Jerarquía de errores

```
Severidad 1: Errores de red transitorios
  → Toast rojo, auto-descarte
  → Acción esperada: el usuario reintenta

Severidad 2: Errores de validación / lógica de negocio
  → Inline error en el form / page (role="alert")
  → Acción esperada: corregir el input

Severidad 3: Sesión expirada / sin auth
  → Redirect automático a /login + toast info "Sesión expirada"
  → Acción esperada: re-login

Severidad 4: Crash de render
  → ErrorBoundary fullscreen
  → Acción esperada: botón "Reintentar" o recarga
```

### 4.3 Estados vacíos planificados

| Vista | Vacío | CTA |
|-------|-------|-----|
| `/dashboard` (sin salas) | "Aún no tienes salas" + descripción | "Crear sala nueva" (ya existe) |
| `/room/:id` (sin mensajes) | "Sé el primero en escribir" (Sprint 1) | Foco automático al input de chat |
| `/room/:id` (solo tú) | "Esperando a que se unan" (Sprint 1) | Botón "Copiar link de sala" |
| `/profile` (sin avatar) | Avatar default | (Sprint 1) "Subir foto" |

---

## 5. Responsive — breakpoints

Tailwind: `sm` ≥ 640px, `md` ≥ 768px, `lg` ≥ 1024px, `xl` ≥ 1280px.

| Vista | `< md` (mobile) | `md – lg` (tablet) | `≥ lg` (desktop) |
|-------|------------------|---------------------|-------------------|
| `/login`, `/register` | Card 100% ancho, padding lateral | Card centrada max-w-md | Igual |
| `/dashboard` | Hamburguesa, navegación apilada | Header expandido | Grid de salas multi-col |
| `/profile` | `<dl>` apilado | `<dl>` 2 columnas | Igual |
| `/room/:id` | 1 columna: video arriba, chat debajo | 1 columna | 2 columnas (1fr + 320px) |
| Toast region | bottom-right, 90% ancho | bottom-right max-w-sm | Igual |

**Probado en Sprint 0:**
- ✅ `/login`, `/register`, `/dashboard`, `/profile`, `/room/:id`, 404 — todos en Chrome DevTools a 375px (iPhone SE), 768px (iPad), 1280px (laptop).
- ✅ Menú hamburguesa funciona con teclado y mouse.
- ✅ Foco visible en todos los breakpoints.

**Pendiente Sprint 1+:**
- Layout de sala con grid de video real (CSS grid auto-fit dependiendo del nº de peers).
- Drawer lateral del chat en tablet (intermedio entre apilado y 2 columnas).

---

## 6. Validación de accesibilidad — checklist Sprint 0

| Prueba | Cómo | Resultado |
|--------|------|-----------|
| **Tab completo en cada vista** | Tab/Shift+Tab recorriendo `/login`, `/register`, `/dashboard`, `/profile`, `/room/:id`, 404 | ✅ Todos los controles enfocables. Sin elementos "saltados" ni atrapados. |
| **SkipLink visible al recibir foco** | Cargar página → Tab una vez → debe aparecer "Saltar al contenido principal" | ✅ Aparece en `top: 2, left: 2` con `:focus-visible`. |
| **Cambio de ruta lleva foco a `<main>`** | Tab → Enter en un link → siguiente Tab debe estar dentro de `<main>` | ✅ `useFocusMain()` mueve foco en cada navegación. |
| **Modal con Escape** | Abrir modal "Crear sala" → presionar Esc | ✅ Cierra y devuelve foco al botón que la abrió. |
| **Modal trap cíclico** | Tab varias veces dentro de la modal | ✅ El foco no escapa. Shift+Tab desde el primer foco → último. |
| **Toast anunciado** | Disparar acción que muestra toast → NVDA debe leerlo | ✅ Con `aria-live="polite"`. Errores con `role="alert"` (interrumpen al lector). |
| **Errores de form asociados al campo** | Submit con campo vacío | ✅ `aria-describedby` apunta al `<p role="alert">`. |
| **Navegación móvil con teclado** | DevTools a 375px → Tab al hamburguesa → Enter → tabbing a los items | ✅ `aria-expanded` cambia de false a true; menú accesible. |
| **Sin tab-traps fuera de modal** | Tab por toda la página | ✅ Solo el modal aplica trap; el resto fluye normal. |
| **Contraste de texto** | Verificar pares texto/fondo con WebAIM contrast checker | ✅ `text-slate-700` sobre `bg-white` = 12.6:1 (AAA). `text-brand-700` sobre `bg-white` = 8.6:1 (AAA). Botón primario: blanco sobre `brand-600` = 5.9:1 (AA). |
| **Reading order** | Lector pantalla en NVDA recorriendo la página | ✅ Sigue el orden visual: header → main → toast region. |

### Reglas ESLint a11y activas (bloquean PR)

Lista completa en `frontend/docs/accessibility.md §4`. Lint corre como parte de `npm run lint`.

---

## 7. Cobertura del task Sprint 0

| Punto del enunciado | Estado | Evidencia |
|---|---|---|
| **Sitemap** | ✅ | §1 con diagrama |
| **Diseño navegación SPA** (React Router + protegida + redirecciones) | ✅ | `src/routes/AppRouter.tsx`, `src/routes/ProtectedRoute.tsx`, §2 |
| **Experiencia usuario** — mensajes éxito | ✅ | Sistema de Toast (`src/context/ToastContext.tsx`, `useToast`), §4 |
| **Experiencia usuario** — errores | ✅ | `ErrorBoundary`, `role="alert"` en forms, jerarquía en §4.2 |
| **Experiencia usuario** — loaders | ✅ | `Loader` component, botones con `isLoading`, `ProtectedRoute` con `Loader fullscreen` |
| **Experiencia usuario** — estados vacíos | ✅ | `DashboardPage` (existente) + planificación §4.3 |
| **Responsive** | ✅ | Breakpoints documentados §5, menú móvil implementado, layouts validados manualmente |
| **A11y navegación** — teclado | ✅ | Checklist §6, recorrido validado |
| **A11y navegación** — focus | ✅ | `useFocusMain`, `:focus-visible` global, focus trap en modal |
| **A11y navegación** — lectores pantalla | ✅ | Toast aria-live, SkipLink, landmarks ARIA, `aria-expanded` en hamburguesa |
| **Evidencia: Sitemap** | ✅ | §1 |
| **Evidencia: Flujo navegación** | ✅ | §2 (6 flujos) |
| **Evidencia: Wireframes navegación** | ✅ | §3 (7 wireframes ASCII) |
