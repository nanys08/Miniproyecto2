# Contrato técnico para el frontend — Backend Sprint 0

Documento autocontenido para que el frontend conecte con el backend sin tener que adivinar nada. Cualquier cambio que rompa este contrato debe versionarse y avisarse.

> **Cómo se actualiza este doc:** si cambia un endpoint, un código de error o un payload, edita primero este archivo y luego sincroniza Swagger (`src/config/swagger.ts`).

## 1. URLs base

| Entorno     | REST                                                   | Socket.IO                       |
|-------------|--------------------------------------------------------|---------------------------------|
| Local       | `http://localhost:3000`                                | `http://localhost:3000`         |
| Producción  | `https://miniproyecto2-backend.onrender.com`           | `https://miniproyecto2-backend.onrender.com` |

El backend expone:
- `GET /` — info del servicio (status, env, links a docs/health).
- `GET /health` — health check.
- `GET /api/docs` — Swagger UI navegable.
- `GET /api/docs.json` — OpenAPI 3.

## 2. CORS

`CORS_ORIGIN` del backend acepta **una sola URL o varias separadas por coma**. Aplicado tanto a Express como a Socket.IO. Configura ahí las URLs de tus deploys del frontend, por ejemplo:

```
CORS_ORIGIN=http://localhost:5173,https://miniproyecto2.vercel.app
```

Si la URL del frontend no está en la lista, las requests CORS preflight fallarán antes de llegar al middleware de auth.

## 3. Autenticación — quién hace qué

**El backend nunca crea usuarios ni gestiona contraseñas.** Ese paso vive 100 % en el cliente con el SDK de Firebase. El backend solo **verifica** los ID Tokens que el cliente le envía.

### 3.1 Flujo Email/Password (registro)

1. Cliente: `createUserWithEmailAndPassword(auth, email, pass)` → recibe `uid` + `idToken`.
2. Cliente: `POST /api/auth/register` con header `Authorization: Bearer <idToken>` y body `{ username, fullName, provider: "password", avatar? }`.
3. Backend: crea `users/{uid}` en Firestore (validando username único en transacción).

### 3.2 Flujo Email/Password (login)

1. Cliente: `signInWithEmailAndPassword(auth, email, pass)` → recibe `idToken`.
2. Cliente: `GET /api/auth/me` con `Authorization: Bearer <idToken>`.
   - 200 → usuario existente, ya está todo listo.
   - 404 → el usuario tiene Auth pero no perfil en Firestore (caso raro: registro incompleto). Llamar a `/register`.

### 3.3 Flujo Google

1. Cliente: `signInWithPopup(auth, googleProvider)` → recibe `uid`, `idToken`, `email`, `photoURL`, `displayName`.
2. Cliente: `GET /api/auth/me`.
   - **200** → usuario ya registrado. Listo.
   - **404** → es la primera vez con Google. El frontend **debe pedirle un `username`** (y dejar que confirme/edite `fullName`) y luego:
3. Cliente: `POST /api/auth/register` con `provider: "google"`, `username`, `fullName`, `avatar: photoURL`.

### 3.4 Persistencia de sesión tras recargar

Vive 100 % en el SDK Firebase del cliente. En el frontend, durante la inicialización:

```ts
import { browserLocalPersistence, setPersistence } from "firebase/auth";
await setPersistence(auth, browserLocalPersistence);
```

Con eso, al recargar la página el SDK rehidrata el usuario y `auth.currentUser` queda disponible inmediatamente; el frontend pide un ID Token fresco con `await user.getIdToken()` y vuelve a hablarle al backend.

### 3.5 Logout

- **Normal:** `auth.signOut()` en el cliente. El backend no se entera.
- **Forzado / en todas las sesiones:** `POST /api/auth/logout` con `Authorization: Bearer <idToken>`. Revoca todos los refresh tokens del UID y marca al usuario offline. Combina con `auth.signOut()` local.

## 4. Headers requeridos

Toda ruta privada exige:

```
Authorization: Bearer <firebase_id_token>
Content-Type: application/json   (si hay body)
```

El ID Token se obtiene con `await firebase.auth().currentUser.getIdToken()`. Vive ≤ 1 h; el SDK lo refresca solo. Cuando recibas `401` con `INVALID_TOKEN`, pide uno nuevo con `getIdToken(true)` y reintenta una vez antes de cerrar sesión.

## 5. Endpoints REST

### 5.1 `POST /api/auth/register` 🔒

Crea el perfil `users/{uid}` tras el signup de Firebase Auth.

**Request**
```json
{
  "username": "juanp",
  "fullName": "Juan Pérez",
  "provider": "password",
  "avatar": "https://..."  // opcional, default "default_avatar.png"
}
```

| Campo      | Reglas                                                                         |
|------------|--------------------------------------------------------------------------------|
| `username` | string obligatorio, regex `^[a-zA-Z0-9_]{3,20}$`, único en toda la colección   |
| `fullName` | string obligatorio                                                             |
| `provider` | `"password"` o `"google"`                                                      |
| `avatar`   | string opcional (URL)                                                          |

**Responses**
- `201 { "user": User }` — creado.
- `400 { error: "MISSING_FIELDS" | "USERNAME_INVALID" | "PROVIDER_INVALID", message }`
- `401 { error: "MISSING_TOKEN" | "INVALID_TOKEN", message }`
- `409 { error: "USERNAME_ALREADY_EXISTS" | "PROFILE_ALREADY_EXISTS", message }`
- `500 { error: "INTERNAL_ERROR", message }`

### 5.2 `GET /api/auth/me` 🔒

Devuelve el perfil del usuario autenticado.

**Responses**
- `200 { "user": User }`
- `401 { error: "MISSING_TOKEN" | "INVALID_TOKEN", message }`
- `404 { error: "PROFILE_NOT_FOUND", message }` — Auth existe pero falta el doc en Firestore (caso de Google primera vez).
- `500 { error: "INTERNAL_ERROR", message }`

### 5.3 `GET /api/auth/check-username/:username`

Endpoint **público** (sin token) para validación en vivo del username durante el formulario de registro.

**Responses**
- `200 { "available": boolean }`
- `400 { error: "USERNAME_INVALID", message }` — el formato del path param no cumple la regex.
- `500 { error: "INTERNAL_ERROR", message }`

### 5.4 `POST /api/auth/logout` 🔒

Revoca refresh tokens y marca offline. **204** sin body.

**Responses**
- `204` — sesión cerrada.
- `401 { error: "MISSING_TOKEN" | "INVALID_TOKEN", message }`
- `500 { error: "INTERNAL_ERROR", message }`

## 6. Tipos compartidos (replica en el frontend)

```ts
export type AuthProvider = "password" | "google";

export interface User {
  uid: string;
  username: string;
  fullName: string;
  email: string;
  avatar: string;
  provider: AuthProvider;
  createdAt: string;   // ISO 8601 (Firestore Timestamp serializado)
  online: boolean;
}

export type ApiErrorCode =
  | "MISSING_TOKEN"
  | "INVALID_TOKEN"
  | "MISSING_FIELDS"
  | "USERNAME_INVALID"
  | "PROVIDER_INVALID"
  | "USERNAME_ALREADY_EXISTS"
  | "PROFILE_ALREADY_EXISTS"
  | "PROFILE_NOT_FOUND"
  | "INTERNAL_ERROR";

export interface ApiError {
  error: ApiErrorCode;
  message: string;   // legible en español, apto para mostrar al usuario
}
```

**Regla de oro:** el frontend toma decisiones con `error` (estable); muestra al usuario `message` o un texto traducido por su propio i18n.

## 7. Manejo de errores recomendado

```ts
async function api<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const idToken = await auth.currentUser?.getIdToken();
  const res = await fetch(input, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "Content-Type": "application/json",
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    },
  });

  if (res.status === 204) return undefined as T;
  const body = await res.json();

  if (!res.ok) {
    const err = body as ApiError;
    // 401 con token inválido → intenta refresh y reintenta una vez
    if (res.status === 401 && err.error === "INVALID_TOKEN") {
      await auth.currentUser?.getIdToken(true);
      // ... reintento opcional
    }
    throw Object.assign(new Error(err.message), { code: err.error, status: res.status });
  }
  return body as T;
}
```

**No parsees `message`** para tomar decisiones. Usa siempre `error` (el código estable).

## 8. Socket.IO

### 8.1 Handshake

El token se manda en `auth.token` del handshake (NO en query). El servidor valida con `checkRevoked: true`, así que un logout server-side desconecta los reconexión.

```ts
import { io } from "socket.io-client";

const socket = io(BACKEND_URL, {
  auth: { token: await auth.currentUser!.getIdToken() },
  // Si necesitas refresh dinámico ante reconexión:
  // auth: (cb) => auth.currentUser!.getIdToken().then((t) => cb({ token: t })),
});

socket.on("connect_error", (err) => {
  // err.message será "MISSING_TOKEN" o "INVALID_TOKEN" (mismos códigos que REST)
});
```

### 8.2 Eventos (resumen, ver `docs/sockets.md` para detalle)

| Evento            | Dirección | Payload                                                  |
|-------------------|-----------|----------------------------------------------------------|
| `join-room`       | C→S       | `roomId: string`                                         |
| `user-joined`     | S→sala    | `{ uid, username }`                                      |
| `user-left`       | S→sala    | `{ uid, username }`                                      |
| `send-message`    | C→S       | `{ roomId, content }`                                    |
| `receive-message` | S→sala    | `{ senderUid, senderUsername, content, roomId, createdAt }` |
| `webrtc-offer`    | bidi      | `{ targetSocketId, sdp }` → `{ fromSocketId, sdp }`      |
| `webrtc-answer`   | bidi      | `{ targetSocketId, sdp }` → `{ fromSocketId, sdp }`      |
| `ice-candidate`   | bidi      | `{ targetSocketId, candidate }` → `{ fromSocketId, candidate }` |

## 9. Reglas Firestore

Están en `firestore.rules` (raíz del repo). Resumen para que el frontend no se sorprenda:

- Toda lectura requiere `request.auth != null`.
- Solo el dueño del UID puede crear su propio `users/{uid}`.
- El cliente **no puede** modificar `uid`, `username`, `email`, `provider` ni `createdAt` directamente desde el SDK Firebase. Si necesita cambiarlos, debe hacerlo vía endpoint backend (cuando se implemente `PATCH /api/auth/me`).
- Borrar `users/{uid}` desde el cliente está prohibido.

Si el frontend va a leer/escribir Firestore directo (presencia rápida, listas), respeta estas reglas. Para escrituras de campos sensibles, usa la API REST.

## 10. Variables de entorno que necesita el frontend

El backend no genera config para el frontend, pero estas son las que el frontend típicamente usa para conectar:

```
VITE_API_BASE_URL=http://localhost:3000
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

Los valores Firebase deben ser los **mismos** que tiene el backend en `FIREBASE_*` (mismo proyecto). Solo así los ID Tokens que emite el cliente serán reconocidos por el Admin SDK.

## 11. Checklist de integración

Antes de marcar la conexión como "lista", verifica desde el frontend:

- [ ] `GET /health` responde 200.
- [ ] `GET /api/auth/check-username/disponible_test` responde `{ available: true }`.
- [ ] Después de `signInWithEmailAndPassword`, `GET /api/auth/me` con el ID Token responde 404 si nunca llamaste a register.
- [ ] `POST /api/auth/register` válido devuelve 201 + `user`.
- [ ] Repetir el mismo `username` desde otra cuenta devuelve 409 `USERNAME_ALREADY_EXISTS`.
- [ ] Llamar a `/me` sin token devuelve 401 `MISSING_TOKEN`.
- [ ] Llamar a `/me` con un token corrupto devuelve 401 `INVALID_TOKEN`.
- [ ] Tras `POST /api/auth/logout`, una request con el token viejo devuelve 401 `INVALID_TOKEN` (sin esperar a la expiración natural).
- [ ] El socket conecta con `auth.token = <idToken>`; sin token, `connect_error.message === "MISSING_TOKEN"`.
