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
 *           - `USERNAME_INVALID`
 *           - `USERNAME_FORBIDDEN`
 *           - `PROVIDER_INVALID`
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       409:
 *         description: Username ya en uso o perfil ya existe.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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
 *   patch:
 *     tags: [Auth]
 *     summary: Actualiza los campos editables del perfil
 *     description: |
 *       Actualiza uno o más de los campos editables del documento `users/{uid}`:
 *       `username`, `fullName` y/o `avatar`. Los campos inmutables (`uid`,
 *       `email`, `provider`, `createdAt`) son ignorados aunque vengan en el body.
 *
 *       Al menos uno de los tres campos editables debe estar presente.
 *
 *       Si se cambia el `username`, la operación corre dentro de una
 *       **transacción Firestore** para garantizar unicidad atómica.
 *       Si el nuevo `username` ya lo usa otro usuario se devuelve
 *       `409 USERNAME_ALREADY_EXISTS`. Si el `username` enviado coincide
 *       con el actual del usuario, no se valida unicidad contra terceros
 *       (la operación es idempotente para ese campo).
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateProfileRequest'
 *           examples:
 *             cambiarUsername:
 *               summary: Solo username
 *               value:
 *                 username: nuevo_user
 *             cambiarTodo:
 *               summary: Username + nombre + avatar
 *               value:
 *                 username: nuevo_user
 *                 fullName: Juan P. Actualizado
 *                 avatar: /avatars/avatar3.png
 *             soloAvatar:
 *               summary: Solo avatar
 *               value:
 *                 avatar: /avatars/avatar5.png
 *     responses:
 *       200:
 *         description: Perfil actualizado correctamente
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
 *           - `MISSING_FIELDS` — ningún campo editable presente, o `fullName` vacío.
 *           - `USERNAME_INVALID` — `username` no cumple regex 4-10.
 *           - `USERNAME_FORBIDDEN` — `username` contiene palabra prohibida.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: Perfil no encontrado (no debería ocurrir si el flujo es correcto).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: El nuevo username ya está en uso por otro usuario.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: USERNAME_ALREADY_EXISTS
 *               message: "El nombre de usuario ya está en uso"
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *   delete:
 *     tags: [Auth]
 *     summary: Elimina la cuenta del usuario de forma definitiva
 *     description: |
 *       Elimina la cuenta completa del usuario autenticado:
 *       1. Borra el documento `users/{uid}` de Firestore.
 *       2. Borra el usuario de Firebase Authentication (invalida todos los tokens).
 *
 *       **Esta operación es irreversible.** No existe endpoint de recuperación.
 *
 *       El frontend debe llamar además a `firebase.auth().signOut()` después
 *       de recibir el 204 para limpiar el estado local del SDK.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       204:
 *         description: Cuenta eliminada correctamente (sin body)
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: Perfil no encontrado en Firestore.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get("/me", verifyToken, authController.getMe);
router.patch("/me", verifyToken, authController.updateMe);
router.delete("/me", verifyToken, authController.deleteMe);

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
 *       durante el formulario de registro y de edición de perfil.
 *
 *       **Nota para edición de perfil:** este endpoint solo reporta si el username
 *       existe en la colección. Si el usuario envía su propio username actual,
 *       aparecerá como `available: false`. El frontend debe omitir esa validación
 *       cuando el username no ha cambiado respecto al actual del usuario.
 *
 *       Si el username contiene una palabra prohibida se reporta como
 *       `{ available: false }` — no como error 400.
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
 *       400:
 *         description: El path param no cumple la regex.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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
 *       400:
 *         description: Email con formato inválido.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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
 *       400:
 *         description: Email con formato inválido.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get("/is-univalle/:email", authController.checkUnivalle);

export default router;
