import { Router } from "express";
import { verifyToken } from "../middlewares/authMiddleware";
import * as authController from "../controllers/authController";

const router = Router();

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Crea el perfil del usuario en Firestore
 *     description: |
 *       Crea el documento `users/{uid}` a partir del UID y email del Firebase ID Token.
 *       El cliente ya debe haberse autenticado con Firebase Auth (signup) antes de llamar.
 *       Valida que `username` no esté tomado por otro usuario.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
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
 *         description: Campos faltantes o con formato inválido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Token ausente o inválido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: Username ya en uso o perfil ya existe
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post("/register", verifyToken, authController.register);

/**
 * @openapi
 * /api/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Obtiene el perfil del usuario autenticado
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
 *         description: Token ausente o inválido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: El UID no tiene perfil en Firestore (registro incompleto)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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
 *         description: Token ausente o inválido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post("/logout", verifyToken, authController.logout);

/**
 * @openapi
 * /api/auth/check-username/{username}:
 *   get:
 *     tags: [Auth]
 *     summary: Verifica si un username está disponible
 *     description: Endpoint público. Útil para validación en tiempo real durante el signup.
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
 *               type: object
 *               properties:
 *                 available:
 *                   type: boolean
 *                   example: true
 */
router.get("/check-username/:username", authController.checkUsername);

export default router;
