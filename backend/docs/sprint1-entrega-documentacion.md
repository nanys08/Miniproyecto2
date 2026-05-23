# Entrega Sprint 1 — Documentación técnica de la API y estructura de datos

**Proyecto:** Salón de Estudio Colaborativo (Mini-proyecto 2)
**Sprint:** 1 — Documentación técnica
**Componente:** Backend (Node.js + Express + TypeScript + Firebase Admin)
**Fecha de entrega:** 2026-05-23

---

## 0. Resumen ejecutivo

El objetivo de este sprint era dejar la API y la estructura de datos
documentadas de tal forma que cualquier persona del equipo —backend,
frontend o QA— pueda integrarse sin tener que adivinar nada. Para ello
se trabajó en tres frentes:

1. **Swagger (OpenAPI 3.0.3) operativo** en `/api/docs`, con request,
   response y errores documentados para todos los endpoints de
   autenticación (registro, “login” informativo, validación de username,
   perfil de usuario, logout y validación de correo).
2. **Modelo Firestore documentado** en un archivo dedicado
   (`backend/docs/firestore-model.md`) que describe la colección
   `users/{uid}` campo por campo, sus invariantes, las reglas de seguridad
   y la convención de mantenimiento.
3. **JSDoc en todo el código backend** (controladores, middleware,
   servicios, validaciones y configuración Firebase), con `@param`,
   `@returns`, `@throws` y descripciones de comportamiento, propagado al
   build de TypeScript (`.d.ts`).

Como verificación, el build (`npx tsc`) está limpio, los 44 tests unitarios
pasan en verde y el spec OpenAPI se genera con 7 paths, 5 esquemas
compartidos y 12 códigos de error estables.

---

## 1. Cómo funciona Auth

### 1.1 Modelo de responsabilidades

> **Regla de oro:** El backend nunca crea usuarios ni gestiona contraseñas.
> Ese paso vive 100 % en el cliente con el SDK de Firebase. El backend
> solo **verifica** los ID Tokens que el cliente le envía y persiste el
> perfil en Firestore.

| Responsabilidad                                | Dónde vive                |
|------------------------------------------------|---------------------------|
| Crear cuenta (email/password)                  | Cliente — Firebase Auth   |
| Login con email/password                       | Cliente — Firebase Auth   |
| Login con Google                               | Cliente — Firebase Auth   |
| Emitir/refrescar ID Tokens                     | Firebase Auth             |
| Verificar ID Tokens en cada request privada    | Backend — Admin SDK       |
| Persistir perfil (`users/{uid}` en Firestore)  | Backend (`/register`)     |
| Devolver perfil al frontend                    | Backend (`/me`)           |
| Revocar refresh tokens (logout server-side)    | Backend (`/logout`)       |
| Validar unicidad de username                   | Backend (en transacción)  |
| Bloquear palabras prohibidas                   | Backend (lista negra)     |
| Comprobar si un correo ya existe               | Backend (`/check-email`)  |

Esto se hace así por dos motivos:
- **Seguridad:** las contraseñas nunca tocan el backend.
- **Simplicidad:** la lógica de refresh, sesión persistente y MFA la maneja
  Firebase Auth, no nosotros.

### 1.2 Flujo Email/Password — Registro

1. **Cliente:** `createUserWithEmailAndPassword(auth, email, password)`
   en el SDK de Firebase. Resultado: `uid` + `idToken`.
2. **Cliente → Backend:** `POST /api/auth/register` con header
   `Authorization: Bearer <idToken>` y body
   `{ username, fullName, provider: "password", avatar? }`.
3. **Backend:**
   - `verifyToken` (middleware) valida el ID Token con
     `admin.auth().verifyIdToken(token, true)` (`checkRevoked: true`).
   - Controller valida: campos presentes → regex de username → lista negra
     → provider válido.
   - Service ejecuta una **transacción** Firestore que verifica que el
     `uid` no tenga perfil ya (`PROFILE_ALREADY_EXISTS`) y que el
     `username` no esté tomado (`USERNAME_ALREADY_EXISTS`), y crea el
     documento `users/{uid}`.
4. **Cliente:** recibe `201 { user: User }` y navega al dashboard.

### 1.3 Flujo Email/Password — Login

1. **Cliente:** `signInWithEmailAndPassword(auth, email, password)`.
2. **Cliente → Backend:** `GET /api/auth/me` con el ID Token.
   - `200 { user }` → usuario ya tiene perfil, se va al dashboard.
   - `404 PROFILE_NOT_FOUND` → tiene Firebase Auth pero no tiene perfil
     en Firestore (caso raro: registro incompleto). El frontend redirige
     al formulario de registro para completar `username` y avatar.

### 1.4 Flujo Google

1. **Cliente:** `signInWithPopup(auth, new GoogleAuthProvider())`.
   Devuelve `uid`, `idToken`, `email`, `displayName`, `photoURL`.
2. **Cliente → Backend:** `GET /api/auth/me`.
   - `200` → usuario existente, listo.
   - `404` → **primera vez con Google**. El frontend pide `username`
     (y permite editar `fullName`) y llama a `POST /api/auth/register` con
     `provider: "google"`.

### 1.5 Persistencia de sesión

Vive 100 % en el SDK de Firebase del cliente:

```ts
import { browserLocalPersistence, setPersistence } from "firebase/auth";
await setPersistence(auth, browserLocalPersistence);
```

Al recargar la página el SDK rehidrata el usuario y el frontend pide un
ID Token fresco con `await user.getIdToken()` para volver a hablar con
el backend.

### 1.6 Logout

| Tipo                                | Cómo                                                                          |
|-------------------------------------|-------------------------------------------------------------------------------|
| Normal (solo este dispositivo)      | `auth.signOut()` en el cliente. El backend no se entera.                      |
| Forzado (todas las sesiones)        | `POST /api/auth/logout` → revoca todos los refresh tokens. El SDK seguirá teniendo un ID Token válido hasta su expiración natural (≤ 1 h), pero `verifyToken` lo rechazará al instante porque usa `checkRevoked: true`. |

### 1.7 Verificación del ID Token (middleware)

El middleware `verifyToken` (`backend/src/middlewares/authMiddleware.ts`):

- Lee `Authorization: Bearer <token>`.
- Llama a `admin.auth().verifyIdToken(token, true)`. El segundo argumento
  (`checkRevoked`) garantiza que un logout server-side tenga efecto
  inmediato.
- Pobla `req.user = { uid, email }` si el token es válido.
- Devuelve `401 MISSING_TOKEN` o `401 INVALID_TOKEN` según el caso. El
  motivo real (`auth/id-token-expired`, `auth/id-token-revoked`, etc.)
  queda en los logs internos pero **nunca se filtra al cliente**.

---

## 2. Cómo se guarda el usuario

### 2.1 Colección `users/`

```
users/
  {uid}/
    uid         string   (igual al ID del doc)
    username    string   (único, 4-10 chars, regex ^[a-zA-Z0-9_.]{4,10}$)
    fullName    string
    email       string   (del Firebase ID Token verificado, NO del body)
    avatar      string   (URL/ruta; default "default_avatar.png")
    provider    "password" | "google"
    createdAt   Timestamp (Date al escribir; ISO 8601 al serializar)
    online      boolean
```

### 2.2 Tabla de campos

| Campo       | Tipo                       | Obligatorio | Origen                                  | Descripción |
|-------------|----------------------------|-------------|-----------------------------------------|-------------|
| `uid`       | `string`                   | sí          | Firebase ID Token                        | Igual al ID del documento. Se guarda redundante para queries `where("uid", "==", ...)`. |
| `username`  | `string`                   | sí          | Body de `register`                      | 4-10 chars, regex `^[a-zA-Z0-9_.]{4,10}$`. Único en la colección. Filtrado por blacklist. |
| `fullName`  | `string`                   | sí          | Body de `register`                      | Nombre para mostrar. No requiere ser único. |
| `email`     | `string`                   | sí          | Firebase ID Token (NO del body)         | Email verificado por Firebase. Se toma del token para evitar suplantación. |
| `avatar`    | `string`                   | sí          | Body de `register` (default `default_avatar.png`) | URL o ruta del avatar. |
| `provider`  | `"password" \| "google"`   | sí          | Body de `register`                      | Mecanismo con que se autenticó originalmente. |
| `createdAt` | `Timestamp` / ISO 8601     | sí          | Backend (`new Date()`)                  | Timestamp de creación. Firestore lo serializa como ISO al exponerlo via API. |
| `online`    | `boolean`                  | sí          | Backend (`false` al crear)              | Flag de presencia. |

### 2.3 Ejemplo de documento

```json
{
  "uid": "abc123XYZ",
  "username": "juanp",
  "fullName": "Juan Pérez",
  "email": "juan@gmail.com",
  "avatar": "/avatars/avatar1.png",
  "provider": "password",
  "createdAt": "2026-05-23T19:48:00.000Z",
  "online": false
}
```

### 2.4 Invariantes

- `users/{uid}.uid === uid` (el campo coincide con el ID del documento).
- `username` único en toda la colección. La unicidad se garantiza con
  una **transacción Firestore** en `authService.registerUserProfile`.
- `email` viene siempre del Firebase ID Token verificado, **no del body**.
  Si el cliente envía un email distinto en el body, se ignora.
- `provider` ∈ `["password", "google"]`. Cualquier otro valor
  produce `400 PROVIDER_INVALID`.

### 2.5 Reglas de seguridad (`firestore.rules`)

| Operación | Quién puede                                                                |
|-----------|----------------------------------------------------------------------------|
| `read`    | Cualquier usuario autenticado (presencia, avatares, listas).               |
| `create`  | Solo el dueño del UID; debe traer todos los campos del esquema; `username` 4-10 chars. La unicidad y la regex completa la valida el backend. |
| `update`  | Solo el dueño. **No** puede cambiar `uid`, `username`, `email`, `provider` ni `createdAt`. Esos campos sensibles solo se modifican vía API REST. |
| `delete`  | Prohibido desde el cliente.                                                |

> El backend usa el **Admin SDK**, que bypasea estas reglas — son una red
> de seguridad por si el cliente intentara hablarle directo a Firestore.

### 2.6 Mapeo a TypeScript

```ts
// src/models/User.ts
export type AuthProvider = "password" | "google";

export interface User {
  uid: string;
  username: string;
  fullName: string;
  email: string;
  avatar: string;
  provider: AuthProvider;
  createdAt: FirebaseFirestore.Timestamp | Date;
  online: boolean;
}

export const USERS_COLLECTION = "users";
```

Convención: las constantes `*_COLLECTION` son la única forma de referenciar
nombres de colección desde el código. Nunca hardcodear strings.

---

## 3. Endpoints que existen

Documentados todos en Swagger (`GET /api/docs` o JSON crudo en
`GET /api/docs.json`).

| Método | Ruta                                        | Auth        | Propósito                                                |
|--------|---------------------------------------------|-------------|----------------------------------------------------------|
| GET    | `/health`                                   | Pública     | Health check para Render.                                |
| GET    | `/`                                         | Pública     | Endpoint informativo (status + links a docs/health).     |
| GET    | `/api/docs`                                 | Pública     | Swagger UI navegable.                                    |
| GET    | `/api/docs.json`                            | Pública     | Spec OpenAPI 3 crudo.                                    |
| POST   | `/api/auth/register`                        | **Privada** | Crea el perfil en Firestore tras signup en Firebase.     |
| GET    | `/api/auth/me`                              | **Privada** | Devuelve el perfil del usuario autenticado.              |
| POST   | `/api/auth/logout`                          | **Privada** | Revoca refresh tokens y marca offline.                   |
| GET    | `/api/auth/check-username/:username`        | Pública     | Verifica si un username está disponible.                 |
| GET    | `/api/auth/check-email/:email`              | Pública     | Verifica si un correo ya está registrado.                |
| —      | `/api/auth/login` (informativo)             | —           | Vive en el SDK de Firebase del cliente, no es endpoint.  |

### 3.1 `POST /api/auth/register` (privada)

Crea el documento `users/{uid}` a partir del UID y email del Firebase ID
Token. El cliente ya debe haberse autenticado con Firebase Auth (signup)
antes de llamar.

**Validaciones en orden:**
1. Campos obligatorios presentes (`username`, `fullName`, `provider`).
2. `username` cumple regex `^[a-zA-Z0-9_.]{4,10}$`.
3. `username` no aparece en la lista negra de palabras prohibidas
   (`USERNAME_FORBIDDEN`). Lista en `src/utils/profanity.ts`.
4. `provider` es `"password"` o `"google"`.
5. (En transacción Firestore) el `uid` no tiene perfil ya y el `username`
   no está tomado.

**Request**

```http
POST /api/auth/register
Authorization: Bearer <firebase_id_token>
Content-Type: application/json
```

```json
{
  "username": "juanp",
  "fullName": "Juan Pérez",
  "provider": "password",
  "avatar": "/avatars/avatar1.png"
}
```

**Reglas por campo**

| Campo      | Reglas                                                                                          |
|------------|-------------------------------------------------------------------------------------------------|
| `username` | string obligatorio, regex `^[a-zA-Z0-9_.]{4,10}$`, único, sin palabras de la lista negra        |
| `fullName` | string obligatorio                                                                              |
| `provider` | `"password"` o `"google"`                                                                       |
| `avatar`   | string opcional (URL/ruta)                                                                      |

**Responses**

| Status | Body                                                                                  | Caso |
|--------|---------------------------------------------------------------------------------------|------|
| 201    | `{ "user": User }`                                                                    | Creado |
| 400    | `{ "error": "MISSING_FIELDS", "message": "Faltan campos obligatorios..." }`           | Falta `username`, `fullName` o `provider` |
| 400    | `{ "error": "USERNAME_INVALID", "message": "username inválido: 4-10 caracteres..." }` | No cumple la regex |
| 400    | `{ "error": "USERNAME_FORBIDDEN", "message": "Ese nombre de usuario no está permitido" }` | Contiene palabra prohibida |
| 400    | `{ "error": "PROVIDER_INVALID", "message": "provider debe ser 'password' o 'google'" }` | Provider inválido |
| 401    | `{ "error": "MISSING_TOKEN" \| "INVALID_TOKEN", "message": "..." }`                   | Token ausente o inválido |
| 409    | `{ "error": "USERNAME_ALREADY_EXISTS", "message": "El nombre de usuario ya está en uso" }` | Username tomado |
| 409    | `{ "error": "PROFILE_ALREADY_EXISTS", "message": "El perfil ya existe para este usuario" }` | UID ya tiene perfil |
| 500    | `{ "error": "INTERNAL_ERROR", "message": "Error interno del servidor" }`              | Falla interna |

### 3.2 `GET /api/auth/me` (privada)

Devuelve el perfil del usuario autenticado. Devuelve `404` cuando el
`uid` existe en Firebase Auth pero no tiene documento en Firestore —
caso típico del primer login con Google antes de llamar a `register`.

**Request**

```http
GET /api/auth/me
Authorization: Bearer <firebase_id_token>
```

**Responses**

| Status | Body                                                                                 | Caso |
|--------|--------------------------------------------------------------------------------------|------|
| 200    | `{ "user": User }`                                                                   | OK |
| 401    | `{ "error": "MISSING_TOKEN" \| "INVALID_TOKEN", "message": "..." }`                  | Token ausente o inválido |
| 404    | `{ "error": "PROFILE_NOT_FOUND", "message": "Perfil no encontrado" }`                | Tiene Auth, no tiene perfil |
| 500    | `{ "error": "INTERNAL_ERROR", "message": "Error interno del servidor" }`             | Falla interna |

### 3.3 `POST /api/auth/logout` (privada)

Revoca todos los refresh tokens del usuario y lo marca offline. Útil
para “cerrar sesión en todos los dispositivos”. Tras esta llamada,
cualquier ID Token previamente emitido será rechazado por `verifyToken`
porque el middleware usa `checkRevoked: true`.

**Responses**

| Status | Body  | Caso |
|--------|-------|------|
| 204    | —     | Sesión cerrada |
| 401    | `{ "error": "MISSING_TOKEN" \| "INVALID_TOKEN", "message": "..." }` | Token ausente/inválido |
| 500    | `{ "error": "INTERNAL_ERROR", "message": "Error interno del servidor" }` | Falla interna |

### 3.4 `GET /api/auth/check-username/:username` (pública)

Endpoint público para validación en tiempo real durante el formulario
de registro. **Política importante**: si el username contiene una
palabra prohibida, se reporta como `{ available: false }` —**no** como
error 400— para que el frontend pinte el mismo estado de “no disponible”
sin tener que conocer códigos nuevos. Si quieres distinguir “tomado”
de “prohibido”, usa `POST /register` que sí los diferencia.

**Responses**

| Status | Body                                            | Caso |
|--------|-------------------------------------------------|------|
| 200    | `{ "available": true }`                         | Libre |
| 200    | `{ "available": false }`                        | Tomado **o** prohibido |
| 400    | `{ "error": "USERNAME_INVALID", "message": "..." }` | Path param no cumple la regex |
| 500    | `{ "error": "INTERNAL_ERROR", "message": "..." }` | Falla interna |

### 3.5 `GET /api/auth/check-email/:email` (pública)

Endpoint público (nuevo en Sprint 1). Permite al frontend detectar
antes del signup si el correo ya tiene cuenta en Firebase Auth y
mostrar un mensaje claro (“Ese correo ya está registrado”) en vez del
genérico “error de conexión”.

Implementación: usa `admin.auth().getUserByEmail(email)`. Si Firebase
responde `auth/user-not-found`, devolvemos `available: true`.

**Responses**

| Status | Body                                            | Caso |
|--------|-------------------------------------------------|------|
| 200    | `{ "available": true }`                         | Correo libre |
| 200    | `{ "available": false }`                        | Correo ya registrado |
| 400    | `{ "error": "EMAIL_INVALID", "message": "Correo electrónico inválido" }` | Email mal formado |
| 500    | `{ "error": "INTERNAL_ERROR", "message": "..." }` | Falla interna |

### 3.6 “Login” como endpoint informativo

`/api/auth/login` aparece en Swagger marcado como `deprecated: true`
para evitar confusiones a quien lo busque, con una descripción que
aclara que el login vive 100 % en el cliente:

- **Email/Password:** `signInWithEmailAndPassword(auth, email, password)`.
- **Google:** `signInWithPopup(auth, new GoogleAuthProvider())`.

Tras cualquiera de los dos, el frontend llama a `GET /api/auth/me` con
el ID Token para resolver el flujo (dashboard si `200`, completar perfil
si `404`).

---

## 4. Respuestas del sistema

### 4.1 Forma estable de los errores

Todos los errores siguen la misma forma:

```json
{
  "error": "USERNAME_ALREADY_EXISTS",
  "message": "El nombre de usuario ya está en uso"
}
```

- `error` es un **código estable y legible por máquina**. El frontend
  toma decisiones con él (i18n, qué formulario mostrar, etc.).
- `message` es texto humano en español, apto para mostrar en un
  `role="alert"`. **Nunca** incluye stack, paths internos, mensaje
  original de Firebase ni detalle del proyecto Firebase.

> **Regla de oro:** el frontend nunca parsea `message` para tomar
> decisiones. Usa siempre `error`.

### 4.2 Catálogo completo de códigos

| Código                     | HTTP típico | Cuándo                                                                                       |
|----------------------------|-------------|----------------------------------------------------------------------------------------------|
| `MISSING_TOKEN`            | 401         | No vino header `Authorization` o no es `Bearer`.                                             |
| `INVALID_TOKEN`            | 401         | Token presente pero inválido, expirado o revocado.                                           |
| `MISSING_FIELDS`           | 400         | Falta un campo obligatorio en el body.                                                       |
| `USERNAME_INVALID`         | 400         | No cumple `^[a-zA-Z0-9_.]{4,10}$`.                                                           |
| `USERNAME_FORBIDDEN`       | 400         | Contiene palabra de la lista negra.                                                          |
| `PROVIDER_INVALID`         | 400         | `provider` no es `"password"` ni `"google"`.                                                 |
| `EMAIL_INVALID`            | 400         | Email con formato inválido (check-email).                                                    |
| `USERNAME_ALREADY_EXISTS`  | 409         | Username ya está usado por otro usuario.                                                     |
| `EMAIL_ALREADY_EXISTS`     | 409         | Correo ya está registrado (reservado para usos futuros del frontend).                        |
| `PROFILE_ALREADY_EXISTS`   | 409         | El UID ya tiene perfil en Firestore.                                                         |
| `PROFILE_NOT_FOUND`        | 404         | El UID está autenticado pero no tiene documento `users/{uid}`.                               |
| `INTERNAL_ERROR`           | 500         | Falla interna (Firestore, Firebase Admin, red, etc.). El detalle queda en logs.              |

### 4.3 Tipo TypeScript compartido con el frontend

```ts
export type ApiErrorCode =
  | "MISSING_TOKEN"
  | "INVALID_TOKEN"
  | "MISSING_FIELDS"
  | "USERNAME_INVALID"
  | "USERNAME_FORBIDDEN"
  | "PROVIDER_INVALID"
  | "EMAIL_INVALID"
  | "USERNAME_ALREADY_EXISTS"
  | "EMAIL_ALREADY_EXISTS"
  | "PROFILE_ALREADY_EXISTS"
  | "PROFILE_NOT_FOUND"
  | "INTERNAL_ERROR";

export interface ApiError {
  error: ApiErrorCode;
  message: string;
}
```

### 4.4 Manejo recomendado desde el frontend

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
    // 401 + INVALID_TOKEN → refresh y reintenta una vez
    if (res.status === 401 && err.error === "INVALID_TOKEN") {
      await auth.currentUser?.getIdToken(true);
      // reintento opcional
    }
    throw Object.assign(new Error(err.message), {
      code: err.error,
      status: res.status,
    });
  }
  return body as T;
}
```

---

## 5. Actividades realizadas

### 5.1 Configurar Swagger ✅

**Archivos tocados:**
- `backend/src/config/swagger.ts` — configuración global.
- `backend/src/routes/authRoutes.ts` — bloques `@openapi` por endpoint.

**Lo que se documentó:**

| Endpoint                                | Documentado en Swagger | Request | Response | Errores |
|-----------------------------------------|------------------------|---------|----------|---------|
| `POST /api/auth/register`               | ✅                      | ✅       | ✅        | ✅       |
| `GET /api/auth/me` (perfil usuario)     | ✅                      | ✅       | ✅        | ✅       |
| `POST /api/auth/logout`                 | ✅                      | ✅       | ✅        | ✅       |
| `GET /api/auth/check-username/:username`| ✅                      | ✅       | ✅        | ✅       |
| `GET /api/auth/check-email/:email`      | ✅                      | ✅       | ✅        | ✅       |
| `/api/auth/login` (informativo)         | ✅ (deprecated:true)    | —       | —        | —       |

**Esquemas globales declarados** en `components.schemas`:

- `User` — documento `users/{uid}` con todos sus campos.
- `RegisterRequest` — body de `register`.
- `AuthProvider` — enum `"password" | "google"`.
- `CheckResponse` — `{ available: boolean }` (compartido por
  check-username y check-email).
- `Error` — `{ error: ApiErrorCode, message: string }` con `enum` de
  todos los códigos.

**Responses reutilizables** en `components.responses`:

- `Unauthorized` — 401 con ejemplos de `MISSING_TOKEN` y `INVALID_TOKEN`.
- `InternalError` — 500 con ejemplo de `INTERNAL_ERROR`.

**Ejemplos por endpoint** (`examples:`):

- `register` — `passwordSignup` y `googleSignup` con bodies completos.
- `register` errores 400 — `usernameInvalid` vs `usernameForbidden`.
- `register` errores 409 — `usernameTaken` vs `profileExists`.
- `check-username` — `available` vs `takenOrForbidden`.
- `check-email` — `libre` vs `registrado`.

### 5.2 Documentar estructura Firestore ✅

**Archivo nuevo:** `backend/docs/firestore-model.md`.

Contenido:

1. Sección 1: Colección `users/`
   - Ruta del documento.
   - Tabla de campos (tipo, obligatoriedad, origen, descripción).
   - Ejemplo JSON.
   - Invariantes (campos derivados, unicidad, origen del email).
   - Índices (single-field automáticos + nota para los compuestos
     futuros).
   - Reglas de seguridad (`read`, `create`, `update`, `delete`).
2. Sección 2: Colección `rooms/` (placeholder Sprint 1).
3. Sección 3: Mapeo Firestore ↔ TypeScript.
4. Sección 4: Convención de timestamps.
5. Sección 5: Checklist a seguir al modificar el modelo.

**Cambio adicional en `firestore.rules`:** se actualizó el tamaño de
`username` de `>=3 && <=20` a `>=4 && <=10` para alinearlo con la
nueva regex del backend. Aunque el cliente nunca crea perfiles directos
(siempre vía API REST), la consistencia entre reglas y código
documentado evita confusiones futuras.

### 5.3 Documentación JSDoc ✅

JSDoc añadido (`@file`, `@param`, `@returns`, `@throws`,
descripciones de comportamiento) en:

**Controladores**
- `backend/src/controllers/authController.ts`
  - `sendError` — helper para enviar errores sin filtrar internos.
  - `register` — POST `/api/auth/register`.
  - `getMe` — GET `/api/auth/me`.
  - `logout` — POST `/api/auth/logout`.
  - `checkEmail` — GET `/api/auth/check-email/:email`.
  - `checkUsername` — GET `/api/auth/check-username/:username`.

**Middlewares**
- `backend/src/middlewares/authMiddleware.ts`
  - `AuthRequest` (interfaz tipada).
  - `verifyToken` (middleware Express).

**Servicios Firebase**
- `backend/src/services/authService.ts`
  - `registerUserProfile` — crea `users/{uid}` en transacción.
  - `isUsernameTaken` — query simple para `check-username`.
  - `getUserProfile` — lee `users/{uid}`.
  - `setUserOnlineStatus` — actualiza flag de presencia.
  - `revokeUserTokens` — logout server-side.
  - `isEmailRegistered` — lookup en Firebase Auth Admin.

**Validaciones**
- `backend/src/utils/profanity.ts`
  - `normalize` — normaliza para comparación.
  - `isProfane` — chequeo de blacklist.
- `backend/src/utils/errors.ts`
  - `ErrorCode`, `ErrorCodeValue`.
  - `DEFAULT_MESSAGES`.
  - `AppError` (clase).
  - `buildError` (helper).

**Configuración Firebase**
- `backend/src/config/firebase.ts`
  - `db` (Firestore handle).
  - `auth` (Auth Admin handle).

Ejemplo concreto del estilo aplicado:

```ts
/**
 * Crea el documento `users/{uid}` en Firestore tras un signup exitoso en
 * Firebase Auth.
 *
 * Concurrencia: usamos una **transacción** para que el chequeo de
 * `username` y la escritura del doc ocurran atómicamente. Si dos clientes
 * intentan registrar el mismo username a la vez, solo uno gana — el otro
 * recibe `USERNAME_ALREADY_EXISTS`.
 *
 * @param uid       Firebase UID extraído del ID Token verificado.
 * @param username  4-10 chars, único en la colección. Asume regex ya validada.
 * @param fullName  Nombre del usuario para mostrar.
 * @param email     Email del Firebase ID Token (no del body).
 * @param provider  `"password"` o `"google"`.
 * @param avatar    Ruta/URL del avatar (default `"default_avatar.png"`).
 * @returns El documento `User` recién creado.
 * @throws {AppError} `PROFILE_ALREADY_EXISTS` (409) si el uid ya tiene perfil.
 * @throws {AppError} `USERNAME_ALREADY_EXISTS` (409) si el username está tomado.
 */
export const registerUserProfile = async (...) => { ... };
```

El JSDoc se propaga al build de TypeScript: los archivos `.d.ts` en
`backend/dist/` conservan los bloques de documentación, lo que permite
que los consumidores del paquete (y editores como VS Code) vean la
ayuda inline en autocompletado.

### 5.4 Respuestas de error documentadas ✅

- Inventario completo en sección 4.2 de este documento.
- Replicado en el `enum` del esquema `Error` de Swagger.
- Replicado en `DEFAULT_MESSAGES` de `backend/src/utils/errors.ts`.
- Replicado en el tipo TS `ApiErrorCode` exportado en
  `backend/docs/contrato-frontend.md` para que el frontend lo copie tal cual.

Ejemplo de respuesta tipo, idéntico al pedido en los requisitos:

```json
{
  "error": "USERNAME_ALREADY_EXISTS",
  "message": "El nombre de usuario ya está en uso"
}
```

### 5.5 Mantener documentación actualizada ✅

Para que la documentación no se desincronice con el código a futuro, se
establecieron tres convenciones documentadas dentro del propio repo:

1. En `backend/docs/contrato-frontend.md` (encabezado):
   > **Cómo se actualiza este doc:** si cambia un endpoint, un código de
   > error o un payload, edita primero este archivo y luego sincroniza
   > Swagger (`src/config/swagger.ts`) y el modelo de datos
   > (`docs/firestore-model.md`).

2. En `backend/src/utils/errors.ts` (JSDoc del módulo):
   > Para agregar un código:
   > 1. Añádelo a `ErrorCode`.
   > 2. Añade su mensaje a `DEFAULT_MESSAGES`.
   > 3. Añádelo al enum `Error.error` de `src/config/swagger.ts`.
   > 4. Actualiza `docs/contrato-frontend.md`.

3. En `backend/docs/firestore-model.md`:
   > Checklist al modificar el modelo:
   > - Actualizar `src/models/*.ts` y los servicios que escriben/leen.
   > - Actualizar `firestore.rules`.
   > - Actualizar los esquemas Swagger.
   > - Actualizar `docs/contrato-frontend.md`.
   > - Agregar/actualizar tests en `tests/authService.test.ts`.

### 5.6 Validar documentación final ✅

| Punto a comprobar              | Estado | Cómo se verificó |
|--------------------------------|--------|------------------|
| Endpoints funcionales          | ✅      | `npx tsc --noEmit` sin errores. 44/44 tests verde (`npx jest`). |
| Ejemplos correctos             | ✅      | Spec inspeccionado: examples renderizan, schemas referenciados resuelven. |
| Rutas privadas documentadas    | ✅      | `register`, `me`, `logout` declaran `security: [{ bearerAuth: [] }]` y muestran candado en Swagger UI. |
| Errores definidos              | ✅      | 12 códigos en el enum del schema `Error`, replicados en JSDoc del enum `ErrorCode`. |
| Spec generado completo         | ✅      | Generado en memoria con swagger-jsdoc: 7 paths, 5 schemas, 2 responses compartidas. |

Salida abreviada del check del spec:

```
PATHS:
  /api/auth/check-email/{email}
  /api/auth/check-username/{username}
  /api/auth/login
  /api/auth/logout
  /api/auth/me
  /api/auth/register
  /health

SCHEMAS:
  AuthProvider, CheckResponse, Error, RegisterRequest, User

ERROR ENUM:
  MISSING_TOKEN, INVALID_TOKEN, MISSING_FIELDS, USERNAME_INVALID,
  USERNAME_FORBIDDEN, PROVIDER_INVALID, EMAIL_INVALID,
  USERNAME_ALREADY_EXISTS, EMAIL_ALREADY_EXISTS, PROFILE_ALREADY_EXISTS,
  PROFILE_NOT_FOUND, INTERNAL_ERROR

REGISTER STATUS CODES:    201, 400, 401, 409, 500
ME STATUS CODES:          200, 401, 404, 500
CHECK-EMAIL STATUS CODES: 200, 400, 500
```

---

## 6. Entregables

| Entregable                          | Estado | Evidencia / Ubicación |
|-------------------------------------|--------|-----------------------|
| Swagger operativo                   | ✅      | `GET /api/docs` (UI navegable) y `GET /api/docs.json` (OpenAPI 3 crudo). Config en `backend/src/config/swagger.ts` + anotaciones inline en `backend/src/routes/authRoutes.ts`. |
| Modelo Firestore documentado        | ✅      | `backend/docs/firestore-model.md` (nuevo). Reglas alineadas en `firestore.rules`. |
| JSDoc implementado                  | ✅      | Aplicado en controllers, middleware, services, validaciones y configuración Firebase. Propagado al build (`backend/dist/**/*.d.ts`). |
| Evidencia endpoints                 | ✅      | `npx tsc` limpio; 44/44 tests verde (`npx jest`); spec OpenAPI generado con 7 paths y 12 códigos de error. Checklist de verificación al final del contrato. |
| PR backend documentado              | ⏳      | Pendiente de abrir desde una rama dedicada cuando se autorice (los cambios están listos en el árbol de trabajo). |

---

## 7. Cómo navegar la documentación generada

| Quiero...                                | Voy a...                                                                |
|------------------------------------------|-------------------------------------------------------------------------|
| Probar endpoints en vivo                 | `npm run dev` y abrir `http://localhost:3000/api/docs`                  |
| Conectar el frontend                     | `backend/docs/contrato-frontend.md`                                     |
| Entender el modelo de datos              | `backend/docs/firestore-model.md`                                       |
| Ver el spec OpenAPI crudo (para Postman) | `http://localhost:3000/api/docs.json`                                   |
| Saber qué hace una función               | Hover en VS Code (los JSDoc están propagados al `.d.ts`)                |
| Agregar un código de error nuevo         | Seguir el bloque “Para agregar un código” en `backend/src/utils/errors.ts` |
| Modificar el esquema de Firestore        | Seguir el checklist final de `backend/docs/firestore-model.md`          |

---

## 8. Archivos modificados y nuevos

**Modificados**

- `backend/src/config/swagger.ts`
- `backend/src/config/firebase.ts`
- `backend/src/controllers/authController.ts`
- `backend/src/middlewares/authMiddleware.ts`
- `backend/src/services/authService.ts`
- `backend/src/routes/authRoutes.ts`
- `backend/src/utils/errors.ts`
- `backend/src/utils/profanity.ts`
- `backend/docs/contrato-frontend.md`
- `firestore.rules`

**Nuevos**

- `backend/docs/firestore-model.md`
- `backend/docs/sprint1-entrega-documentacion.md` (este documento)

---

## 9. Comandos para reproducir las validaciones

Desde `backend/`:

```bash
# Tipos
npx tsc --noEmit

# Tests
npx jest

# Build (genera dist/ con .d.ts conservando JSDoc)
npx tsc

# Levantar local (requiere .env con credenciales Firebase Admin)
npm run dev
# → http://localhost:3000/api/docs       (Swagger UI)
# → http://localhost:3000/api/docs.json  (spec crudo)
# → http://localhost:3000/health         (health check)
```
