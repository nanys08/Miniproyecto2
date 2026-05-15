# Salón de Estudio Colaborativo — Frontend

Frontend SPA del **Mini-proyecto 2 — Proyecto Integrador I (2026-I)**. Construida con React + Vite + TypeScript + Tailwind CSS y configurada con accesibilidad **WCAG 2.2** desde el día 1 (TS-04).

Este repositorio cubre el alcance del **Sprint 0** del frontend: dejar el esqueleto técnico, el sistema de diseño, las rutas, los componentes accesibles base y la integración inicial con el backend (REST + Socket.IO + Firebase Auth).

---

## 1. Stack técnico

| Capa                     | Tecnología                                  |
|--------------------------|---------------------------------------------|
| Bundler / Dev server     | Vite 5                                      |
| Lenguaje                 | TypeScript 5.6 (strict)                     |
| UI                       | React 18                                    |
| Estilos                  | Tailwind CSS 3 + PostCSS + Autoprefixer     |
| Ruteo                    | React Router 6                              |
| Auth cliente             | Firebase Web SDK (Email/Password)           |
| Tiempo real              | `socket.io-client` contra backend Express   |
| Linting de accesibilidad | ESLint 9 (flat config) + `eslint-plugin-jsx-a11y` |
| Despliegue               | Vercel (`vite build` → `dist/`)             |

---

## 2. Estructura del proyecto

```
src/
 ├── components/      # Componentes accesibles reutilizables
 │    ├── Button.tsx
 │    ├── Input.tsx
 │    ├── Modal.tsx
 │    ├── Card.tsx
 │    ├── Loader.tsx
 │    └── SkipLink.tsx
 ├── pages/           # Vistas de cada ruta
 │    ├── LoginPage.tsx
 │    ├── RegisterPage.tsx
 │    ├── DashboardPage.tsx
 │    ├── RoomPage.tsx
 │    ├── ProfilePage.tsx
 │    └── NotFoundPage.tsx
 ├── layouts/         # Layouts compartidos por familia de rutas
 │    ├── AuthLayout.tsx
 │    ├── DashboardLayout.tsx
 │    └── RoomLayout.tsx
 ├── routes/          # Definición de rutas y guards
 │    ├── AppRouter.tsx
 │    └── ProtectedRoute.tsx
 ├── context/         # Estado global vía Context API
 │    └── AuthContext.tsx
 ├── hooks/           # Hooks personalizados
 │    └── useAuth.ts
 ├── services/        # Integraciones externas
 │    ├── firebase.ts # SDK Firebase + persistencia local
 │    ├── api.ts      # Cliente REST tipado del backend
 │    └── socket.ts   # Cliente Socket.IO con auth por token
 ├── utils/
 │    └── cn.ts
 ├── App.tsx
 ├── main.tsx
 ├── index.css        # Tailwind + reglas a11y base
 └── vite-env.d.ts
docs/
 ├── accessibility.md # Auditoría y plan WCAG 2.2 (TS-04)
 └── navigation.md    # Sitemap, flujos, wireframes, UX feedback, responsive
```

---

## 3. Rutas

| Ruta            | Auth | Layout            | Página           |
|-----------------|------|-------------------|------------------|
| `/`             | —    | —                 | Redirige a `/login` |
| `/login`        | —    | `AuthLayout`      | `LoginPage`      |
| `/register`     | —    | `AuthLayout`      | `RegisterPage`   |
| `/dashboard`    | ✅   | `DashboardLayout` | `DashboardPage`  |
| `/profile`      | ✅   | `DashboardLayout` | `ProfilePage`    |
| `/room/:id`     | ✅   | `RoomLayout`      | `RoomPage`       |
| `*`             | —    | —                 | `NotFoundPage`   |

Las rutas protegidas pasan por `<ProtectedRoute>`, que espera la hidratación de Firebase Auth y redirige a `/login` si no hay sesión.

---

## 4. Sistema de diseño y accesibilidad

Detalles completos en **[`docs/accessibility.md`](docs/accessibility.md)**.

Resumen:

| Pauta WCAG 2.2          | Implementación                                                  |
|--------------------------|----------------------------------------------------------------|
| 1.3.1 Info and Relationships | `Card` con `<section aria-labelledby>`, formularios con `<label>` |
| 1.4.3 Contrast (AA)      | Paleta `brand-*` validada sobre fondos claros/oscuros          |
| 1.4.11 Non-text Contrast | Bordes y aros de foco con ≥ 3:1                                |
| 2.1.1 Keyboard           | Toda interacción operable con teclado, sin handlers solo-mouse |
| 2.1.2 No Keyboard Trap   | `Modal` con focus trap y escape con `Esc`                      |
| 2.4.1 Bypass Blocks      | `SkipLink` al inicio de cada layout                            |
| 2.4.3 Focus Order        | Devolución de foco al elemento que abrió la modal              |
| 2.4.7 Focus Visible      | Outline visible en `:focus-visible` para todos los elementos   |
| 2.5.8 Target Size        | Botones e inputs ≥ 36 px de alto                               |
| 3.3.2 Labels/Instructions| `Input` exige `label`; hint y errores con `aria-describedby`   |
| 4.1.2 Name, Role, Value  | Botones solo-ícono validan `aria-label`; `dialog` con `aria-modal` |
| 4.1.3 Status Messages    | `Loader` con `role="status"`, errores con `role="alert"`       |

El linting con `eslint-plugin-jsx-a11y` corre en `npm run lint` y bloquea el build cuando hay reglas en `error`.

---

## 5. Integración con el backend

| Recurso                | Origen                                          | Mecanismo                                  |
|------------------------|--------------------------------------------------|-------------------------------------------|
| Sesión / token         | `services/firebase.ts`                          | Firebase Web SDK                          |
| REST (`/api/*`)        | `services/api.ts`                                | `fetch` con `Authorization: Bearer <ID Token>` |
| Tiempo real            | `services/socket.ts`                             | `socket.io-client` con `auth: { token }`  |
| Eventos disponibles    | Ver `backend/docs/sockets.md`                    | `join-room`, `send-message`, `webrtc-*`   |

En desarrollo, Vite proxy enruta `/api/*` a `http://localhost:3000` (ver `vite.config.ts`), así no hay problemas de CORS al usar `VITE_API_BASE_URL=/api`.

---

## 6. Variables de entorno

Copia `.env.example` a `.env`:

```bash
cp .env.example .env
```

| Variable                              | Descripción                                |
|---------------------------------------|--------------------------------------------|
| `VITE_API_BASE_URL`                   | Base URL del backend REST                  |
| `VITE_SOCKET_URL`                     | URL del servidor Socket.IO                 |
| `VITE_FIREBASE_*`                     | Config del proyecto Firebase (web SDK)     |

---

## 7. Instalación y ejecución

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables
cp .env.example .env  # llenar valores

# 3. Modo desarrollo (Vite HMR)
npm run dev           # http://localhost:5173

# 4. Lint (incluye reglas a11y)
npm run lint

# 5. Build producción
npm run build         # genera dist/
npm run preview       # sirve el build local
```

> Requiere que el backend esté corriendo en `http://localhost:3000` para que el proxy de `/api/*` y la conexión Socket.IO funcionen.

---

## 8. Despliegue (Vercel)

1. Importar el repo en Vercel apuntando al directorio `frontend/`.
2. Vercel detecta Vite automáticamente:
   - **Build command:** `npm run build`
   - **Output directory:** `dist`
3. Configurar las variables `VITE_*` en el dashboard.
4. Como SPA con React Router, Vercel sirve `index.html` para rutas client-side por defecto.

---

## 9. Mapeo Sprint 0

| Requisito Sprint 0                            | Evidencia                                       |
|------------------------------------------------|-------------------------------------------------|
| React + Vite + TypeScript                      | `package.json`, `vite.config.ts`, `tsconfig.*`  |
| Tailwind + PostCSS + Autoprefixer              | `tailwind.config.js`, `postcss.config.js`, `src/index.css` |
| Estructura SPA (carpetas)                      | `src/components`, `pages`, `layouts`, `routes`, `hooks`, `services`, `context`, `utils` |
| Rutas iniciales                                | `src/routes/AppRouter.tsx`                      |
| ESLint con plugin de accesibilidad             | `eslint.config.js` + `eslint-plugin-jsx-a11y`   |
| Layouts base (auth, dashboard, sala)           | `src/layouts/*Layout.tsx`                       |
| Componentes reutilizables accesibles           | `src/components/*.tsx`                          |
| WCAG 2.2 base                                  | Ver `docs/accessibility.md`                     |
| Integración Firebase                           | `src/services/firebase.ts`, `context/AuthContext.tsx` |
| Estructura para Socket.IO                      | `src/services/socket.ts`                        |

---

## 10. Soporte de tareas núcleo (T1–T4)

| Tarea | Soporte actual                                                            |
|-------|---------------------------------------------------------------------------|
| T1 — Identidad y salas | `LoginPage`, `RegisterPage`, `DashboardPage`, `ProfilePage` listas; CRUD de salas en Sprint 1. |
| T2 — Chat y historial  | `services/socket.ts` listo para emitir `join-room` / `send-message`; UI de chat en Sprint 1. |
| T3 — Audio/Video       | `services/socket.ts` listo para signaling SDP/ICE; cliente WebRTC en Sprint 2. |
| T4 — Compartición de pantalla | Reutiliza el mismo signaling de T3 con `getDisplayMedia()` en Sprint 2. |
