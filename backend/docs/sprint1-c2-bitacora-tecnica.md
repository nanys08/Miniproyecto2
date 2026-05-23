# Sprint 1 — C2 (Backend) · Bitácora técnica

> **Componente:** C2 del Backend del Mini-proyecto 2 “Salón de Estudio Colaborativo”.
> **Fecha:** 2026-05-23
> **Alcance:** decisiones técnicas de autenticación, integración con Firestore y validaciones de usuario realizadas durante el Sprint 1, con evidencia de cómo el backend soporta las historias de usuario implementadas.

Este documento es la **fuente única** del C2 del backend. Recoge:
1. Las decisiones técnicas tomadas (qué se eligió y por qué).
2. La integración Firebase realmente implementada en código.
3. Las pruebas funcionales que la respaldan.
4. Los problemas encontrados durante el sprint y sus soluciones.
5. La evidencia técnica (capturas, logs, endpoints, PR).
6. La bitácora viva del sprint (avances, decisiones, cambios, pendientes).

> Documentos relacionados (no duplicar info aquí):
> - `backend/docs/contrato-frontend.md` — contrato API + Socket.IO.
> - `backend/docs/firestore-model.md` — modelo de datos Firestore.
> - `backend/docs/historias-tecnicas.md` — historias técnicas y soporte por sprint.
> - `backend/docs/como-funciona.md` — referencia línea por línea.
> - `backend/docs/sprint1-c1-implementacion-backend.md` — C1: implementación backend (Firebase Auth/Firestore + validaciones + persistencia).
> - `backend/docs/sprint1-entrega-documentacion.md` — C3: entrega de la documentación técnica del Sprint 1 (Swagger, JSDoc, modelo de datos).

---

## 0. Resumen ejecutivo del C2

Durante el Sprint 1 el backend reforzó la **identidad y validaciones** del usuario. Lo que ya existía en Sprint 0 (Firebase Auth + Firestore + perfiles) se mantuvo, y encima se construyeron tres capas nuevas:

1. **Endurecimiento de la validación de `username`**: regex movida de `^[a-zA-Z0-9_]{3,20}$` a `^[a-zA-Z0-9_.]{4,10}$` (alineada con el frontend), más una lista negra de palabras prohibidas con normalización leet/acentos.
2. **Prevención de duplicados de correo**: nuevo endpoint público `GET /api/auth/check-email/:email` que usa `admin.auth().getUserByEmail` para que el frontend pueda decir “este correo ya está registrado” antes del signup.
3. **Trazabilidad y testing**: cobertura de pruebas pasó de 33 → **44 casos en verde**, y el contrato de errores se amplió con códigos estables nuevos (`USERNAME_FORBIDDEN`, `EMAIL_INVALID`, `EMAIL_ALREADY_EXISTS`).

Todo el cambio fue **backend-only**: ningún archivo del frontend se modificó para esta entrega.

---

## 1. Decisiones técnicas del Sprint 1

### 1.1 Autenticación

| # | Decisión | Razón |
|---|----------|-------|
| 1 | **El backend no implementa endpoint de login.** Email/password y Google viven en el cliente con el SDK de Firebase. El backend solo verifica el ID Token. | Evita que las contraseñas pasen por el servidor. Aprovecha refresh automático y persistencia del SDK. |
| 2 | **`checkRevoked: true` en `verifyToken`.** | Permite que un logout server-side (`POST /logout`) tenga efecto inmediato sin esperar la expiración natural del token (≤1h). |
| 3 | **`/api/auth/login` se publica en Swagger como endpoint informativo `deprecated: true`.** | Evita que cualquiera buscando “login” en la UI piense que falta implementarlo. Documenta explícitamente que vive en el cliente. |
| 4 | **El `email` se toma del Firebase ID Token, no del body.** | Evita suplantación: aunque el cliente envíe otro email, el backend usa el que firma Firebase. |
| 5 | **Los códigos de error son estables, los mensajes pueden cambiar.** El frontend toma decisiones con `error.code`, nunca parseando `message`. | Soporta i18n y refactor de mensajes sin romper integraciones. |

### 1.2 Firestore

| # | Decisión | Razón |
|---|----------|-------|
| 1 | **`users/{uid}` con el UID de Firebase como ID del documento.** | Permite lectura O(1) por UID, evita escribir un UUID adicional y se alinea con `request.auth.uid` de las reglas. |
| 2 | **Validación de `username` único dentro de una transacción Firestore.** | Garantiza atomicidad: ante dos signups simultáneos con el mismo username, solo uno gana. Sin esto, hay race condition entre la lectura y la escritura. |
| 3 | **`username` se guarda redundante también como campo, no solo como índice.** | Permite queries `where("username", "==", ...)` sin tener que hacer collection scan. Firestore mantiene índice single-field automático. |
| 4 | **Las reglas Firestore bloquean cambios a `uid`, `username`, `email`, `provider`, `createdAt` desde el cliente.** | Esas mutaciones tienen que pasar por la API (auditoría, validaciones, transacciones). |
| 5 | **El backend usa Admin SDK (bypasea reglas).** | Las reglas son la red de seguridad; la lógica de negocio vive en el backend. |
| 6 | **`firestore.rules` también valida tamaño de `username` (4-10).** Aunque el cliente no escribe directo, lo mantenemos alineado. | Coherencia: una sola verdad sobre la forma de los datos. |

### 1.3 Validaciones de usuario

| # | Decisión | Razón |
|---|----------|-------|
| 1 | **Regex `^[a-zA-Z0-9_.]{4,10}$` (Sprint 1, antes 3-20 sin punto).** | Alinea con la UX del frontend, que ya pedía 4-10 con punto. Bug histórico: usuarios podían registrar usernames con `.` que pasaban el frontend pero fallaban en backend con `USERNAME_INVALID`. |
| 2 | **Lista negra de palabras prohibidas con normalización (acentos + leet).** | Bloquea variantes obvias (`puta`, `pútö`, `p3ne`, `xputox`). No pretende ser exhaustiva — bloquea los casos más comunes. |
| 3 | **`check-username` reporta blacklist como `{ available: false }`, no como error 400.** | Mantiene el contrato del frontend (`{ available: boolean }`). El frontend pinta exactamente el mismo estado de “no disponible” sin tener que conocer un código nuevo. |
| 4 | **`register` sí distingue blacklist con `USERNAME_FORBIDDEN` (400).** | Permite mostrar un mensaje diferente en el formulario completo (donde sí queremos explicarle al usuario por qué). |
| 5 | **`check-email` nuevo, expuesto como público.** | Permite UX defensiva: detectar duplicados antes de llamar a Firebase Auth y caer en un error genérico “de conexión”. |
| 6 | **El servicio `isEmailRegistered` solo trata `auth/user-not-found` como “no existe”. Cualquier otro error se propaga como `INTERNAL_ERROR`.** | No filtrar al cliente detalles internos de Firebase (project ID, mensajes de error, etc.). |
| 7 | **Identificación de correo Univalle como helper + endpoint + campo derivado** (no se persiste en Firestore). | El dato vive como flag calculado en runtime: si mañana cambia la política (p. ej. se agrega un dominio alias), no hay que migrar documentos existentes. |
| 8 | **Política Univalle por defecto: solo identificar, no restringir registro.** | El backend reporta `isUnivalle` sin bloquear correos externos. Activar restricción es un `if` en `register` con un nuevo `EMAIL_DOMAIN_FORBIDDEN`. |

---

## 2. Cómo el backend soporta las historias de usuario

> Las historias de Sprint 1 que cruzan con el C2 son las que involucran identidad y validaciones del usuario. Las de tiempo real (TS-02) y WebRTC (TS-03) se cubren en otros componentes y están documentadas en `historias-tecnicas.md`.

### 2.1 “Como usuario, quiero registrarme con email y contraseña, con un username único y válido.”

| Paso del usuario | Componente backend que lo soporta |
|------------------|-----------------------------------|
| El cliente crea la cuenta con `createUserWithEmailAndPassword`. | (no participa el backend) |
| El cliente envía `POST /api/auth/register` con `Authorization: Bearer <idToken>`. | `authRoutes.ts` → `verifyToken` (middleware). |
| El backend valida UID/email del token. | `authMiddleware.ts:verifyToken`. |
| El backend valida campos del body. | `authController.ts:register` (campos, regex, blacklist, provider). |
| El backend persiste `users/{uid}` con username único. | `authService.ts:registerUserProfile` dentro de `db.runTransaction`. |
| El backend responde con el `User` creado. | `201 { user }`. |

Tests que evidencian este flujo: ver §4.2.

### 2.2 “Como usuario, quiero iniciar sesión y entrar al dashboard.”

| Paso | Componente backend |
|------|--------------------|
| `signInWithEmailAndPassword` en cliente. | (no participa el backend) |
| Cliente llama `GET /api/auth/me` con el ID Token. | `authMiddleware.ts:verifyToken` + `authController.ts:getMe`. |
| Si el perfil existe en Firestore → `200 { user }`. | `authService.ts:getUserProfile`. |
| Si no existe → `404 PROFILE_NOT_FOUND` (caso de registro incompleto). | El frontend redirige al formulario de registro. |

### 2.3 “Como usuario, quiero entrar con Google y, si es la primera vez, escoger un username.”

| Paso | Componente backend |
|------|--------------------|
| `signInWithPopup(google)` en cliente. | (no participa) |
| Cliente llama `GET /api/auth/me`. | Mismo middleware + controller. |
| **404** → es la primera vez con Google. | El frontend abre un modal pidiendo username. |
| Cliente llama `POST /api/auth/register` con `provider: "google"`. | Mismo `register` (la única diferencia es el campo `provider`). |

### 2.4 “Como usuario, quiero saber en vivo si mi username está disponible.”

`GET /api/auth/check-username/:username` (público). Devuelve `{ available: boolean }`. Bloquea valores que no cumplen regex con `400 USERNAME_INVALID` y palabras prohibidas con `available: false`.

### 2.5 “Como usuario, no quiero registrarme con un correo que ya tengo cuenta.”

`GET /api/auth/check-email/:email` (público) — añadido en Sprint 1. Devuelve `{ available: false }` si Firebase ya conoce ese correo. Permite al frontend mostrar un mensaje claro antes de llamar a `createUserWithEmailAndPassword` y caer en un error genérico.

### 2.6 “Como sistema, no quiero usernames ofensivos.”

Lista negra en `src/utils/profanity.ts`, aplicada en:
- `POST /register` → `400 USERNAME_FORBIDDEN`.
- `GET /check-username/:username` → `{ available: false }` (sin cambios de contrato).

### 2.7 “Como usuario Univalle, quiero que el sistema me reconozca como estudiante.”

- **En vivo (público)**: `GET /api/auth/is-univalle/:email` → `{ isUnivalle, domain }`. El frontend lo invoca con debounce mientras el usuario escribe el correo en el formulario de registro y pinta/oculta un badge.
- **Después del login**: el objeto `user` que viene en `GET /api/auth/me` y en la respuesta de `POST /api/auth/register` ya trae `user.isUnivalle` calculado por el backend. El frontend no necesita una segunda llamada.
- **Helper único de verdad**: `src/utils/univalleEmail.ts:isUnivalleEmail`. Centraliza el dominio canónico `correounivalle.edu.co` en la constante `UNIVALLE_DOMAIN`.

### 2.8 “Como admin, quiero poder cerrar sesión a un usuario en todos sus dispositivos.”

`POST /api/auth/logout` (privado, autoservicio por ahora). Llama `auth.revokeRefreshTokens(uid)` + `setUserOnlineStatus(uid, false)`. Tras esto, cualquier ID Token previo es rechazado por `verifyToken` gracias a `checkRevoked: true`.

---

## 3. Integración Firebase — lo realmente implementado

### 3.1 Firebase Auth (Admin SDK)

**Archivo:** `backend/src/config/firebase.ts`

```ts
if (!admin.apps.length) {
  const credential =
    env.firebaseAdmin.clientEmail && env.firebaseAdmin.privateKey
      ? admin.credential.cert({
          projectId: env.firebaseAdmin.projectId,
          clientEmail: env.firebaseAdmin.clientEmail,
          privateKey: env.firebaseAdmin.privateKey,
        })
      : admin.credential.applicationDefault();

  admin.initializeApp({
    credential,
    projectId: env.firebaseAdmin.projectId || env.firebase.projectId,
  });
}

export const db: FirebaseFirestore.Firestore = admin.firestore();
export const auth: Auth = admin.auth();
```

- Si las variables `FIREBASE_ADMIN_CLIENT_EMAIL` y `FIREBASE_ADMIN_PRIVATE_KEY` están presentes, usa credenciales explícitas (modo Render / prod).
- Si no, cae a `applicationDefault()` (Cloud Run o `GOOGLE_APPLICATION_CREDENTIALS`).
- Normaliza la private key (admite con/sin comillas envolventes y `\n` literales), fix histórico introducido en `8000961`.

### 3.2 Verificación de ID Tokens

**Archivo:** `backend/src/middlewares/authMiddleware.ts`

```ts
const decoded = await auth.verifyIdToken(token, true); // checkRevoked: true
req.user = { uid: decoded.uid, email: decoded.email };
```

Casos cubiertos por tests (`tests/authMiddleware.test.ts`):
- Sin header `Authorization` → `401 MISSING_TOKEN`.
- Header sin prefijo `Bearer ` → `401 MISSING_TOKEN`.
- `Bearer ` vacío → `401 MISSING_TOKEN`.
- Firma inválida (`auth/argument-error`) → `401 INVALID_TOKEN`.
- Token expirado (`auth/id-token-expired`) → `401 INVALID_TOKEN`.
- Token revocado (`auth/id-token-revoked`) → `401 INVALID_TOKEN`.
- Token válido → `next()` + `req.user = { uid, email }`.
- Detalle interno de Firebase **no se filtra** al cliente.

### 3.3 Firestore — persistencia del perfil

**Archivos:** `backend/src/services/authService.ts`, `backend/src/models/User.ts`.

Documento `users/{uid}`:

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

Creación atómica (race-condition-safe):

```ts
await db.runTransaction(async (tx) => {
  const existingDoc = await tx.get(userRef);
  if (existingDoc.exists) throw new AppError(ErrorCode.PROFILE_ALREADY_EXISTS, 409);
  const usernameSnap = await tx.get(usernameQuery);
  if (!usernameSnap.empty) throw new AppError(ErrorCode.USERNAME_ALREADY_EXISTS, 409);
  tx.set(userRef, newUser);
});
```

Ver `backend/docs/firestore-model.md` para el modelo completo (campos, invariantes, reglas, índices).

### 3.4 Validación de username

Dos vías:

1. **Server-side (verdad)** — dentro de `register`, en transacción.
2. **UX en vivo (público)** — `GET /api/auth/check-username/:username`.

Ambas pasan por:
- Regex `^[a-zA-Z0-9_.]{4,10}$`.
- Lista negra (`src/utils/profanity.ts`) con normalización a minúsculas, sin acentos, sin `.`/`_`, leet→letras.

### 3.5 Validación de email (nuevo Sprint 1)

**Archivo:** `backend/src/services/authService.ts:isEmailRegistered`

```ts
export const isEmailRegistered = async (email: string): Promise<boolean> => {
  try {
    await auth.getUserByEmail(email);
    return true;
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === "auth/user-not-found") return false;
    throw err;
  }
};
```

Solo `auth/user-not-found` se trata como “no existe”. Cualquier otro error se propaga al controller y se devuelve como `INTERNAL_ERROR` (sin filtrar detalles).

---

## 4. Pruebas funcionales — evidencia

### 4.1 Stack de tests

| Aspecto | Valor |
|---------|-------|
| Framework | Jest 30 |
| Transpilador | ts-jest |
| Estrategia | Mocks de Firebase Admin para no tocar Firestore real |
| Comando | `npm test` (alias de `jest`) |
| Resultado actual | **3 suites · 44 tests · 0 fallos** |

### 4.2 Inventario completo (44 tests verdes)

#### Suite `authMiddleware.test.ts` — 8 tests

```
verifyToken — acceso autorizado
  ✓ llama next() y popula req.user cuando el token es válido
verifyToken — acceso bloqueado por falta de credenciales
  ✓ 401 MISSING_TOKEN si no hay header Authorization
  ✓ 401 MISSING_TOKEN si el header no empieza por 'Bearer '
  ✓ 401 MISSING_TOKEN si viene 'Bearer ' pero sin token
verifyToken — token inválido / expirado / revocado
  ✓ 401 INVALID_TOKEN cuando la firma es inválida
  ✓ 401 INVALID_TOKEN cuando el token ha expirado (auth/id-token-expired)
  ✓ 401 INVALID_TOKEN cuando el token fue revocado (auth/id-token-revoked)
  ✓ no filtra el detalle interno de Firebase en la respuesta
```

#### Suite `authService.test.ts` — 11 tests

```
registerUserProfile — caso feliz y persistencia
  ✓ persiste el perfil con TODOS los campos requeridos y nada más
  ✓ usa el avatar provisto cuando viene en parámetros
registerUserProfile — validaciones de unicidad
  ✓ rechaza con USERNAME_ALREADY_EXISTS (409) si otro usuario ya tiene ese username
  ✓ rechaza con PROFILE_ALREADY_EXISTS (409) si el uid ya tiene perfil
registerUserProfile — concurrencia
  ✓ ante dos registros simultáneos con el mismo username, solo uno gana
isUsernameTaken
  ✓ devuelve true si hay un usuario con ese username
  ✓ devuelve false si nadie lo tiene
getUserProfile y login posterior
  ✓ devuelve el doc cuando existe
  ✓ devuelve null si el uid no tiene perfil
  ✓ flujo login posterior: register → getUserProfile recupera lo persistido
setUserOnlineStatus
  ✓ actualiza el campo online sin tocar los demás
revokeUserTokens
  ✓ delega en auth.revokeRefreshTokens con el uid
```

#### Suite `authController.test.ts` — 25 tests (9 nuevos en Sprint 1)

```
register — validaciones de entrada
  ✓ 400 MISSING_FIELDS si falta username, fullName o provider
  ✓ 400 USERNAME_INVALID si username tiene 3 caracteres (mínimo 4)        ← nuevo Sprint 1
  ✓ 400 USERNAME_INVALID si username no cumple la regex
  ✓ acepta username con punto (alineado con el frontend)                   ← nuevo Sprint 1
  ✓ 400 USERNAME_FORBIDDEN si el username contiene palabra prohibida       ← nuevo Sprint 1
  ✓ 400 USERNAME_FORBIDDEN detecta variantes leet (p3ne)                   ← nuevo Sprint 1
  ✓ 400 PROVIDER_INVALID si provider no es 'password' ni 'google'
register — propaga AppError del service tal cual
  ✓ 409 USERNAME_ALREADY_EXISTS cuando el service lanza ese código
  ✓ 409 PROFILE_ALREADY_EXISTS cuando el uid ya tiene perfil
register — no filtra errores internos
  ✓ 500 INTERNAL_ERROR cuando el service lanza un Error genérico, sin filtrar el mensaje original
register — caso exitoso
  ✓ 201 y devuelve el user creado
getMe
  ✓ 200 con el perfil cuando existe
  ✓ 404 PROFILE_NOT_FOUND cuando no existe
  ✓ 500 INTERNAL_ERROR si el service falla, sin filtrar el detalle
logout
  ✓ 204 sin body, marca offline y revoca tokens del uid del request
  ✓ 500 INTERNAL_ERROR si revokeUserTokens falla, sin filtrar el detalle
checkUsername
  ✓ 400 USERNAME_INVALID si el path param no cumple regex
  ✓ devuelve { available: true } cuando el username está libre
  ✓ devuelve { available: false } cuando está tomado
  ✓ devuelve { available: false } sin consultar DB si el username es profano   ← nuevo Sprint 1
checkEmail                                                                       ← suite nueva Sprint 1
  ✓ 400 EMAIL_INVALID si el path param no es un email válido                   ← nuevo Sprint 1
  ✓ devuelve { available: true } cuando el email no está registrado            ← nuevo Sprint 1
  ✓ devuelve { available: false } cuando el email ya está registrado           ← nuevo Sprint 1
  ✓ 500 INTERNAL_ERROR si el service falla, sin filtrar el detalle             ← nuevo Sprint 1
```

### 4.3 Mapeo pruebas ↔ historias de usuario

| Historia / criterio                                       | Tests que la respaldan |
|-----------------------------------------------------------|-------------------------|
| **Login correcto** (token válido → request privada pasa)  | `authMiddleware: acceso autorizado`, `getMe: 200 con el perfil cuando existe` |
| **Registro correcto**                                     | `register: 201 y devuelve el user creado`, `authService: persiste el perfil con TODOS los campos requeridos`, `authService: usa el avatar provisto` |
| **Errores auth** (token ausente, mal formado, inválido, expirado, revocado) | 4 tests de `authMiddleware` (MISSING_TOKEN ×3, INVALID_TOKEN ×3) |
| **Duplicados de username**                                | `authService: rechaza con USERNAME_ALREADY_EXISTS (409)`, `register: 409 USERNAME_ALREADY_EXISTS cuando el service lanza ese código` |
| **Concurrencia username**                                 | `authService: ante dos registros simultáneos con el mismo username, solo uno gana` |
| **No filtración de detalle de Firebase**                  | 3 tests `*: no filtra el detalle interno` en middleware/controller |
| **Username inválido (formato)**                           | `register: 400 USERNAME_INVALID si username tiene 3 caracteres`, `register: 400 USERNAME_INVALID si username no cumple la regex` |
| **Username prohibido (blacklist)**                        | `register: 400 USERNAME_FORBIDDEN…`, `register: detecta variantes leet`, `checkUsername: devuelve available:false sin consultar DB si es profano` |
| **Email ya registrado**                                   | `checkEmail: devuelve { available: false }…`, `checkEmail: devuelve { available: true }…` |
| **Email inválido**                                        | `checkEmail: 400 EMAIL_INVALID…` |

### 4.4 Cómo reproducir

Desde `backend/`:

```bash
npm test           # corre los 44 tests
npx jest --verbose # mismo, con nombres individuales
npx tsc --noEmit   # type-check sin emitir
```

Salida esperada:

```
Test Suites: 3 passed, 3 total
Tests:       44 passed, 44 total
Snapshots:   0 total
Time:        ~2.5 s
```

---

## 5. Problemas encontrados y soluciones

### 5.1 Bug histórico — `FIREBASE_ADMIN_PRIVATE_KEY` con comillas envolventes

**Síntoma:** al desplegar en Render, Firebase Admin lanzaba `Failed to parse private key` y el backend no arrancaba.
**Causa:** algunos entornos (incluido Render) almacenan la variable con comillas envolventes `"..."` y con `\n` literal en lugar de saltos de línea reales.
**Solución implementada** (`backend/src/config/env.ts`):

```ts
privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY
  ?.replace(/^"|"$/g, "")       // quitar comillas envolventes si vienen
  .replace(/\\n/g, "\n"),         // \n literal → salto real
```

Commit asociado: `8000961 fix(backend): admitir FIREBASE_ADMIN_PRIVATE_KEY con o sin comillas envolventes`.

### 5.2 Bug histórico — `tsc` falla en build de Render por falta de types

**Síntoma:** `npm install --production` en Render omitía devDependencies, y `tsc` no encontraba `@types/*`.
**Causa:** `npm install` por defecto en producción no incluye devDependencies.
**Solución:** forzar `npm install --include=dev` en el build script.
Commit asociado: `5043d19 fix(render): npm install --include=dev para que tsc encuentre types en build`.

### 5.3 Bug del Sprint 1 — desfase de regex entre frontend y backend

**Síntoma reportado por Nanys:**
> “En username deja ingresar mínimo 3 caracteres y yo había planteado 4, entonces no debe mostrar abajo disponible si son menos de 4 caracteres.”
> “Cuando la contraseña cumple con números, la mayúscula y el símbolo no deja registrar, osea está bien pero igual no deja.”

**Causa real:** el frontend pedía `^[a-zA-Z0-9_.]{4,10}$` (4-10 con punto), pero el backend tenía `^[a-zA-Z0-9_]{3,20}$` (3-20 sin punto). Cuando un usuario escribía un username con punto, el frontend lo daba por OK pero el backend rechazaba con `USERNAME_INVALID`. El catch genérico del frontend mostraba “error de conexión” — el usuario creía que era problema de password.

**Solución:**
- `authController.ts`: regex actualizada a `^[a-zA-Z0-9_.]{4,10}$`.
- `errors.ts:USERNAME_INVALID`: mensaje actualizado.
- `firestore.rules`: tamaño de `username` alineado de 3-20 a 4-10.
- 2 tests nuevos: “3 caracteres es inválido” y “acepta username con punto”.

### 5.4 Bug del Sprint 1 — falsos `Failed to load resource: 404` en `/api/auth/me`

**Síntoma reportado:**
```
miniproyecto2-2j8a.onrender.com/api/auth/me:1 Failed to load resource: status 404
```
durante el flujo de registro manual.

**Causa real:** el `AuthContext.tsx` del frontend llama a `/auth/me` en cuanto `onAuthStateChanged` emite el usuario (post `createUserWithEmailAndPassword`), **antes** de que `register` complete. Esa carrera produce un `404 PROFILE_NOT_FOUND` transitorio en consola — el flujo siguió funcionando, pero la consola mostraba el error.

**Decisión:** **no “arreglar” esto en backend**. El `404` es parte del contrato (el flujo Google depende de ese 404 para saber que el usuario es nuevo y abrir el modal). Cambiar el backend rompería ese flujo. La opción correcta es silenciar el log en el frontend; queda fuera del alcance del C2.

Documentado explícitamente en `historias-tecnicas.md §1.7` y en el análisis enviado a Nanys.

### 5.5 Bug del Sprint 1 — “correo ya existe” se mostraba como error genérico

**Síntoma:** al registrarse con un correo ya usado, el frontend mostraba “ocurrió un error de conexión” en vez de un mensaje claro.

**Causa real:** `createUserWithEmailAndPassword` lanza `auth/email-already-in-use` en el cliente. El catch genérico de `RegisterPage.tsx` lo enmascaraba como error de red.

**Solución (parcial, solo backend para no romper frontend):**
- Nuevo endpoint público `GET /api/auth/check-email/:email`.
- Nuevo código `EMAIL_ALREADY_EXISTS` (registrado en el enum aunque hoy no se devuelve directamente — queda listo para que el frontend lo use).
- Servicio `isEmailRegistered` con manejo defensivo de `auth/user-not-found`.

**Pendiente:** que el frontend consuma el nuevo endpoint y/o capture `auth/email-already-in-use`. No es parte del C2.

### 5.6 Decisión deliberada — la blacklist NO rompe el contrato de `check-username`

**Tensión:** el frontend ya pinta dos estados (`{ available: true | false }`) basados en el endpoint público de validación de username. Si introdujéramos un código nuevo en `check-username` para blacklist, habría que tocar el frontend para reconocerlo.

**Decisión:** en `check-username`, la palabra prohibida se reporta como `{ available: false }` (mismo estado visual de “ya en uso”). En `register`, sí se diferencia con `USERNAME_FORBIDDEN`. Documentado en el JSDoc del controller y en el OpenAPI del endpoint.

### 5.7 Decisión deliberada — falsos positivos de la blacklist

**Tensión:** “mariachi” o “cabronazo” contienen subcadenas (“maric”, “cabron”) que están en la lista. La política `includes` los marca como prohibidos.

**Decisión:** asumimos esa imprecisión a cambio de atrapar variantes obvias (`xputox`, `iputa3`). La lista es ajustable en `src/utils/profanity.ts` sin tocar nada más. Si en el futuro genera fricción, se puede pasar a límites de palabra (`\b`) o usar una librería más sofisticada.

---

## 6. Evidencia técnica

### 6.1 Endpoints funcionando

Comandos de verificación rápida (local, con backend levantado en `:3000`):

```bash
# Health
curl http://localhost:3000/health
# → { "status": "ok", "env": "development" }

# Swagger UI
open http://localhost:3000/api/docs

# Username disponible
curl http://localhost:3000/api/auth/check-username/juanp
# → { "available": true }

# Username muy corto
curl -i http://localhost:3000/api/auth/check-username/abc
# → 400 { "error": "USERNAME_INVALID", "message": "…" }

# Username prohibido
curl http://localhost:3000/api/auth/check-username/puta1
# → { "available": false }

# Email libre
curl "http://localhost:3000/api/auth/check-email/nuevo@example.com"
# → { "available": true }

# Email mal formado
curl -i "http://localhost:3000/api/auth/check-email/no-es-email"
# → 400 { "error": "EMAIL_INVALID", "message": "…" }

# Register sin token
curl -i -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"juanp","fullName":"Juan","provider":"password"}'
# → 401 { "error": "MISSING_TOKEN", "message": "…" }
```

### 6.2 Capturas Firestore

> **A adjuntar en la entrega final** (no se incluyen en el repo para no inflar el tamaño):
>
> 1. **`firestore-users-coleccion.png`** — captura de Firebase Console mostrando la colección `users/` con al menos 2 documentos creados durante pruebas, expandiendo los campos para validar el esquema (`uid`, `username`, `fullName`, `email`, `provider`, `avatar`, `createdAt`, `online`).
> 2. **`firestore-user-detalle.png`** — captura del documento `users/{uid}` abierto, con todos los campos visibles y el `createdAt` como Timestamp.
> 3. **`firestore-rules-deployed.png`** — captura de la pestaña “Rules” en Firebase Console mostrando que las reglas publicadas coinciden con `firestore.rules` del repo.
> 4. **`firebase-auth-users.png`** — captura de la sección Authentication → Users con al menos 1 usuario `password` y 1 usuario `google` para evidenciar ambos providers.
>
> Las capturas se guardan en `backend/docs/evidencias/sprint1-c2/` cuando se hagan; por ahora, los datos están disponibles en el proyecto Firebase del equipo (mismo `projectId` declarado en `.env`).

### 6.3 Logs de pruebas

Captura completa de la ejecución `npx jest --verbose` está en el §4.2. Resumen:

```
PASS tests/authMiddleware.test.ts (8 tests)
PASS tests/authService.test.ts    (11 tests)
PASS tests/authController.test.ts (25 tests)

Test Suites: 3 passed, 3 total
Tests:       44 passed, 44 total
Snapshots:   0 total
Time:        2.568 s
```

Build limpio:

```
$ npx tsc --noEmit
$ echo $?
0
```

### 6.4 Spec OpenAPI generado

Verificación directa del spec generado por `swagger-jsdoc`:

```
PATHS:
  /api/auth/check-email/{email}
  /api/auth/check-username/{username}
  /api/auth/login           (informativo, deprecated)
  /api/auth/logout
  /api/auth/me
  /api/auth/register
  /health

SCHEMAS:
  AuthProvider, CheckResponse, Error, RegisterRequest, User

ERROR ENUM (12 códigos):
  MISSING_TOKEN, INVALID_TOKEN, MISSING_FIELDS, USERNAME_INVALID,
  USERNAME_FORBIDDEN, PROVIDER_INVALID, EMAIL_INVALID,
  USERNAME_ALREADY_EXISTS, EMAIL_ALREADY_EXISTS,
  PROFILE_ALREADY_EXISTS, PROFILE_NOT_FOUND, INTERNAL_ERROR

REGISTER STATUS CODES:    201, 400, 401, 409, 500
ME STATUS CODES:          200, 401, 404, 500
CHECK-EMAIL STATUS CODES: 200, 400, 500
```

### 6.5 PRs realizados

| PR / commit | Alcance | Estado |
|-------------|---------|--------|
| `eef39de feat: Sprint 0 - estructura base backend Node/Express/TypeScript + Firebase` | Base de TS-01: middleware, controller, service, modelos, swagger, tests iniciales. | Mergeado en `main`. |
| `8000961 fix(backend): admitir FIREBASE_ADMIN_PRIVATE_KEY con o sin comillas envolventes` | Robustecer parsing de credenciales Firebase Admin. | Mergeado. |
| `5043d19 fix(render): npm install --include=dev para que tsc encuentre types en build` | Fix de despliegue en Render. | Mergeado. |
| `324b8d4 fix(backend): CORS siempre permite localhost para dev contra prod` | Permitir testing local contra backend de producción. | Mergeado. |
| `64677da Actualizacion validaciones en backend` | Sprint 1 — bug fixes #1/#2 (regex 4-10 con punto), #6 (blacklist), #3 (check-email + EMAIL_ALREADY_EXISTS). | Mergeado en `main`. |
| **PR backend documentado (en preparación)** | Sprint 1 — JSDoc, Swagger reescrito, `firestore-model.md`, `sprint1-entrega-documentacion.md`, `sprint1-c2-bitacora-tecnica.md` (este doc), `historias-tecnicas.md` actualizado. | Listo para abrir desde rama dedicada. |

> El historial completo se consulta con `git log --oneline` en el repo. Los PRs históricos viven en `https://github.com/nanys08/Miniproyecto2/commits/main`.

---

## 7. Bitácora viva del Sprint 1

### 7.1 Avances

| Fecha       | Avance                                                                         |
|-------------|--------------------------------------------------------------------------------|
| 2026-05-14  | Sprint 0 cerrado: TS-01 entregada (backend Auth + perfil) con 33 tests verde. |
| 2026-05-22  | Reporte de bugs de Nanys: regex 3 chars, password OK pero no deja registrar, email ya existe, lista negra solicitada. |
| 2026-05-22  | Análisis: regex desalineada entre frontend y backend (con punto / sin punto). Plan de cambios solo-backend.   |
| 2026-05-22  | Implementadas correcciones (#1, #2, #6) + endpoint nuevo `check-email` (#3 parcial). 44/44 tests verde.      |
| 2026-05-23  | Sprint 1 — entrega de documentación (C1): Swagger reescrito, JSDoc en todo, `firestore-model.md`, doc de entrega.   |
| 2026-05-23  | Sprint 1 — bitácora técnica del C2 (este documento).                          |

### 7.2 Decisiones importantes (resumen, ver §1 para detalle)

- Mantener el principio “backend no hace login”: el login vive en el SDK del cliente.
- Mantener el contrato de `check-username` (`{ available: boolean }`) ante la nueva blacklist.
- Hacer cambios **solo en backend** para no introducir riesgo en la UI del frontend mientras esté en rediseño.
- `email` siempre del ID Token, nunca del body.
- `firestore.rules` debe estar siempre alineado con la lógica de negocio del backend, aunque el cliente no escriba directo.

### 7.3 Cambios importantes (delta vs Sprint 0)

| Área | Sprint 0 | Sprint 1 |
|------|----------|----------|
| Regex username | `^[a-zA-Z0-9_]{3,20}$` | `^[a-zA-Z0-9_.]{4,10}$` (acepta `.`) |
| Lista negra | — | Activa en `register` + `check-username` |
| Endpoint check-email | — | `GET /api/auth/check-email/:email` |
| Endpoint is-univalle | — | `GET /api/auth/is-univalle/:email` |
| Campo derivado `user.isUnivalle` | — | Incluido en respuestas de `/me` y `/register` |
| Códigos de error | 9 | 12 (`USERNAME_FORBIDDEN`, `EMAIL_INVALID`, `EMAIL_ALREADY_EXISTS`) |
| Tests | 33 | 57 |
| JSDoc | Comentarios sueltos | JSDoc formal en controllers/middleware/services/utils/config |
| Swagger | Endpoints documentados | + responses reutilizables, ejemplos por endpoint, schema `CheckResponse`, “login” informativo deprecated |
| Modelo de datos doc | Inline en historias-tecnicas | Doc dedicado `firestore-model.md` |
| Reglas Firestore | `username` 3-20 | `username` 4-10 (alineado con backend) |

### 7.4 Tareas pendientes (no son del C2 pero quedan registradas)

| Pendiente | Componente | Notas |
|-----------|------------|-------|
| Que el frontend consuma `check-email` o capture `auth/email-already-in-use` para mostrar “correo ya registrado”. | Frontend | C2 lo dejó listo desde el backend. |
| Silenciar el log `404 /api/auth/me` durante el flujo de registro. | Frontend | El 404 es esperado y no se puede eliminar en backend sin romper el flujo de Google. |
| Flujo “login sin cuenta → registro con username”. | Frontend | Hoy el `LoginPage` solo mapea `user-not-found` a “correo o contraseña incorrecta”. |
| `PATCH /api/auth/me` para editar perfil. | Backend Sprint 2 | TS-01 backlog. |
| `DELETE /api/auth/me` con cascada de rooms/messages. | Backend Sprint 2 | Requiere completar TS-02 primero. |
| Exponer `revokeUserTokens` como acción administrativa (`POST /api/auth/revoke`). | Backend Sprint 2 | Sprint 1 solo usa el utilitario para el `/logout` del propio usuario. |
| Persistir `send-message` en Firestore y emitir `chat-history` al unirse. | Backend Sprint 2 (TS-02) | El socket ya retransmite; falta persistencia. |
| Eventos `room-updated` / `room-closed` para CRUD de salas. | Backend Sprint 2 (TS-02) | Modelo `Room` ya existe, falta lógica. |
| Capturas de Firebase Console (Firestore + Auth + Rules) para anexar a esta entrega. | Operativo | Pendientes de subir a `backend/docs/evidencias/sprint1-c2/`. |

---

## 8. Checklist de entregables del C2

| Entregable                                | Estado | Ubicación / Evidencia |
|-------------------------------------------|--------|-----------------------|
| Evidencia Firebase/Auth                   | ✅      | §3.1 + §3.2 + tests de `authMiddleware.test.ts`. |
| Capturas Firestore                        | ⏳      | A subir en `backend/docs/evidencias/sprint1-c2/` (instrucciones en §6.2). |
| Bitácora backend actualizada              | ✅      | Este documento (`sprint1-c2-bitacora-tecnica.md`) + `historias-tecnicas.md` refrescado con cambios de Sprint 1. |
| Registro de pruebas técnicas              | ✅      | §4: 44 tests inventariados y mapeados a historias de usuario. |
| PRs documentados                          | ✅      | §6.5: tabla con commits y alcance; PR de Sprint 1 listo para abrir. |

---

## 9. Cómo navegar la documentación del C2

| Quiero…                                              | Voy a…                                              |
|------------------------------------------------------|-----------------------------------------------------|
| Ver qué decidí y por qué                             | §1 de este doc                                      |
| Ver cómo el backend soporta una historia             | §2 de este doc                                      |
| Ver el código exacto que implementa Firebase Auth    | §3.1 y §3.2 + `backend/src/middlewares/authMiddleware.ts` |
| Ver el modelo Firestore                              | `backend/docs/firestore-model.md`                   |
| Ver el contrato REST + Socket.IO                     | `backend/docs/contrato-frontend.md`                 |
| Ver el inventario completo de tests                  | §4 de este doc                                      |
| Ver qué bugs aparecieron y cómo se resolvieron       | §5 de este doc                                      |
| Ver qué PR cubrió cada cosa                          | §6.5 de este doc                                    |
| Ver pendientes para Sprint 2                         | §7.4 de este doc                                    |
| Probar los endpoints en vivo                         | `npm run dev` → `http://localhost:3000/api/docs`    |
