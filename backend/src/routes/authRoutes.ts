import { Router } from "express";
import { verifyToken } from "../middlewares/authMiddleware";
import * as authController from "../controllers/authController";

const router = Router();

/**
 * @openapi
 * /api/auth/login:
 *   get:
 *     tags: [Auth]
 *     summary: "(Informativo) Login NO es un endpoint REST"
 *     description: |
 *       **El backend no expone un endpoint de login.** La autenticación con
 *       email/password y con Google ocurre 100 % en el cliente usando el SDK
 *       de Firebase:
 *
 *       - **Email/Password:** `signInWithEmailAndPassword(auth, email, password)`
 *         devuelve un `idToken` que el frontend envía al backend como
 *         `Authorization: Bearer <idToken>` en cada request privada.
 *       - **Google:** `signInWithPopup(auth, new GoogleAuthProvider())` con el
 *         mismo resultado.
 *
 *       Tras el login del cliente, el flujo típico es:
 *
 *       1. `GET /api/auth/me` con el ID Token.
 *          - `200` → usuario ya tiene perfil en Firestore.
 *          - `404 PROFILE_NOT_FOUND` → necesita completar registro
 *            (`POST /api/auth/register`).
 *
 *       Este endpoint no existe — se documenta aquí solo para evitar
 *       confusiones a quien busque "/login" en Swagger.
 *     responses:
 *       404:
 *         description: "No existe — usar `signInWithEmailAndPassword` en el cliente."
 *     deprecated: true
 */

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Crea el perfil del usuario en Firestore
 *     description: |
 *       Crea el documento `users/{uid}` a partir del UID y email del Firebase ID Token.
 *       El cliente ya debe haberse autenticado con Firebase Auth (signup) antes de llamar.
 *
 *       Validaciones aplicadas en orden:
 *       1. Campos obligatorios presentes (`username`, `fullName`, `provider`).
 *       2. `username` cumple la regex `^[a-zA-Z0-9_.]{4,10}$`.
 *       3. `username` no aparece en la lista negra de palabras prohibidas
 *          (`USERNAME_FORBIDDEN`). Ver `src/utils/profanity.ts`.
 *       4. `provider` es `"password"` o `"google"`.
 *       5. En transacción Firestore: el `uid` no tiene perfil aún
 *          (`PROFILE_ALREADY_EXISTS`) y el `username` no está tomado
 *          (`USERNAME_ALREADY_EXISTS`).
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *           examples:
 *             passwordSignup:
 *               summary: Registro Email/Password
 *               value:
 *                 username: juanp
 *                 fullName: Juan Pérez
 *                 provider: password
 *                 avatar: /avatars/avatar1.png
 *             googleSignup:
 *               summary: Primer login con Google (completar perfil)
 *               value:
 *                 username: juanp
 *                 fullName: Juan Pérez
 *                 provider: google
 *                 avatar: https://lh3.googleusercontent.com/a/...
 *     responses:
 *       201:
 *         description: Perfil creado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: |
 *           Validación falló. Códigos posibles:
 *           - `MISSING_FIELDS`
 *           - `USERNAME_INVALID` (no cumple regex 4-10)
 *           - `USERNAME_FORBIDDEN` (contiene palabra prohibida)
 *           - `PROVIDER_INVALID`
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               usernameInvalid:
 *                 value:
 *                   error: USERNAME_INVALID
 *                   message: "username inválido: 4-10 caracteres, solo letras, números, punto y guion bajo"
 *               usernameForbidden:
 *                 value:
 *                   error: USERNAME_FORBIDDEN
 *                   message: "Ese nombre de usuario no está permitido"
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       409:
 *         description: Username ya en uso o perfil ya existe.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               usernameTaken:
 *                 value:
 *                   error: USERNAME_ALREADY_EXISTS
 *                   message: "El nombre de usuario ya está en uso"
 *               profileExists:
 *                 value:
 *                   error: PROFILE_ALREADY_EXISTS
 *                   message: "El perfil ya existe para este usuario"
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.post("/register", verifyToken, authController.register);

/**
 * @openapi
 * /api/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Obtiene el perfil del usuario autenticado
 *     description: |
 *       Devuelve el documento `users/{uid}` correspondiente al UID extraído
 *       del Firebase ID Token. Útil tras el login del cliente para decidir
 *       si redirigir al dashboard (200) o al flujo de completar perfil (404).
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Perfil encontrado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: |
 *           El UID está autenticado en Firebase pero no tiene perfil en
 *           Firestore. Caso típico: primer login con Google antes de
 *           llamar a `POST /api/auth/register`.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: PROFILE_NOT_FOUND
 *               message: "Perfil no encontrado"
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get("/me", verifyToken, authController.getMe);

/**
 * @openapi
 * /api/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Cierra sesión server-side (revoca todos los refresh tokens)
 *     description: |
 *       Revoca los refresh tokens del usuario y lo marca offline en Firestore.
 *       El frontend debería además llamar a `firebase.auth().signOut()` localmente
 *       para limpiar el estado del SDK cliente.
 *
 *       Útil para "cerrar sesión en todos los dispositivos". Tras esta llamada,
 *       cualquier ID Token previamente emitido será rechazado por `verifyToken`
 *       (porque el middleware usa `checkRevoked: true`).
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       204:
 *         description: Sesión cerrada
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.post("/logout", verifyToken, authController.logout);

/**
 * @openapi
 * /api/auth/check-username/{username}:
 *   get:
 *     tags: [Auth]
 *     summary: Verifica si un username está disponible (público)
 *     description: |
 *       Endpoint **público** (sin token). Útil para validación en tiempo real
 *       durante el formulario de registro.
 *
 *       Si el username contiene una palabra prohibida (lista negra), se
 *       reporta como `{ available: false }` — no como error 400 — para que
 *       el frontend pinte el mismo estado de "ya en uso" sin lógica nueva.
 *       Si quieres distinguir ambos casos, usa `POST /register` que sí
 *       devuelve `USERNAME_FORBIDDEN`.
 *     parameters:
 *       - in: path
 *         name: username
 *         required: true
 *         schema:
 *           type: string
 *         example: juanp
 *     responses:
 *       200:
 *         description: Resultado de disponibilidad
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CheckResponse'
 *             examples:
 *               available:
 *                 value: { available: true }
 *               takenOrForbidden:
 *                 value: { available: false }
 *       400:
 *         description: El path param no cumple la regex.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: USERNAME_INVALID
 *               message: "username inválido: 4-10 caracteres, solo letras, números, punto y guion bajo"
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get("/check-username/:username", authController.checkUsername);

/**
 * @openapi
 * /api/auth/check-email/{email}:
 *   get:
 *     tags: [Auth]
 *     summary: Verifica si un correo ya está registrado en Firebase Auth (público)
 *     description: |
 *       Endpoint **público** (sin token). Permite al frontend detectar antes
 *       del signup si el correo ya tiene cuenta y mostrar un mensaje claro
 *       ("Ese correo ya está registrado") en vez del genérico de error.
 *
 *       Implementación: usa `admin.auth().getUserByEmail(email)`. Si Firebase
 *       responde `auth/user-not-found`, devolvemos `available: true`.
 *     parameters:
 *       - in: path
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *           format: email
 *         example: juan@example.com
 *     responses:
 *       200:
 *         description: Resultado de disponibilidad
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CheckResponse'
 *             examples:
 *               libre:
 *                 value: { available: true }
 *               registrado:
 *                 value: { available: false }
 *       400:
 *         description: Email con formato inválido.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: EMAIL_INVALID
 *               message: "Correo electrónico inválido"
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get("/check-email/:email", authController.checkEmail);

/**
 * @openapi
 * /api/auth/is-univalle/{email}:
 *   get:
 *     tags: [Auth]
 *     summary: Identifica si un correo es del dominio institucional Univalle (público)
 *     description: |
 *       Endpoint **público** (sin token). Devuelve si el correo pertenece a
 *       `@correounivalle.edu.co`. Útil para que el frontend muestre un
 *       badge "Estudiante Univalle" en el formulario de registro mientras
 *       el usuario escribe el correo.
 *
 *       Política actual: solo identifica, **no restringe** registro.
 *     parameters:
 *       - in: path
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *           format: email
 *         example: ana.perez@correounivalle.edu.co
 *     responses:
 *       200:
 *         description: Identificación realizada.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnivalleResponse'
 *             examples:
 *               univalle:
 *                 value:
 *                   isUnivalle: true
 *                   domain: correounivalle.edu.co
 *               externo:
 *                 value:
 *                   isUnivalle: false
 *                   domain: correounivalle.edu.co
 *       400:
 *         description: Email con formato inválido.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: EMAIL_INVALID
 *               message: "Correo electrónico inválido"
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get("/is-univalle/:email", authController.checkUnivalle);

export default router;
