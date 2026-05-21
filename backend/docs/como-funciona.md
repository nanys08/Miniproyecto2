# Cómo funciona el backend — guía línea por línea

Documento de **referencia interna** del backend. Explica qué hace cada archivo, cada función y cada conexión externa, en orden de ejecución. Pensado para entender el código sin tener que leerlo todo de golpe.

Si quieres el **qué hay** y **qué falta**, lee `backend/docs/historias-tecnicas.md`. Si quieres el **cómo**, este doc es el camino.

---

## 1. Vista general — qué es y qué no es el backend

El backend es un **servidor Node.js** que hace cuatro cosas, ninguna más:

1. **Verifica** que el usuario que llama está autenticado (revisa un JWT firmado por Firebase).
2. **Lee y escribe** documentos en Firestore (perfil del usuario, salas, mensajes).
3. **Reparte mensajes en vivo** entre los navegadores conectados vía Socket.IO (chat, presencia).
4. **Intermedia el handshake** de las videollamadas WebRTC (offer/answer/ICE). El audio/video **nunca** pasa por aquí.

**Lo que NO hace el backend:**

- No crea usuarios ni guarda contraseñas (eso lo hace Firebase Auth en el navegador).
- No participa en el login con Google (el popup ocurre 100% en el cliente).
- No transporta audio/video (eso va P2P entre navegadores).
- No mantiene "sesión" — es **stateless**, valida el token en cada request.

```
┌────────────────┐       HTTP / Socket.IO        ┌──────────────┐       ┌─────────────────┐
│ Frontend       │ ───────────────────────────▶  │ Backend      │ ────▶ │ Firebase Auth   │ (verifica JWT)
│ (Firebase SDK) │                                │ (Express +   │       │ Firestore       │ (lee/escribe docs)
│                │ ◀───────── eventos ──────────  │  Socket.IO)  │       └─────────────────┘
└────────────────┘                                └──────────────┘
        │
        │ WebRTC P2P (audio/video) — NO pasa por backend
        └─────────────────────────────────────────▶ otro navegador
```

---

## 2. Arranque del servidor — orden de ejecución

Cuando ejecutas `npm run dev` o `npm start`, esto pasa:

### 2.1 `src/server.ts` — punto de entrada

```ts
import { createServer } from "http";
import { Server } from "socket.io";
import app from "./app";
import { env } from "./config/env";
import "./config/firebase";              // ← solo importar ya inicializa Firebase Admin
import { initSocket } from "./sockets/socketManager";
import { logger } from "./utils/logger";

const httpServer = createServer(app);    // 1. envuelve Express en un HTTP server crudo

const io = new Server(httpServer, {      // 2. monta Socket.IO sobre el mismo HTTP server
  cors: { origin: env.corsOrigin, credentials: true },
});

initSocket(io);                          // 3. registra los handlers de Socket.IO

httpServer.listen(env.port, () => {      // 4. arranca el listener TCP
  logger.info(`Servidor corriendo en http://localhost:${env.port}`);
});
```

**Qué pasa en cada paso, en humano:**

1. `createServer(app)` — Express por sí solo no expone un `httpServer` que Socket.IO pueda usar. Lo envolvemos en un servidor HTTP nativo de Node para que ambos (Express y Socket.IO) compartan el mismo puerto.
2. `new Server(httpServer, {...})` — Socket.IO se "engancha" al servidor HTTP y se queda escuchando el path `/socket.io/` (por defecto). El resto de paths los maneja Express.
3. `initSocket(io)` — registra los handlers de conexión, mensajes, signaling, etc. (ver §7).
4. `httpServer.listen(...)` — abre el puerto. A partir de aquí ya responde HTTP y WebSocket.

> **Importante:** `import "./config/firebase"` se hace **antes** de los handlers porque el side-effect del import es inicializar el Admin SDK (`admin.initializeApp(...)`). Si lo importaras después, los servicios fallarían al intentar usar Firestore.

### 2.2 `src/app.ts` — la app Express

```ts
const app = express();

app.use(cors({ origin: env.corsOrigin, credentials: true }));
app.use(express.json());                         // parsea body JSON
app.use(express.urlencoded({ extended: true })); // parsea form-urlencoded

app.get("/health", (_req, res) => {              // health check para Render
  res.json({ status: "ok", env: env.nodeEnv });
});

app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));  // Swagger UI
app.get("/api/docs.json", (_req, res) => { res.send(swaggerSpec); }); // spec OpenAPI

app.use("/api", routes);                         // todo lo demás cuelga de /api
```

Función por función:

- **`cors(...)`**: permite que el frontend (otro dominio en producción) llame a `/api/*`. Sin esto, el navegador bloquea las requests por política same-origin.
- **`express.json()`**: lee el body como JSON. Sin esto, `req.body` estaría vacío.
- **`/health`**: ruta sin auth, devuelve `{ status: "ok" }`. La usa Render para saber si el servicio está vivo y reiniciarlo si no responde.
- **`/api/docs` y `/api/docs.json`**: Swagger UI y la spec OpenAPI. Documentación interactiva — ver §9.
- **`app.use("/api", routes)`**: monta el router maestro (`src/routes/index.ts`) bajo el prefijo `/api`.

---

## 3. Variables de entorno — `src/config/env.ts`

```ts
import dotenv from "dotenv";
dotenv.config();                          // ← carga .env al process.env

export const env = {
  port:        parseInt(process.env.PORT || "3000", 10),
  nodeEnv:     process.env.NODE_ENV || "development",
  corsOrigin:  process.env.CORS_ORIGIN || "http://localhost:5173",
  firebase: {                              // claves del Web SDK (NO se usan en backend, solo informativas)
    apiKey:            process.env.FIREBASE_API_KEY!,
    authDomain:        process.env.FIREBASE_AUTH_DOMAIN!,
    projectId:         process.env.FIREBASE_PROJECT_ID!,
    storageBucket:     process.env.FIREBASE_STORAGE_BUCKET!,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID!,
    appId:             process.env.FIREBASE_APP_ID!,
  },
  firebaseAdmin: {                         // credenciales del Service Account (uso exclusivo backend)
    projectId:   process.env.FIREBASE_ADMIN_PROJECT_ID!,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
    privateKey:  process.env.FIREBASE_ADMIN_PRIVATE_KEY
      ?.replace(/^"|"$/g, "")              // quita comillas envolventes si Render las dejó
      .replace(/\\n/g, "\n"),              // convierte "\n" textual a saltos de línea reales
  },
};
```

**El truco de la `privateKey`:** las llaves PEM tienen saltos de línea. Cuando guardas la variable en Render (o en `.env`), esos saltos se escapan como `\n` (texto literal de dos caracteres). Si no haces `replace(/\\n/g, "\n")`, Firebase falla al intentar parsear la llave. El `replace(/^"|"$/g, "")` adicional es defensivo: a veces se copian comillas envolventes desde el JSON del Service Account.

**Qué claves usa cada cosa:**

| Variable                         | La usa                       | Para qué                                     |
|----------------------------------|------------------------------|----------------------------------------------|
| `PORT`                           | `server.ts:20`               | Puerto HTTP                                  |
| `CORS_ORIGIN`                    | `app.ts:11`, `server.ts:13`  | Dominio del frontend permitido               |
| `FIREBASE_ADMIN_PROJECT_ID`      | `config/firebase.ts:11,18`   | Identificar el proyecto Firebase             |
| `FIREBASE_ADMIN_CLIENT_EMAIL`    | `config/firebase.ts:10`      | Email del Service Account                    |
| `FIREBASE_ADMIN_PRIVATE_KEY`     | `config/firebase.ts:12`      | Llave privada para firmar requests a Google  |
| `FIREBASE_*` (sin `ADMIN_`)      | (declaradas, no usadas)      | Reservadas para futuro uso en backend si hace falta |

---

## 4. Conexión con Firebase — `src/config/firebase.ts`

Este archivo es el corazón de cómo el backend habla con Google.

```ts
import * as admin from "firebase-admin";
import type { Auth } from "firebase-admin/auth";
import { env } from "./env";

if (!admin.apps.length) {                            // ← evita inicializar dos veces
  const credential =
    env.firebaseAdmin.clientEmail && env.firebaseAdmin.privateKey
      ? admin.credential.cert({                       // ← caso 1: credenciales explícitas
          projectId:   env.firebaseAdmin.projectId,
          clientEmail: env.firebaseAdmin.clientEmail,
          privateKey:  env.firebaseAdmin.privateKey,
        })
      : admin.credential.applicationDefault();        // ← caso 2: GOOGLE_APPLICATION_CREDENTIALS

  admin.initializeApp({
    credential,
    projectId: env.firebaseAdmin.projectId || env.firebase.projectId,
  });

  console.log("✓ Firebase Admin SDK inicializado");
}

export const db: FirebaseFirestore.Firestore = admin.firestore();
export const auth: Auth = admin.auth();
export default admin;
```

### 4.1 ¿Qué es "Firebase Admin"?

Firebase tiene **dos SDKs**:

- **Web SDK** (`firebase`) — vive en el navegador. Hace login con email/Google, guarda el ID Token, envía requests a Firebase. **No tiene permisos elevados:** solo puede hacer lo que las "Security Rules" permiten.
- **Admin SDK** (`firebase-admin`) — vive en el backend. Tiene **permisos totales** sobre el proyecto. Bypasea Security Rules. Puede crear/borrar usuarios, verificar tokens, leer cualquier doc.

El backend usa **solo el Admin SDK**.

### 4.2 ¿Cómo se autentica el backend ante Google?

Necesita demostrar que tiene permiso. Hay dos formas (el código soporta ambas):

**Caso 1 — Credenciales explícitas (`admin.credential.cert(...)`):**

Si en `.env` están las tres variables `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL` y `FIREBASE_ADMIN_PRIVATE_KEY`, se construye un objeto credencial con esos datos. Esto viene del JSON del **Service Account** que descargas en Firebase Console (`Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada`).

El JSON descargado se ve así:

```json
{
  "type": "service_account",
  "project_id": "miniproyecto2-xxxxx",
  "client_email": "firebase-adminsdk-abc12@miniproyecto2-xxxxx.iam.gserviceaccount.com",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG...\n-----END PRIVATE KEY-----\n",
  ...
}
```

Los tres campos que nos interesan (`project_id`, `client_email`, `private_key`) los copias al `.env` y `env.ts` los lee.

**Caso 2 — Credenciales por defecto (`admin.credential.applicationDefault()`):**

Si no hay variables explícitas, Firebase intenta usar `GOOGLE_APPLICATION_CREDENTIALS` (path a un JSON local) o las credenciales del entorno de Google Cloud (si está corriendo en GCP). En producción en Render, **siempre** usamos el Caso 1.

### 4.3 ¿Qué exporta este archivo?

- `admin` (default export) — la instancia completa del SDK, por si se necesita algo raro.
- `db: Firestore` — cliente de Firestore. Es lo que usas para `db.collection("users").doc(uid).get()`, etc.
- `auth: Auth` — cliente de Auth. Es lo que usas para `auth.verifyIdToken(token)`, `auth.revokeRefreshTokens(uid)`.

Cualquier archivo del backend que necesite hablar con Firebase importa de aquí:

```ts
import { db, auth } from "../config/firebase";
```

### 4.4 ¿Por qué `if (!admin.apps.length)`?

Si el archivo se importa varias veces (por imports cruzados o por hot-reload en dev), `admin.initializeApp(...)` lanzaría un error la segunda vez ("App already exists"). El guard evita el doble init.

---

## 5. El middleware de autenticación — `src/middlewares/authMiddleware.ts`

Este middleware se monta antes de cualquier ruta privada. Es la barrera que decide si la request pasa o se rechaza con 401.

```ts
import { Request, Response, NextFunction } from "express";
import { auth } from "../config/firebase";

export interface AuthRequest extends Request {
  user?: {
    uid: string;
    email?: string;
  };
}

export const verifyToken = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Token de autorización requerido" });
    return;
  }

  const token = authHeader.split("Bearer ")[1];

  try {
    const decoded = await auth.verifyIdToken(token);
    req.user = { uid: decoded.uid, email: decoded.email };
    next();
  } catch {
    res.status(401).json({ error: "Token inválido o expirado" });
  }
};
```

### 5.1 ¿Qué es un "ID Token" en humano?

Cuando el usuario hace login en el frontend (`signInWithEmailAndPassword` o `signInWithPopup` con Google), Firebase Auth le devuelve un **ID Token**: un JWT (JSON Web Token) firmado con la llave privada de Google.

Un JWT tiene esta forma:

```
eyJhbGciOiJSUzI1NiIsImtpZCI6...   ← header (algoritmo)
.eyJpc3MiOiJodHRwczovL3NlY3...    ← payload (uid, email, exp, etc.)
.aB3kJxLm9...                     ← firma (Google la firmó)
```

El payload (cuando lo decodificas) contiene cosas como:

```json
{
  "iss": "https://securetoken.google.com/miniproyecto2-xxxxx",
  "aud": "miniproyecto2-xxxxx",
  "auth_time": 1731695400,
  "user_id": "abc123uid",
  "sub": "abc123uid",
  "iat": 1731695400,
  "exp": 1731699000,
  "email": "santi@gmail.com",
  "email_verified": false,
  "firebase": {
    "identities": { "google.com": ["112233..."], "email": ["santi@gmail.com"] },
    "sign_in_provider": "google.com"   ← AQUÍ se ve que entró por Google
  }
}
```

### 5.2 ¿Qué hace `auth.verifyIdToken(token)`?

Hace **tres cosas** internamente:

1. **Verifica la firma** con la llave pública de Google (la descarga y la cachea). Si la firma no cuadra, el token fue manipulado → throw.
2. **Verifica que no haya expirado** (`exp` > ahora). Los ID Tokens duran 1 hora; el cliente los rota automáticamente.
3. **Verifica que el `aud` (audience)** coincida con el `projectId` del Admin SDK (para que un token de otro proyecto no funcione aquí).

Si todo pasa, devuelve el payload decodificado como objeto. Si algo falla, lanza un error.

### 5.3 ¿Qué hacemos con el resultado?

Guardamos `uid` y `email` en `req.user`. Esto es lo que los controllers leen después:

```ts
const { uid, email } = req.user!;  // ← garantizado porque el middleware ya pasó
```

El `next()` deja pasar la request al siguiente handler. Si no llamamos `next()` y respondimos con `res.status(401)`, la cadena Express se corta ahí.

---

## 6. La capa de servicios — `src/services/authService.ts`

Aquí vive **la lógica de negocio** que toca Firestore. Cinco funciones, todas independientes.

```ts
import { db, auth } from "../config/firebase";
import { User, USERS_COLLECTION } from "../models/User";
import { logger } from "../utils/logger";
```

`USERS_COLLECTION` es la constante `"users"` definida en `src/models/User.ts:11`. Centralizamos el nombre para no escribir el string a mano.

### 6.1 `registerUserProfile(uid, username, fullName, email, provider, avatar?)` — crear perfil

```ts
export const registerUserProfile = async (
  uid: string, username: string, fullName: string,
  email: string, provider: AuthProvider,
  avatar: string = "default_avatar.png"
): Promise<User> => {
  const existing = await getUserProfile(uid);
  if (existing) {
    throw new Error("El perfil ya existe para este usuario");
  }

  const usernameExists = await isUsernameTaken(username);
  if (usernameExists) {
    throw new Error("El nombre de usuario ya está en uso");
  }

  const newUser: User = {
    uid, username, fullName, email, avatar, provider,
    createdAt: new Date(),
    online: false,
  };

  await db.collection(USERS_COLLECTION).doc(uid).set(newUser);
  logger.info(`Usuario registrado (${provider}): ${username} (${uid})`);
  return newUser;
};
```

Paso a paso:

1. Verifica que no exista ya un doc `users/{uid}` (idempotencia: el cliente no debería poder pisar su propio perfil con un segundo `register`).
2. Pregunta si el `username` ya está tomado (siguiente función).
3. Si alguno de los dos chequeos falla → lanza error. El controller lo captura y devuelve `409 Conflict`.
4. Arma el objeto `User` con `createdAt: new Date()` (Firestore lo convertirá automáticamente a `Timestamp`) y `online: false` (el socket lo cambia a `true` después).
5. `db.collection("users").doc(uid).set(newUser)` — **escribe el documento `users/{uid}`** con el contenido completo. El `uid` viene del Firebase Auth, así que el ID del doc es el mismo que el uid del usuario. Esto es importante: nos permite leer el perfil sabiendo solo el uid (sin queries).
6. Devuelve el objeto creado.

> El campo `provider` distingue cuentas creadas con email/contraseña (`"password"`) de las creadas vía Google (`"google"`). Esto sirve para auditoría y para futuras políticas (p. ej. solo cuentas Google pueden cambiar el avatar desde su foto de Google).

### 6.2 `isUsernameTaken(username)` — validar unicidad

```ts
export const isUsernameTaken = async (username: string): Promise<boolean> => {
  const snapshot = await db
    .collection(USERS_COLLECTION)
    .where("username", "==", username)
    .limit(1)
    .get();
  return !snapshot.empty;
};
```

Hace una **query a Firestore** pidiendo "dame hasta 1 documento donde `username == X`". El `.limit(1)` es para no traer más datos de los necesarios — solo queremos saber si existe.

`snapshot.empty` es `true` si no encontró nada. La función devuelve lo contrario: `true` si **sí** existe.

> **Requiere un índice simple sobre `users.username`**. Firestore lo crea automáticamente la primera vez que la query se ejecuta y muestra un link en el error.

### 6.3 `getUserProfile(uid)` — leer perfil

```ts
export const getUserProfile = async (uid: string): Promise<User | null> => {
  const doc = await db.collection(USERS_COLLECTION).doc(uid).get();
  return doc.exists ? (doc.data() as User) : null;
};
```

Lectura directa por ID, no es una query — Firestore busca el doc por su path `users/{uid}` en O(1). Si existe devuelve el contenido, si no existe devuelve `null`.

### 6.4 `setUserOnlineStatus(uid, online)` — toggle online

```ts
export const setUserOnlineStatus = async (uid: string, online: boolean): Promise<void> => {
  await db.collection(USERS_COLLECTION).doc(uid).update({ online });
};
```

Actualización **parcial** (solo el campo `online`, sin tocar el resto). Se llama en dos momentos: cuando un socket se conecta (online=true) y cuando se desconecta (online=false). Lo veremos en §7.

### 6.5 `revokeUserTokens(uid)` — invalidar sesiones

```ts
export const revokeUserTokens = async (uid: string): Promise<void> => {
  await auth.revokeRefreshTokens(uid);
  logger.info(`Tokens revocados para uid: ${uid}`);
};
```

Esta función **no está expuesta** por ningún endpoint todavía. Está lista para Sprint 1 cuando se necesite forzar el logout desde el servidor (por ejemplo, si se detecta abuso).

`auth.revokeRefreshTokens(uid)` le dice a Firebase: "todos los ID Tokens de este uid emitidos antes de ahora ya no valen". Los tokens existentes seguirán pasando `verifyIdToken` hasta que expiren (≤ 1 hora) **a menos que** el middleware se reconfigure con `checkRevoked: true`, que añade una consulta extra.

---

## 7. Los controllers — `src/controllers/authController.ts`

Los controllers son la capa que pega Express con los servicios. Solo manejan request/response, **no contienen lógica de negocio**.

### 7.1 `register` — `POST /api/auth/register`

```ts
export const register = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { uid, email } = req.user!;       // ← garantizado por verifyToken
    const { username, fullName, provider, avatar } = req.body ?? {};

    if (!username || !fullName || !provider) {
      res.status(400).json({
        error: "Los campos username, fullName y provider son requeridos",
      });
      return;
    }
    if (!USERNAME_REGEX.test(username)) {
      res.status(400).json({
        error:
          "username inválido: 3-20 caracteres, solo letras, números y guion bajo",
      });
      return;
    }
    if (!VALID_PROVIDERS.includes(provider)) {
      res.status(400).json({ error: "provider debe ser 'password' o 'google'" });
      return;
    }

    const user = await authService.registerUserProfile(
      uid, username, fullName, email || "", provider, avatar
    );
    res.status(201).json({ user });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al registrar usuario";
    const status = /ya está en uso|ya existe/i.test(message) ? 409 : 400;
    res.status(status).json({ error: message });
  }
};
```

Validaciones que aplica el controller:
- Campos obligatorios: `username`, `fullName`, `provider`.
- `username` debe matchear `/^[a-zA-Z0-9_]{3,20}$/` (sin espacios, sin tildes, sin símbolos raros).
- `provider` debe ser `"password"` o `"google"`.

Y mapeo de errores → códigos HTTP:
- `400` para datos malformados.
- `409` cuando el servicio reporta perfil duplicado o username duplicado (carrera entre dos clientes).
- `401` lo emite antes el middleware si el token es inválido.

Flujo:

1. `req.user!` — el `!` (non-null assertion) es seguro porque este controller solo se monta **después** de `verifyToken`, que garantiza que `req.user` existe.
2. Saca `username` y `avatar` del body (`avatar` es opcional).
3. Valida que `username` venga. Si no, 400.
4. Llama al service. Si el username ya estaba tomado, el service lanza `Error("El nombre de usuario ya está en uso")`, el `catch` lo agarra y devuelve 400 con el mensaje del error.
5. Si todo va bien, devuelve `201 Created` con el `user` recién creado.

### 7.2 `getMe` — `GET /api/auth/me`

```ts
export const getMe = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const profile = await authService.getUserProfile(req.user!.uid);
    if (!profile) {
      res.status(404).json({ error: "Perfil no encontrado" });
      return;
    }
    res.json({ user: profile });
  } catch {
    res.status(500).json({ error: "Error al obtener perfil" });
  }
};
```

1. Tomo el uid del request autenticado.
2. Le pido al service el perfil.
3. Si no existe (caso típico: usuario autenticado con Google que aún no ha registrado perfil) → 404.
4. Si existe → 200 con `{ user }`.

### 7.3 `checkUsername` — `GET /api/auth/check-username/:username`

```ts
export const checkUsername = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const username = req.params["username"] as string;
    const taken = await authService.isUsernameTaken(username);
    res.json({ available: !taken });
  } catch {
    res.status(500).json({ error: "Error al verificar username" });
  }
};
```

**Este endpoint NO usa `verifyToken`** — es público, para que la pantalla de registro pueda validar disponibilidad mientras el usuario tipea, antes incluso de tener cuenta.

Lee el username del path, pregunta al service y devuelve `{ available: boolean }`.

---

## 8. El router — `src/routes/authRoutes.ts` + `src/routes/index.ts`

### 8.1 `src/routes/index.ts` — router maestro

```ts
import { Router } from "express";
import authRoutes from "./authRoutes";

const router = Router();
router.use("/auth", authRoutes);

// Sprint 1+
// router.use("/rooms", roomRoutes);
// router.use("/messages", messageRoutes);

export default router;
```

Punto de extensión. Hoy solo monta `authRoutes` bajo `/auth`. Cuando lleguen las salas (Sprint 1) se agregará `roomRoutes`.

### 8.2 `src/routes/authRoutes.ts` — rutas de auth

```ts
const router = Router();

router.post("/register",                  verifyToken, authController.register);
router.get ("/me",                        verifyToken, authController.getMe);
router.get ("/check-username/:username",              authController.checkUsername);  // ← pública

export default router;
```

El orden de los argumentos en `router.METHOD(path, ...handlers)` define la cadena de middlewares. Express los ejecuta de izquierda a derecha. Si un middleware no llama `next()`, los siguientes nunca se ejecutan.

Las URLs finales (recuerda que `app.use("/api", routes)` agrega `/api` y `index.ts` agrega `/auth`):

| Método | URL completa                          | Requiere token |
|--------|----------------------------------------|----------------|
| POST   | `/api/auth/register`                   | sí             |
| GET    | `/api/auth/me`                         | sí             |
| GET    | `/api/auth/check-username/:username`   | no             |

### 8.3 Los comentarios `@openapi` en el archivo

Cada ruta tiene encima un bloque tipo:

```ts
/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     tags: [Auth]
 *     ...
 */
```

Eso lo lee `swagger-jsdoc` para generar la spec OpenAPI automática (ver §9). No afecta la ejecución — son solo comentarios.

---

## 9. Documentación automática — `src/config/swagger.ts`

```ts
const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.3",
    info: { title: "...", version: "0.1.0", description: "..." },
    servers: [ { url: `http://localhost:${env.port}` }, { url: "https://miniproyecto2-backend.onrender.com" } ],
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
      schemas: { User: {...}, RegisterRequest: {...}, Error: {...} },
    },
  },
  apis: ["./src/routes/*.ts", "./src/controllers/*.ts", "./src/app.ts"],
};
export const swaggerSpec = swaggerJsdoc(options);
```

`swagger-jsdoc` escanea los archivos listados en `apis`, encuentra los comentarios `@openapi` y los pega dentro de la spec base. El resultado se sirve en:

- `GET /api/docs` → Swagger UI (interfaz visual interactiva).
- `GET /api/docs.json` → la spec cruda en JSON (para Postman, clientes generados, etc.).

---

## 10. Socket.IO — `src/sockets/socketManager.ts`

Aquí pasa lo más interesante: chat en vivo, presencia, signaling WebRTC. Es el archivo más denso del backend, ~120 líneas.

```ts
const connectedUsers = new Map<
  string,                                            // socketId
  { uid: string; username: string; roomId?: string }
>();
```

Un **Map en memoria** del servidor: cada socket conectado tiene su entrada. Es la fuente de verdad de "quién está conectado **ahora mismo**". Cuando el servidor reinicia se pierde, pero los clientes se reconectan y se reconstruye.

> Como un mismo usuario (uid) puede tener múltiples pestañas/dispositivos abiertos, el Map tiene N entradas por uid (una por cada socketId). Esto es deliberado.

### 10.1 `initSocket(io)` — registro de handlers

```ts
export const initSocket = (io: Server): void => {
  io.use(async (socket, next) => {
    // ← middleware de autenticación del socket (10.2)
  });

  io.on("connection", async (socket: Socket) => {
    // ← se ejecuta una vez por cada cliente que se conecta (10.3)
  });
};
```

Dos cosas:

- `io.use(...)` — middleware **global** de Socket.IO. Se ejecuta antes de aceptar la conexión. Si `next(err)`, la conexión se rechaza.
- `io.on("connection", ...)` — handler que se llama una vez por socket recién aceptado.

### 10.2 Middleware de auth del socket

```ts
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token as string | undefined;
  if (!token) {
    return next(new Error("Token requerido"));
  }
  try {
    const decoded = await auth.verifyIdToken(token);
    socket.data.uid = decoded.uid;
    next();
  } catch {
    next(new Error("Token inválido"));
  }
});
```

El cliente envía el token en el handshake así:

```ts
io(SOCKET_URL, { auth: { token: idToken } });
```

Aquí lo leemos, lo verificamos con el mismo `verifyIdToken` que usamos en REST, y guardamos el `uid` decodificado en `socket.data.uid`. A partir de aquí, todos los handlers del socket pueden leer `socket.data.uid` para saber quién es.

> **`socket.data`** es un objeto que Socket.IO provee precisamente para guardar info por-socket sin tener que mantener tu propio Map.

### 10.3 `connection` — bienvenida

```ts
io.on("connection", async (socket: Socket) => {
  const uid: string = socket.data.uid;
  const profile = await authService.getUserProfile(uid);
  const username = profile?.username || "Anónimo";

  connectedUsers.set(socket.id, { uid, username });
  await authService.setUserOnlineStatus(uid, true);
  logger.info(`Socket conectado: ${username} (${socket.id})`);

  // ... handlers de eventos
});
```

Cuando llega un cliente nuevo:

1. Lee el `uid` que el middleware dejó en `socket.data`.
2. Va a Firestore a leer el perfil para obtener el `username` (lo necesitamos para emitir eventos legibles tipo "Juan se unió").
3. Lo registra en el Map en memoria.
4. Marca `users/{uid}.online = true` en Firestore.

A partir de aquí registra los handlers de eventos específicos.

### 10.4 `join-room` — entrar a una sala

```ts
socket.on("join-room", async (roomId: string) => {
  socket.join(roomId);
  connectedUsers.set(socket.id, { uid, username, roomId });
  socket.to(roomId).emit("user-joined", { uid, username });
  logger.info(`${username} se unió a room: ${roomId}`);
});
```

- `socket.join(roomId)` — mete este socket en la "room" de Socket.IO con nombre `roomId`. **Importante:** no tiene nada que ver con la colección `rooms` de Firestore, es un concepto puramente de Socket.IO para hacer broadcast a un subconjunto de sockets.
- Actualiza el Map con `roomId` para saber a qué sala pertenece (para emitir `user-left` al desconectarse).
- `socket.to(roomId).emit(...)` — manda `user-joined` a **todos los demás** sockets en esa room. **NO al emisor** (eso sería `io.to(roomId).emit`). Esto es importante para no anunciar "tú entraste" a ti mismo.

### 10.5 `send-message` — chat

```ts
socket.on("send-message", (payload: { roomId: string; content: string }) => {
  const { roomId, content } = payload;
  const message = {
    senderUid: uid,
    senderUsername: username,
    content,
    roomId,
    createdAt: new Date().toISOString(),
  };
  io.to(roomId).emit("receive-message", message);
});
```

- Recibe `{ roomId, content }` del cliente.
- Construye el mensaje completo agregando datos del servidor (`senderUid`, `senderUsername`, `createdAt`). **El cliente NO los puede falsificar** porque vienen del `socket.data.uid` validado.
- `io.to(roomId).emit(...)` — broadcast a **todos los sockets de la room, incluido el emisor**. Esto da confirmación visual al que envió ("se entregó").

> **Gap actual:** el mensaje no se persiste en Firestore. Si un usuario se une después, no ve los anteriores. Diseño objetivo de Sprint 1 en `flows.md §3.3`.

### 10.6 WebRTC signaling — `webrtc-offer`, `webrtc-answer`, `ice-candidate`

Los tres tienen el **mismo patrón**: el cliente envía un payload con `targetSocketId`, el servidor lo reenvía a ese socket destino agregándole `fromSocketId`.

```ts
socket.on("webrtc-offer", (payload: { targetSocketId: string; sdp: SdpPayload }) => {
  io.to(payload.targetSocketId).emit("webrtc-offer", {
    fromSocketId: socket.id,
    sdp: payload.sdp,
  });
});
```

Los otros dos (`webrtc-answer`, `ice-candidate`) son idénticos en estructura.

**¿Qué pasa aquí en realidad?**

Imagina que Alicia (`socket_A`) quiere llamar a Bob (`socket_B`):

```
Alicia: navigator.mediaDevices.getUserMedia({ video: true, audio: true })   ← cámara/mic
Alicia: pc = new RTCPeerConnection()
Alicia: pc.addTrack(...)                                                    ← agrega cámara/mic
Alicia: offer = await pc.createOffer()                                      ← genera SDP
Alicia: await pc.setLocalDescription(offer)

Alicia: socket.emit("webrtc-offer", { targetSocketId: "socket_B", sdp: offer })
                                                ↓
                              [BACKEND solo reenvía, no entiende SDP]
                                                ↓
Bob recibe: { fromSocketId: "socket_A", sdp: offer }
Bob: await pc.setRemoteDescription(offer)
Bob: answer = await pc.createAnswer()
Bob: await pc.setLocalDescription(answer)
Bob: socket.emit("webrtc-answer", { targetSocketId: "socket_A", sdp: answer })
                                                ↓
                              [BACKEND solo reenvía]
                                                ↓
Alicia recibe: { fromSocketId: "socket_B", sdp: answer }
Alicia: await pc.setRemoteDescription(answer)

[ahora ambos lados intercambian ICE candidates por el mismo canal,
 hasta que encuentran una ruta P2P viable]

[conexión P2P establecida — el audio/video fluye directo entre navegadores]
```

> **El backend nunca ve audio/video, solo metadata del handshake.** Esto es WebRTC al pie de la letra: el servidor existe **solo** para que dos navegadores que no se conocían encuentren cómo hablar entre sí.

**Compartir pantalla** (T4) no necesita un evento nuevo: el cliente usa `navigator.mediaDevices.getDisplayMedia()` en vez de `getUserMedia()` y reemplaza el track de video de la misma `RTCPeerConnection`. El handshake ya está hecho, no hay re-negociación a nivel de signaling.

### 10.7 `disconnect` — limpieza

```ts
socket.on("disconnect", async () => {
  const user = connectedUsers.get(socket.id);
  if (user?.roomId) {
    socket.to(user.roomId).emit("user-left", {
      uid: user.uid,
      username: user.username,
    });
  }
  connectedUsers.delete(socket.id);
  await authService.setUserOnlineStatus(uid, false);
  logger.info(`Socket desconectado: ${username} (${socket.id})`);
});
```

Cuando el cliente cierra la pestaña, pierde conexión o llama `socket.disconnect()`:

1. Si el socket estaba en una sala, avisa al resto con `user-left`.
2. Saca al socket del Map.
3. Marca `online: false` en Firestore.

> **Limitación conocida (`historias-tecnicas.md §2.7`):** si el usuario tiene dos pestañas abiertas, cerrar una marca `online: false` aunque la otra siga activa. Solución de Sprint 1: contador de sesiones por uid.

---

## 11. Los modelos — `src/models/`

Son **interfaces TypeScript**, no clases. Definen el shape exacto de cada documento Firestore. Nada de validación en runtime — eso lo hace el código que escribe.

### 11.1 `User.ts`

```ts
export interface User {
  uid: string;
  username: string;
  email: string;
  avatar: string;
  createdAt: FirebaseFirestore.Timestamp | Date;   // ← admite ambos al leer y al escribir
  online: boolean;
}
export const USERS_COLLECTION = "users";           // ← path Firestore: users/{uid}
```

`createdAt` admite `Timestamp | Date` porque cuando **escribimos** pasamos un `new Date()` y Firestore lo convierte a `Timestamp`; cuando **leemos** viene como `Timestamp`. La unión refleja la realidad de ambos extremos.

### 11.2 `Room.ts`

```ts
export interface Room {
  id: string;
  name: string;
  createdBy: string;          // ← uid del host
  participants: string[];     // ← uids con acceso
  createdAt: ...;
  isActive: boolean;          // ← soft-delete
}
export const ROOMS_COLLECTION = "rooms";
```

Reglas (todavía no implementadas, pero documentadas):

- Solo `createdBy` puede editar o borrar.
- Borrar = `isActive: false`, **no** delete real (para preservar mensajes históricos).

### 11.3 `Message.ts`

```ts
export interface Message {
  id: string;
  roomId: string;
  senderUid: string;
  senderUsername: string;     // ← denormalizado a propósito
  content: string;
  type: "text" | "system";
  createdAt: ...;
}
export const MESSAGES_COLLECTION = "messages";
```

**¿Por qué denormalizar `senderUsername` adentro del mensaje, si ya está en `users/{uid}`?**

Firestore no tiene JOIN. Si tuviéramos solo `senderUid`, al pintar 50 mensajes en el chat tendríamos que hacer 50 lecturas extra para obtener los usernames. Guardar el username **en el momento** del envío evita eso. Costo: si el usuario cambia username, los mensajes viejos siguen mostrando el viejo. Lo aceptamos.

---

## 12. Logger — `src/utils/logger.ts`

```ts
const timestamp = () => new Date().toISOString();

export const logger = {
  info:  (msg, ...args) => console.log(`[${timestamp()}] INFO: ${msg}`, ...args),
  warn:  (msg, ...args) => console.warn(`[${timestamp()}] WARN: ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[${timestamp()}] ERROR: ${msg}`, ...args),
};
```

Logger trivial. No usa una librería (Winston, Pino) porque en Sprint 0 no hace falta — `console.log` con timestamp basta. En Render los logs aparecen en el dashboard de "Logs" en tiempo real.

---

## 13. Cómo funciona el login con Google — el recorrido completo

Esta es probablemente la duda más típica: **¿cómo participa el backend si Google Auth es 100% frontend?**

### 13.1 Lado frontend (no es backend, pero hace falta entender)

`frontend/src/context/AuthContext.tsx`:

```ts
async loginWithGoogle() {
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  await ensureProfileExists(result.user.displayName, result.user.email);
}
```

Línea por línea:

1. `new GoogleAuthProvider()` — objeto que le dice a Firebase "voy a usar Google como proveedor".
2. `signInWithPopup(auth, provider)` — Firebase **abre una ventana popup** del propio Google (no nuestra, no de Firebase: la ventana de "Iniciar sesión con Google" oficial). El usuario elige cuenta, da consentimiento, y Google le devuelve a Firebase un token de identidad.
3. Firebase recibe ese token de Google, lo intercambia internamente con sus servidores y emite **su propio ID Token** (el JWT que usamos en backend). A partir de aquí, este token es indistinguible del que se obtiene con email/password.
4. `result.user.displayName` y `result.user.email` — datos que Google nos compartió (nombre y email de la cuenta de Google).
5. `ensureProfileExists(...)` — función que llama al backend.

### 13.2 `ensureProfileExists` — la única parte que toca al backend

```ts
async function ensureProfileExists(displayName, email) {
  try {
    await api.get("/auth/me");   // ¿ya tengo perfil?
    return;                      // sí, listo
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 404) throw err;
  }

  // no tengo perfil → registrar uno con username derivado
  const base = deriveUsername(displayName, email);
  for (let i = 0; i < 5; i++) {
    const candidate = i === 0 ? base : `${base}_${Math.floor(1000 + Math.random() * 9000)}`;
    try {
      await api.post("/auth/register", { username: candidate });
      return;
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) continue;  // username tomado, reintentar
      throw err;
    }
  }
}
```

Qué pasa **desde el punto de vista del backend**:

1. **Llega `GET /api/auth/me`** con `Authorization: Bearer <ID Token de Google>`.
2. `verifyToken` middleware verifica el JWT. Como Firebase ya lo firmó (no importa si vino de Google o email/password), pasa la verificación.
3. `authController.getMe` busca el perfil por uid.
4. Si **es la primera vez** que este usuario de Google entra: `users/{uid}` no existe → 404.
5. El frontend ve el 404 → llama `POST /api/auth/register` con un `username` derivado del email.
6. `authController.register` crea el doc `users/{uid}` con el username.
7. Si el username derivado ya estaba tomado (otro usuario de Google con el mismo email-prefix), el frontend reintenta hasta 5 veces agregando sufijos numéricos.

### 13.3 ¿Cómo distingue el backend "vino de Google" vs "vino de email/password"?

**No lo distingue**, y no le importa. El backend solo ve el JWT. Si quisiera saber el proveedor, podría leerlo del payload decodificado:

```ts
const decoded = await auth.verifyIdToken(token);
const provider = decoded.firebase.sign_in_provider;  // "google.com" | "password" | ...
```

Hoy no usamos ese campo. El día que se necesite (ej. requerir 2FA solo para password pero no para Google, o restringir registro por dominio corporativo), se lee de ahí.

### 13.4 Lo que obtiene el backend de Google, paso a paso

```
Usuario en frontend → clic en "Continuar con Google"
   ↓
Popup de google.com → usuario elige cuenta → da consentimiento
   ↓
Google envía un ID Token de Google a Firebase
   ↓
Firebase intercambia ese token y emite su propio ID Token (JWT)
   ↓
Frontend recibe el JWT y un objeto User con displayName, email, photoURL
   ↓
Frontend llama GET /api/auth/me con Authorization: Bearer <JWT>
   ↓
BACKEND:
   ↓ verifyToken middleware
   ↓   auth.verifyIdToken(JWT)  ← Firebase Admin valida firma + exp + audience
   ↓   decoded = { uid, email, firebase: { sign_in_provider: "google.com" }, ... }
   ↓   req.user = { uid, email }
   ↓
   ↓ authController.getMe
   ↓   authService.getUserProfile(uid)
   ↓     db.collection("users").doc(uid).get()
   ↓
   ↓ si existe → 200 { user }
   ↓ si no existe → 404 → frontend llama POST /auth/register
```

**Lo que el backend obtiene de Google** son **solo los campos que Firebase decidió poner en el JWT**: `uid`, `email`, `email_verified`, y el bloque `firebase.identities` con el id de Google (`112233...`) y el proveedor. **No** obtiene la foto de perfil, el nombre, ni nada que no esté en el token (esos campos viven en el objeto `User` del frontend, no en el JWT).

Si en algún momento se necesita la foto en backend, hay que enviarla explícitamente desde el frontend en el body del `register`.

---

## 14. Cómo funciona el chat — recorrido end-to-end

```
Alicia (en /room/abc123)
   ↓
socket.emit("send-message", { roomId: "abc123", content: "hola" })
   ↓
[viaja por WebSocket al backend]
   ↓
BACKEND (socketManager.ts:58-71):
   ↓ const { roomId, content } = payload
   ↓ message = { senderUid: socket.data.uid, senderUsername, content, roomId, createdAt: ... }
   ↓ io.to(roomId).emit("receive-message", message)
   ↓
[Socket.IO mira qué sockets están en la room "abc123"]
   ↓
   ↓ envía "receive-message" a Alicia (eco) y a Bob (que también está en abc123)
   ↓
Alicia recibe receive-message → pinta su propio mensaje (confirmación)
Bob    recibe receive-message → pinta mensaje entrante
```

Hoy **no** pasa por Firestore. Si Carlos entra a la sala 5 minutos después, **no ve** la conversación previa. Plan Sprint 1 (`flows.md §3.3`): persistir en `messages/{id}` antes del `emit` y emitir un `chat-history` con los últimos 50 al hacer `join-room`.

---

## 15. Cómo funciona el logout

No hay un endpoint `POST /api/auth/logout` en el backend. **No hace falta**, porque el backend es stateless.

Lo que sí pasa:

1. Frontend: `disconnectSocket()` → `socket.disconnect()`.
2. Socket.IO en backend recibe el `disconnect` → `socketManager.ts:107-118`:
   - Emite `user-left` a la sala (si estaba en una).
   - Saca al socket del Map.
   - `setUserOnlineStatus(uid, false)` → Firestore actualiza `users/{uid}.online`.
3. Frontend: `signOut(auth)` → Firebase Auth borra el ID Token de IndexedDB del navegador.
4. `onAuthStateChanged` dispara con `null`.
5. `AuthContext.user` pasa a `null`.
6. `ProtectedRoute` detecta `!user` → `<Navigate to="/login" />`.

El JWT viejo, técnicamente, seguiría siendo válido por hasta 1 hora (es un JWT autocontenido, no se "expira" desde el servidor). Si nos importara forzar su invalidación, llamaríamos `authService.revokeUserTokens(uid)` y configuraríamos `verifyIdToken(token, true)` con `checkRevoked: true`.

---

## 16. Errores y códigos HTTP

| Código | Cuándo lo devolvemos                                      | Dónde está el código                                |
|--------|-----------------------------------------------------------|------------------------------------------------------|
| 200    | Éxito en GET                                              | controllers                                          |
| 201    | Recurso creado (register)                                  | `authController.ts:27`                               |
| 400    | Body inválido o username tomado                            | `authController.ts:17,31`                            |
| 401    | Sin token o token inválido/expirado                        | `authMiddleware.ts:20,31`                            |
| 404    | Perfil no existe en Firestore                              | `authController.ts:44`                               |
| 500    | Error inesperado en el servidor                            | `authController.ts:49,63`                            |

Todos los errores siguen el mismo shape:

```json
{ "error": "Mensaje legible en español" }
```

Esa uniformidad permite al frontend tener un solo handler de errores y leerlo directamente en un `role="alert"` para lectores de pantalla (ver `historias-tecnicas.md §4`).

---

## 17. Resumen — el ciclo de vida de una request

Una `POST /api/auth/register` punta a punta:

```
1.  cliente:   fetch("/api/auth/register", { method:"POST", headers:{ Authorization:"Bearer <JWT>" }, body:{ username:"juanp" } })
2.  Express:   recibe en /api → router maestro → /auth → router de auth → POST /register
3.  middleware verifyToken:
       headers.authorization existe? ✓
       split "Bearer " → "eyJhbGc..."
       auth.verifyIdToken(token)
          ↓ contacta Google, valida firma+exp+audience
          ↓ devuelve decoded = { uid:"abc", email:"juan@gmail.com", ... }
       req.user = { uid:"abc", email:"juan@gmail.com" }
       next()
4.  controller register:
       extrae { username:"juanp" } del body
       valida username presente ✓
       llama authService.registerUserProfile("abc", "juanp", "juan@gmail.com")
          ↓ isUsernameTaken("juanp") → query Firestore → false
          ↓ construye User { uid:"abc", username:"juanp", email, avatar:"default_avatar.png", createdAt:Date, online:false }
          ↓ db.collection("users").doc("abc").set(newUser)  ← escribe Firestore
          ↓ devuelve newUser
       res.status(201).json({ user: newUser })
5.  cliente recibe 201 { user:{...} }
```

Y eso es todo lo que hace el backend, multiplicado por sus 3 endpoints REST y sus 7 eventos Socket.IO.

---

## 18. Mapa mental — qué archivo importa de dónde

```
server.ts
 ├─ app.ts
 │   ├─ config/env.ts                ← env vars
 │   ├─ config/swagger.ts             ← OpenAPI spec
 │   └─ routes/index.ts
 │       └─ routes/authRoutes.ts
 │           ├─ middlewares/authMiddleware.ts
 │           │   └─ config/firebase.ts  ← admin.auth()
 │           └─ controllers/authController.ts
 │               └─ services/authService.ts
 │                   ├─ config/firebase.ts  ← admin.firestore() + admin.auth()
 │                   ├─ models/User.ts
 │                   └─ utils/logger.ts
 ├─ config/firebase.ts                ← inicializa Admin SDK al ser importado
 ├─ sockets/socketManager.ts
 │   ├─ config/firebase.ts            ← admin.auth() para verifyIdToken
 │   ├─ services/authService.ts       ← getUserProfile, setUserOnlineStatus
 │   └─ utils/logger.ts
 └─ utils/logger.ts
```

Ningún archivo de servicios o middlewares importa de Express directamente — solo los controllers y middlewares lo hacen. Ningún archivo de modelos importa nada del SDK — son interfaces puras.

---

## 19. ¿Y si algo se rompe? — checklist de debug

| Síntoma                                          | Causa probable                                       | Dónde mirar                                |
|--------------------------------------------------|------------------------------------------------------|--------------------------------------------|
| Arranca pero `firebase-admin` da "App not initialized" | Variables `FIREBASE_ADMIN_*` ausentes o `private_key` mal escapada | `config/env.ts`, `config/firebase.ts`     |
| 401 en todas las requests                        | Token expirado o frontend olvidó el header           | DevTools → Network → Headers              |
| 404 en `/api/auth/me` justo después de signUp con Google | Falta crear el perfil (`ensureProfileExists` falló) | Frontend `AuthContext.tsx`                |
| Socket no conecta — error "Token requerido"      | Cliente no pasó `auth: { token }` en `io(...)`       | Frontend `services/socket.ts`             |
| Socket conecta pero `online` se queda en `false` | `setUserOnlineStatus` falló (revisar permisos Firestore) | Logs del backend                       |
| Mensajes no llegan a otros usuarios              | No están en la misma room — falta `join-room`        | Cliente: ¿emite `join-room`?              |
| Llamada WebRTC no establece                      | NAT simétrico, falta TURN                            | Configurar `iceServers` en cliente        |
| CORS bloquea las requests                        | `CORS_ORIGIN` no coincide con el dominio del frontend | `.env` → `CORS_ORIGIN`                    |
| Render no arranca tras deploy                    | Variables de entorno sin setear en el dashboard      | Render dashboard → Environment            |

Si nada de lo anterior aplica: los logs del backend (`logger.info/.warn/.error`) son la primera fuente de verdad. En Render aparecen en tiempo real en el tab "Logs".
