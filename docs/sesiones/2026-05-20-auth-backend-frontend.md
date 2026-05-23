# Sesión 2026-05-20 / 21 — Auth backend completo + integración frontend

Registro de las decisiones y cambios hechos en esta sesión de trabajo sobre TS-01 (autenticación), con apuntes para que cualquiera pueda retomar el contexto.

## Contexto inicial

- Backend Sprint 0 ya existía con `/api/auth/register`, `/api/auth/me`, `/api/auth/check-username` pero **sin** `fullName`, `provider`, ni reglas Firestore, ni códigos de error estables.
- Frontend funcionaba pero su `register` mandaba solo `{username}` (con el `fullName` puesto en el campo username por confusión).
- Backend desplegado en `https://miniproyecto2-2j8a.onrender.com`, frontend en `https://miniproyecto2-three.vercel.app`.

## Fase 1 — Modelo y validaciones

- Agregados campos `fullName` y `provider: 'password' | 'google'` al modelo `User` (`backend/src/models/User.ts`).
- `authService.registerUserProfile` ahora valida que no exista perfil previo para el `uid` y rechaza con error explícito.
- `authController.register` valida regex `^[a-zA-Z0-9_]{3,20}$` para `username` y enum para `provider`.
- Mapeo: 400 para malformados, 409 para conflictos (username/perfil duplicado).
- Schema Swagger actualizado.

## Fase 2 — Reglas Firestore

- Creado `firestore.rules` en la raíz: solo el dueño del UID puede crear/actualizar su `users/{uid}`, campos sensibles (`uid/username/email/provider/createdAt`) inmutables desde el cliente, default-deny para todo lo demás.
- Despliegue queda como paso manual: `firebase deploy --only firestore:rules`.

## Fase 3 — Códigos de error estables (decisión clave)

- Creado `backend/src/utils/errors.ts` con enum `ErrorCode` (9 códigos), clase `AppError(code, status, message?)`, y shape uniforme `{ error: CODE, message: "..." }`.
- Códigos: `MISSING_TOKEN`, `INVALID_TOKEN`, `MISSING_FIELDS`, `USERNAME_INVALID`, `PROVIDER_INVALID`, `USERNAME_ALREADY_EXISTS`, `PROFILE_ALREADY_EXISTS`, `PROFILE_NOT_FOUND`, `INTERNAL_ERROR`.
- Helper `sendError` en el controller: cualquier error que NO sea `AppError` se loggea internamente y al cliente solo le llega `INTERNAL_ERROR`. **Garantía de no-leak** de mensajes internos de Firebase.

## Fase 4 — Concurrencia real en registro

- `registerUserProfile` reescrito con `db.runTransaction`: lee `users/{uid}` y la query de username **atómicamente** y escribe. Si dos clientes piden el mismo username a la vez, gana uno y el otro recibe `USERNAME_ALREADY_EXISTS`.
- Test específico con `Promise.allSettled` que verifica el at-most-one-winner.

## Fase 5 — Validación de sesión

- `verifyToken` ahora pasa `checkRevoked: true` a `auth.verifyIdToken`. Esto hace que `POST /api/auth/logout` (que llama a `revokeUserTokens`) corte la sesión **al instante**, sin esperar a la expiración natural del token (≤1h).
- Mismo `checkRevoked: true` en el handshake del socket.
- Códigos de error del socket cambiados de strings sueltos a `MISSING_TOKEN` / `INVALID_TOKEN` para consistencia con REST.

## Fase 6 — Tests

35 casos en 3 archivos, todos en verde:
- `backend/tests/authService.test.ts` (15): persistencia exacta, duplicados, concurrencia, login posterior.
- `backend/tests/authController.test.ts` (12): validaciones, propagación de AppError, no-leak de errores internos, logout.
- `backend/tests/authMiddleware.test.ts` (8): autorizado, sin token, header mal formado, inválido, expirado, revocado, no-leak.

Setup: Jest + ts-jest con `tsconfig.test.json` separado (porque el `tsconfig.json` original tenía `rootDir: ./src`).

## Fase 7 — Listo para integrar frontend

- `POST /api/auth/logout` expuesto (revoca tokens server-side, marca offline).
- `CORS_ORIGIN` ahora multi-origen (coma-separado).
- `engines.node >=20` en package.json.
- Endpoint raíz `GET /` informativo.
- Contrato completo en `backend/docs/contrato-frontend.md` (11 secciones, autocontenido).

## Fase 8 — Hotfix CORS para dev local contra prod

Después de probar con curl que el deploy de Render funcionaba pero rechazaba `localhost:5173`, modifiqué el parser de `CORS_ORIGIN` para que **siempre** acepte los puertos locales habituales (`localhost:5173/3000`, `127.0.0.1:5173/3000`), además de lo que diga la variable. Esto evita tener que mantener la lista actualizada en el dashboard de Render.

Verificado: `OPTIONS https://miniproyecto2-2j8a.onrender.com/api/auth/register` con `Origin: http://localhost:5173` ahora devuelve `access-control-allow-origin: http://localhost:5173` ✓.

## Fase 9 — Frontend conectado al contrato

Cambios sin tocar UI ni router:

- `frontend/src/services/api.ts` — rehecho con tipos del contrato (`User`, `AuthProvider`, `ApiErrorCode`, `ApiError` con `code` + `message`), helper tipado `authApi.{register,getMe,logout,checkUsername}`, **retry automático** de 401 `INVALID_TOKEN` con `getIdToken(true)`.
- `frontend/src/context/auth-context.ts` — tipos: `RegisterInput {username, fullName}`, `LoginResult = "ok" | "needs_profile"`, métodos `completeGoogleProfile`, `refreshProfile`.
- `frontend/src/context/AuthContext.tsx` — flujo completo:
  - Email/Pwd: `createUserWithEmailAndPassword` + `authApi.register({...provider:"password"})`.
  - Google: `signInWithPopup` → `getMe`. Si 404, devuelve `{status:"needs_profile", suggestedUsername, suggestedFullName}` para que la UI abra el modal.
  - Logout: `authApi.logout()` best-effort + `signOut(auth)` + `disconnectSocket()`.
- `frontend/src/components/GoogleProfileModal.tsx` (nuevo) — modal con username + fullName, check-username debounced (400ms), validación regex.
- `frontend/src/pages/RegisterPage.tsx` — agregado campo `username` con feedback en vivo (Disponible ✓ / Ya en uso / Formato inválido).
- `frontend/src/pages/LoginPage.tsx` — abre el modal si Google devuelve needs_profile.
- `frontend/.env` — apuntando a Render (era localhost).

## Validación end-to-end

| Check | Resultado |
|---|---|
| `tsc -b` frontend | ✓ |
| `vite build` | ✓ 426 kB / 114 kB gzip |
| `eslint .` frontend | ✓ limpio |
| Backend `npm test` | ✓ 35/35 |
| `tsc --noEmit` backend | ✓ |
| Render redespegado con CORS nuevo | ✓ (curl verifica) |
| Vite dev en `http://localhost:5173` | ✓ HTTP 200 |

## Pendiente al cerrar la sesión

- En Firebase Console agregar `localhost` a Authorized Domains (sino el popup Google tira `auth/unauthorized-domain` al probar local).
- Desplegar `firestore.rules` cuando el frontend empiece a leer Firestore directo.
- El backend tiene `revokeUserTokens` y `setUserOnlineStatus` listas pero el socket todavía no persiste mensajes en Firestore (Sprint 1).

## Commits relevantes

- `324b8d4 fix(backend): CORS siempre permite localhost para dev contra prod`
- `2e25a93 C1,C2,C3` — bundle de todos los cambios anteriores de TS-01 (modelo, errores estables, transacción, middleware, tests, docs, contrato).

## Referencias rápidas

- Contrato técnico: `backend/docs/contrato-frontend.md` — fuente de verdad para cualquier integración.
- Refinamiento HU: `backend/docs/historias-tecnicas.md` (TS-01 §1).
- Reglas Firestore: `firestore.rules` (raíz).
- Tests: `backend/tests/*.test.ts`.
