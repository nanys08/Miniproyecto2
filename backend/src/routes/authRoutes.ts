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
 *         description: Username faltante o ya en uso
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
