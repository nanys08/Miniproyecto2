# Salón de Estudio Colaborativo — Backend

Backend del **Mini-proyecto 2 — Proyecto Integrador I (2026-I)**. Da soporte a una aplicación web colaborativa en tiempo real con chat, videollamadas, audio y compartición de pantalla.

Este repositorio cubre el alcance del **Sprint 0**: dejar lista la arquitectura técnica, la conexión con Firebase, los modelos de datos, los eventos de tiempo real y el despliegue base.

---

## 1. Stack técnico

| Capa                  | Tecnología                                   |
|-----------------------|----------------------------------------------|
| Runtime               | Node.js + TypeScript                         |
| Framework HTTP        | Express 5                                    |
| Tiempo real           | Socket.IO 4                                  |
| Autenticación         | Firebase Authentication (verificación de ID Tokens vía `firebase-admin`) |
| Persistencia          | Cloud Firestore (NoSQL)                      |
| Signaling AV          | Socket.IO actúa como signaling para WebRTC   |
| Documentación API     | OpenAPI 3 vía `swagger-jsdoc` + `swagger-ui-express` |
| Despliegue            | Render (`render.yaml`)                       |

---

## 2. Estructura del proyecto

```
src/
 ├── app.ts                  # Configuración Express, CORS, montaje Swagger UI
 ├── server.ts               # HTTP server + Socket.IO bootstrap
 ├── config/
 │    ├── env.ts             # Carga y tipado de variables de entorno
 │    ├── firebase.ts        # Inicialización Firebase Admin (Auth + Firestore)
 │    └── swagger.ts         # Spec OpenAPI base
 ├── controllers/            # Handlers HTTP (capa de transporte)
 │    └── authController.ts
 ├── routes/                 # Definición de endpoints REST
 │    ├── index.ts
 │    └── authRoutes.ts
 ├── services/               # Lógica de negocio + acceso a Firestore
 │    └── authService.ts
 ├── middlewares/            # Verificación de Firebase ID Token
 │    └── authMiddleware.ts
 ├── sockets/                # Gestión de eventos en tiempo real
 │    └── socketManager.ts
 ├── models/                 # Interfaces de documentos Firestore
 │    ├── User.ts
 │    ├── Room.ts
 │    └── Message.ts
 └── utils/
      └── logger.ts
docs/
 ├── sockets.md              # Eventos Socket.IO y signaling WebRTC
 └── flows.md                # Flujos internos: auth, salas, chat, presencia, Firestore
```

---

## 3. Arquitectura

```
┌────────────────┐         REST (HTTP)         ┌──────────────────────────┐
│  Frontend      │ ──────────────────────────▶ │  Express                 │
│  (React +      │     /api/auth/*             │  (controllers, services) │
│   Firebase     │                             └────────────┬─────────────┘
│   Auth SDK)    │                                          │
│                │ ◀──── Socket.IO (WebSocket) ─────────────┤
│                │     join-room, send-message,             │
│                │     webrtc-offer/answer, ice-candidate   │
└───┬────────────┘                                          │
    │                                                       ▼
    │ WebRTC (P2P, audio/video/screen)             ┌────────────────┐
    └─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │ Firebase       │
                                                  │ Auth + Firestore│
                                                  └────────────────┘
```

- **REST** se usa para operaciones puntuales (registro de perfil, lookup de username, obtener `me`).
- **Socket.IO** mantiene la sesión en tiempo real: chat, presencia y signaling WebRTC.
- **WebRTC** transporta audio/video/pantalla P2P entre navegadores; el backend solo intermedia el handshake.
- **Firebase Auth** emite ID Tokens (JWT) que el backend verifica en cada request y en el handshake de Socket.IO.
- **Firestore** persiste perfiles, salas y mensajes.

---

## 4. Modelo de datos (Firestore)

### `users/{uid}`
```ts
{
  uid: string;
  username: string;      // único — validado en el backend
  email: string;
  avatar: string;
  createdAt: Timestamp;
  online: boolean;
}
```

### `rooms/{roomId}`
```ts
{
  id: string;
  name: string;
  createdBy: string;     // uid del creador
  participants: string[];// uids
  createdAt: Timestamp;
  isActive: boolean;
}
```

### `messages/{messageId}`
```ts
{
  id: string;
  roomId: string;
  senderUid: string;
  senderUsername: string;
  content: string;
  type: "text" | "system";
  createdAt: Timestamp;
}
```

---

## 5. API REST

Documentación interactiva: **`/api/docs`** (Swagger UI) y spec JSON en **`/api/docs.json`**.

| Método | Ruta                                | Auth | Descripción                                |
|--------|-------------------------------------|------|--------------------------------------------|
| GET    | `/health`                           | —    | Health check (usado por Render)            |
| POST   | `/api/auth/register`                | ✅   | Crea el perfil del usuario en Firestore    |
| GET    | `/api/auth/me`                      | ✅   | Devuelve el perfil del usuario autenticado |
| GET    | `/api/auth/check-username/:username`| —    | Verifica disponibilidad de un username     |

> **Auth:** los endpoints marcados requieren header `Authorization: Bearer <firebase_id_token>`. El middleware `verifyToken` valida el token con `admin.auth().verifyIdToken()`.

---

## 6. Eventos en tiempo real

Documento completo: **[`docs/sockets.md`](docs/sockets.md)**.

Resumen:

| Evento             | Historia | Propósito                                    |
|--------------------|----------|----------------------------------------------|
| `join-room`        | TS-02    | Entrar a una sala                            |
| `user-joined`      | TS-02    | Avisar de nuevo miembro                      |
| `send-message`     | TS-02    | Enviar mensaje al room                       |
| `receive-message`  | TS-02    | Difundir mensaje                             |
| `user-left`        | TS-02    | Avisar de salida                             |
| `disconnect`       | TS-02    | Limpiar estado y marcar offline              |
| `webrtc-offer`     | TS-03    | Iniciar negociación SDP                      |
| `webrtc-answer`    | TS-03    | Aceptar negociación SDP                      |
| `ice-candidate`    | TS-03    | Intercambiar candidatos ICE                  |

---

## 7. Variables de entorno

Copia `.env.example` a `.env` y completa los valores:

```bash
cp .env.example .env
```

| Variable                          | Descripción                                                  |
|-----------------------------------|--------------------------------------------------------------|
| `PORT`                            | Puerto HTTP (default 3000)                                   |
| `NODE_ENV`                        | `development` \| `production`                                |
| `CORS_ORIGIN`                     | Origen permitido (frontend), ej. `http://localhost:5173`     |
| `FIREBASE_API_KEY` y demás `FIREBASE_*` | Config del proyecto Firebase (cliente)                 |
| `FIREBASE_ADMIN_PROJECT_ID`       | Project ID del Service Account                               |
| `FIREBASE_ADMIN_CLIENT_EMAIL`     | Email del Service Account                                    |
| `FIREBASE_ADMIN_PRIVATE_KEY`      | Private key del Service Account (con `\n` escapados)         |

---

## 8. Instalación y ejecución

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.example .env
# (editar .env con credenciales Firebase)

# 3. Modo desarrollo (hot reload con nodemon)
npm run dev

# 4. Build producción
npm run build

# 5. Ejecutar build
npm start
```

Verificación rápida:
- `GET http://localhost:3000/health` → `{ "status": "ok", "env": "development" }`
- `GET http://localhost:3000/api/docs` → Swagger UI

---

## 9. Despliegue (Render)

El archivo `render.yaml` define el servicio web. Pasos:

1. Crear el servicio en Render apuntando al repo.
2. Configurar las variables de entorno definidas en `render.yaml` (todas `sync: false`, se llenan en el dashboard).
3. Render ejecuta automáticamente `npm install && npm run build` y arranca con `npm start`.
4. Endpoint de health para el monitoring: `/health`.

URL esperada: `https://miniproyecto2-backend.onrender.com`

---

## 10. Mapeo Sprint 0

| Requisito Sprint 0                          | Evidencia                                    |
|---------------------------------------------|----------------------------------------------|
| Estructura Node/Express/TypeScript          | `package.json`, `tsconfig.json`, `src/`      |
| Carpetas organizadas                        | `src/controllers`, `services`, etc.          |
| Scripts `dev` / `build` / `start`           | `package.json:6-10`                          |
| `dotenv` y `.env.example`                   | `src/config/env.ts`, `.env.example`          |
| Firebase Auth + Firestore conectados       | `src/config/firebase.ts`                     |
| Colecciones `users / rooms / messages`     | `src/models/*.ts`                            |
| Flujo autenticación (registro, login, persistencia, logout) | `docs/flows.md §1` + `authController`/`authService` |
| Flujo de salas (crear, unirse, editar, eliminar, host)       | `docs/flows.md §2` (planificación Sprint 1+) |
| Flujo realtime (Socket.IO, rooms, chat)                       | `docs/flows.md §3` + `docs/sockets.md` + `sockets/socketManager.ts` |
| Signaling WebRTC (SDP, ICE)                                   | `docs/flows.md §4` + `docs/sockets.md §3` + `sockets/socketManager.ts §webrtc-*` |
| Persistencia Firestore (users, rooms, messages)               | `docs/flows.md §5` + `src/models/*.ts`        |
| Despliegue Render                                             | `render.yaml`                                 |
| Arquitectura documentada                                      | Este README + `docs/sockets.md` + `docs/flows.md` |
| Documentación API (Swagger)                 | `/api/docs` con `swagger-jsdoc`              |
| Contrato de integración con frontend        | **[`docs/contrato-frontend.md`](docs/contrato-frontend.md)** — URLs, payloads, errores, Socket.IO, fetch helper, checklist |

---

## 11. Tareas núcleo del producto (T1–T4)

| Tarea | Soporte actual                                                                 |
|-------|--------------------------------------------------------------------------------|
| T1 — Identidad y salas | `POST /auth/register`, `GET /auth/me`, `POST /auth/logout`, `GET /auth/check-username`. Salas modeladas en `models/Room.ts` (CRUD en Sprint 1). |
| T2 — Chat y historial  | Eventos `send-message` / `receive-message`. **Persistencia en Firestore pendiente para Sprint 1.** |
| T3 — Audio/Video       | Signaling SDP/ICE listo (`webrtc-offer/answer`, `ice-candidate`). Implementación cliente en Sprint 2+. |
| T4 — Compartición de pantalla | Mismo signaling que T3; el cliente usa `getDisplayMedia()` y reemplaza track. |
