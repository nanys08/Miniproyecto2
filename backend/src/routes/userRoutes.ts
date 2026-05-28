/**
 * @file userRoutes — Rutas REST para lectura de perfiles de otros usuarios.
 * Base: `/api/users`. Todas requieren autenticación.
 */

import { Router } from "express";
import { verifyToken } from "../middlewares/authMiddleware";
import * as userController from "../controllers/userController";

const router = Router();

/**
 * @openapi
 * /api/users/{uid}:
 *   get:
 *     tags: [Auth]
 *     summary: Perfil público de cualquier usuario (autenticado)
 *     description: |
 *       Devuelve los campos seguros del perfil de un usuario por su `uid`.
 *       Pensado para que un participante de sala pueda resolver el avatar
 *       y username de los demás. **No** expone email ni teléfono.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: uid
 *         required: true
 *         schema: { type: string }
 *         description: UID Firebase del usuario a consultar.
 *     responses:
 *       200:
 *         description: Perfil público.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                   required: [uid, username, avatar]
 *                   properties:
 *                     uid:         { type: string, example: "abc123" }
 *                     username:    { type: string, example: "juanp" }
 *                     displayName: { type: string, example: "Juan Pérez" }
 *                     avatar:      { type: string, example: "/avatars/avatar1.png" }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: Perfil no encontrado.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get("/:uid", verifyToken, userController.getPublicProfile);

export default router;
