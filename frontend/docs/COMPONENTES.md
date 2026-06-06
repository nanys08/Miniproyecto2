# Documentación de la interfaz — Estructura y Componentes

Frontend de **EstudioColab** (React + TypeScript + Vite + Tailwind CSS).
Documenta la organización del proyecto (Tarea 1) y la función de cada
componente/módulo (Tarea 2).

---

## 1. Estructura del proyecto

```
frontend/
├── public/                      # Estáticos (favicon, avatares)
├── src/
│   ├── components/              # Componentes reutilizables (UI)
│   │   ├── room/                # Componentes de la sala (chat, video)
│   │   └── rooms/               # Modales de gestión de salas
│   ├── pages/                   # Pantallas (una por ruta)
│   ├── layouts/                 # Estructuras compartidas (sidebar, header)
│   ├── services/               # Clientes de API / WebSocket / Firebase
│   ├── hooks/                   # Lógica reutilizable con estado (React hooks)
│   ├── context/                 # Estado global (Auth, Toasts)
│   ├── routes/                  # Enrutado y rutas protegidas
│   ├── utils/                   # Utilidades puras (cn, validación)
│   ├── index.css                # Estilos base + accesibilidad (focus, etc.)
│   ├── App.tsx                  # Composición de providers + router
│   └── main.tsx                 # Punto de entrada de React
├── docs/                        # Documentación (este archivo, manual, evidencias)
├── .env.example                 # Variables de entorno (Vite)
├── tailwind.config.js           # Design system (colores, focus ring)
└── vite.config.ts
```

Convención de capas (de arriba hacia abajo, sin dependencias circulares):

```
pages / layouts  →  components  →  hooks  →  services  →  (API / WebSocket / Firebase)
                         └────────→  context (estado global)
```

---

## 2. Componentes de UI (`src/components/`)

| Archivo | Función |
|---|---|
| `Button.tsx` | Botón base con variantes (primary/secondary/ghost/danger), tamaños, estado `isLoading` y aro de foco accesible. |
| `Input.tsx` | Campo de texto con `<label>`, error y `aria-describedby`. |
| `Checkbox.tsx` | Casilla accesible con label asociado. |
| `Modal.tsx` | Diálogo accesible: `role="dialog"`, `aria-modal`, **focus-trap**, cierre con Esc y retorno de foco al disparador. |
| `Card.tsx` | Contenedor con borde/sombra del design system. |
| `Avatar.tsx` | Avatar circular con iniciales y **color determinista por nombre**. |
| `Logo.tsx` | Logotipo de EstudioColab (texto configurable para el header navy). |
| `Loader.tsx` | Spinner con etiqueta accesible. |
| `Skeleton.tsx` | Placeholders animados de carga (`aria-hidden`). |
| `ErrorState.tsx` | Bloque de error reutilizable (título, mensaje, Reintentar). |
| `ErrorBoundary.tsx` | Captura errores de render para no romper toda la app. |
| `GoogleButton.tsx` | Botón "Continuar con Google". |
| `SkipLink.tsx` | Enlace "Saltar al contenido" (accesibilidad de teclado). |

### Componentes de sala (`src/components/room/`)

| Archivo | Función |
|---|---|
| `ChatPanel.tsx` | Panel de chat completo: tabs Chat/Participantes, lista de mensajes (`role="log"`), estados de historial (cargando/vacío/error), scroll inteligente con badge de nuevos mensajes, barra de reconexión. |
| `MessageBubble.tsx` | Burbuja de un mensaje: enviada (azul, derecha) / recibida (gris, izquierda, con nombre y avatar), hora `HH:MM`. |
| `MessageInput.tsx` | Caja de envío: validación de vacío/500 caracteres, contador, "Enviando mensaje…", Enter envía / Shift+Enter salta línea. |
| `ConnectionBadge.tsx` | Indicador de estado de conexión (conectado/reconectando/…), `role="status"`. |

### Modales de salas (`src/components/rooms/`)

| Archivo | Función |
|---|---|
| `CreateRoomModal.tsx` | Crea una sala (nombre + código generado) → `POST /rooms`. |
| `JoinRoomModal.tsx` | **Permite unirse a una sala** por código: validación local ("Código inválido"), `POST /rooms/join`, manejo de éxito/404. |
| `RoomSettingsModal.tsx` | Configuración del anfitrión (US-07): editar nombre (`PUT`) y eliminar con *type-to-confirm* (`DELETE`). |

---

## 3. Pantallas (`src/pages/`)

| Archivo | Ruta | Función |
|---|---|---|
| `HomePage.tsx` | `/` | Landing / bienvenida. |
| `LoginPage.tsx` | `/login` | Inicio de sesión (email/password + Google). |
| `RegisterPage.tsx` | `/register` | Registro manual + flujo de username (Google). |
| `DashboardPage.tsx` | `/dashboard` | Panel principal: crear/unirse, salas recientes. |
| `RoomPage.tsx` | `/room/:id` | **Sala activa**: grid de video, chat en tiempo real, participantes, configuración (anfitrión). |
| `ProfilePage.tsx` | `/profile` | Ver/editar perfil, eliminar cuenta. |
| `NotFoundPage.tsx` | `*` | 404. |

---

## 4. Layouts (`src/layouts/`)

| Archivo | Función |
|---|---|
| `AuthLayout.tsx` | Marco de las pantallas de login/registro. |
| `DashboardLayout.tsx` | **Header navy + sidebar "MENÚ" + contenido**; responsive (sidebar fijo en desktop, drawer en móvil). |
| `RoomLayout.tsx` | Marco a pantalla completa de la sala. |

---

## 5. Servicios (`src/services/`)

| Archivo | Función |
|---|---|
| `api.ts` | Cliente REST tipado (`get/post/put/patch/delete`); adjunta el Firebase ID Token automáticamente. |
| `apiErrors.ts` | Traduce errores del backend a mensajes accesibles (`friendlyError`). |
| `firebase.ts` | Inicialización del SDK web de Firebase (Auth). |
| `rooms.ts` | Dominio de salas: `createRoom`, `joinRoom`, `getRoom`, `enterRoom`, `updateRoom`, `deleteRoom`. |
| `messages.ts` | Tipo `Message` + `getRoomHistory` (historial REST) + `messageTimestamp`. |
| `users.ts` | Perfil público de otros usuarios. |
| `socket.ts` | Socket heredado (puerto 3000) para presencia del grid de video. |
| `chatService.ts` | **Cliente WebSocket del chat-service** (`/ws/chat`, puerto 8081). |

---

## 6. Hooks (`src/hooks/`)

| Archivo | Función |
|---|---|
| `useAuth.ts` | Acceso al contexto de autenticación (usuario, login, logout…). |
| `useToast.ts` | Disparar notificaciones (toasts). |
| `useChat.ts` | Socket heredado: presencia del grid de video y estado de medios. |
| `useRoomChat.ts` | **Chat en tiempo real (chat-service)**: historial, `receive_message`, `send_message` (validación), reconexión, participantes, ROOM_DELETED, estado del historial. |
| `useFocusMain.ts` | Mueve el foco al `<main>` al cambiar de ruta (accesibilidad). |

---

## 7. Estado global, rutas y utilidades

| Archivo | Función |
|---|---|
| `context/AuthContext.tsx` | Provider de sesión (Firebase + perfil). |
| `context/ToastContext.tsx` | Provider de notificaciones. |
| `routes/AppRouter.tsx` | Mapa de rutas de la app. |
| `routes/ProtectedRoute.tsx` | Protege rutas privadas (redirige a login si no hay sesión). |
| `utils/cn.ts` | Une clases de Tailwind condicionalmente. |
| `utils/validation.ts` | Validaciones de formularios (username, email, etc.). |

---

## 8. Design System (tokens)

Definido en `tailwind.config.js` e `index.css`:

| Token | Hex | Uso |
|---|---|---|
| `navy` | `#1E3A5F` | Header / barra de navegación |
| `brand.500` | `#2563EB` | Botones primarios, links, foco |
| `brand.50` | `#EFF6FF` | Fondos informativos, inputs activos |
| `surface` | `#F9FAFB` | Sidenav y listas |
| `canvas` | `#FAFBFC` | Área de contenido |
| (emerald) | `#16A34A` | Confirmaciones, estado activo |
| (red) | `#DC2626` | Errores, acciones destructivas |
| (amber) | `#D97706` | Reconectando, advertencias |
| (slate-900) | `#111827` | Texto principal |
| (slate-600) | `#4B5563` | Texto secundario, timestamps |

Accesibilidad base (`index.css`): aro de foco `:focus-visible` de 3px, soporte de
`prefers-reduced-motion`, tipografía legible (16px / line-height 1.5).
