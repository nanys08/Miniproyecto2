# Modelo de datos Firestore — Mini-proyecto 2 (Sprint 1)

Este documento es la **fuente de verdad** del esquema de Firestore que usa
el backend. Cada cambio funcional en la forma de los documentos debe
reflejarse aquí y en `src/models/*.ts`.

> Convención general: los nombres de colección van en **plural y minúscula**
> (`users`, `rooms`, `messages`). El ID del documento coincide con el `uid`
> de Firebase Auth en `users/`, y con un ID autogenerado en el resto.

---

## 1. Colección `users/`

Documento que representa el perfil persistido de un usuario tras el signup
de Firebase Auth. Se crea desde el backend (`POST /api/auth/register`),
nunca directo desde el cliente.

### 1.1 Ruta del documento

```
users/{uid}
```

donde `{uid}` es el Firebase Auth UID. Existe garantía de unicidad porque
Firebase Auth no reutiliza UIDs.

### 1.2 Campos

| Campo       | Tipo                       | Obligatorio | Origen                                                | Descripción |
|-------------|----------------------------|-------------|-------------------------------------------------------|-------------|
| `uid`       | `string`                   | sí          | Firebase ID Token                                     | Igual al ID del documento. Se guarda redundante para facilitar queries por `where("uid", "==", ...)`. |
| `username`  | `string`                   | sí          | Body de `register`                                    | 4-10 chars, regex `^[a-zA-Z0-9_.]{4,10}$`. **Único** en la colección (validado en transacción). Filtrado por blacklist (ver `src/utils/profanity.ts`). |
| `fullName`  | `string`                   | sí          | Body de `register`                                    | Nombre para mostrar. No requiere ser único. |
| `email`     | `string`                   | sí          | Firebase ID Token (no del body)                       | Email verificado por Firebase. Se toma del token para evitar suplantación. |
| `avatar`    | `string`                   | sí          | Body de `register` (default `"default_avatar.png"`)   | URL o ruta del avatar. |
| `provider`  | `"password" \| "google"`   | sí          | Body de `register`                                    | Mecanismo con que se autenticó originalmente. |
| `createdAt` | `Timestamp` / ISO 8601     | sí          | Backend (`new Date()`)                                | Timestamp de creación. Firestore lo serializa como ISO al exponerlo via API. |
| `online`    | `boolean`                  | sí          | Backend (`false` inicial, `logout` lo apaga)          | Flag de presencia. Sprint 2 lo manejará también desde Socket.IO. |

### 1.3 Ejemplo JSON

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

### 1.4 Invariantes

- `users/{uid}.uid === uid` (el campo coincide con el ID del documento).
- `username` único en toda la colección. La unicidad se garantiza con una
  **transacción** en `authService.registerUserProfile` (ver código).
- `email` viene siempre del Firebase ID Token verificado, no del body.
- `provider` ∈ `["password", "google"]`. No se acepta ningún otro valor.

### 1.5 Índices

Para Sprint 1, el filtro `where("username", "==", ...)` usa el **índice
single-field automático** que Firestore mantiene por defecto en todos los
campos string. No hace falta declarar índices compuestos.

> Si se agrega `where("online", "==", true).orderBy("username")` en Sprint 2
> (ej. para listar usuarios online), Firestore pedirá un índice compuesto;
> declararlo en `firestore.indexes.json` cuando llegue el momento.

### 1.6 Reglas de seguridad (resumen)

Definidas en `firestore.rules`:

- **read**: cualquier usuario autenticado.
- **create**: solo el dueño del UID (`request.auth.uid == uid`), con el
  schema exacto y `username` entre 4 y 10 chars. La verificación de
  unicidad y de regex completa la hace el backend (Admin SDK bypasea las
  reglas).
- **update**: solo el dueño y **sin tocar** `uid`, `username`, `email`,
  `provider` ni `createdAt`. Solo se permite cambiar campos no críticos
  (en Sprint 1: `avatar`, `fullName`, `online`).
- **delete**: prohibido desde el cliente.

---

## 2. Colección `rooms/` (placeholder Sprint 1)

Reservada para las salas de estudio. Hoy está vacía y bloqueada para
escrituras desde el cliente.

```
rooms/{roomId}
  └── messages/{messageId}
```

Las reglas actuales (`firestore.rules`) permiten lectura a cualquier
usuario autenticado y bloquean escritura — la idea es que el backend
(Admin SDK) sea la única ruta de escritura cuando se implementen los
endpoints `/api/rooms/*`.

El modelo definitivo de `rooms/` y `messages/` se documentará cuando
arranque la TS-02.

---

## 3. Mapeo Firestore ↔ TypeScript

Las interfaces que reflejan estos documentos viven en `src/models/`:

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
nombres de colección desde el código del backend. Nunca hardcodear strings
sueltos.

---

## 4. Convención de timestamps

- Al escribir, usamos `new Date()` desde el backend (que Firestore convierte
  internamente a `Timestamp`).
- Al leer y devolver via REST, Firestore Admin serializa los `Timestamp`
  como objetos `{ _seconds, _nanoseconds }`. Si en el futuro queremos que
  el JSON tenga ISO 8601 plano, hay que hacer un mapeo en el controller
  (`createdAt: profile.createdAt.toDate().toISOString()`).

---

## 5. Checklist al modificar el modelo

Cuando cambies algo en este documento:

- [ ] Actualizar `src/models/*.ts` y los servicios que escriben/leen.
- [ ] Actualizar `firestore.rules` (sobre todo `keys().hasAll(...)` y
      restricciones de tamaño).
- [ ] Actualizar los esquemas Swagger en `src/config/swagger.ts`.
- [ ] Actualizar `docs/contrato-frontend.md` si la forma cambia para el
      cliente.
- [ ] Agregar/actualizar tests en `tests/authService.test.ts`.
