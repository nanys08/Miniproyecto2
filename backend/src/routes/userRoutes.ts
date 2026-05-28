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
 *     tags: [Users]
 *     summary: Perfil público de cualquier usuario
 *     description: |
 *       Devuelve la versión **pública** del perfil del usuario identificado
 *       por `uid`. Pensado para que un participante de sala resuelva el
 *       avatar y username de los demás sin exponer datos sensibles.
 *
 *       Whitelist explícita: el response solo incluye `uid`, `username`,
 *       `displayName` y `avatar`. **Nunca** se filtran `email`, `phone`
 *       ni metadatos internos de Firebase, aunque el documento Firestore
 *       los tenga.
 *
 *       Si el `uid` está autenticado en Firebase Auth pero todavía no tiene
 *       perfil en Firestore (caso del primer login con Google antes de
 *       completar el registro), responde **404 PROFILE_NOT_FOUND**.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: uid
 *         required: true
 *         schema: { type: string }
 *         description: UID Firebase del usuario a consultar.
 *         example: "wM1uS9k...abc"
 *     responses:
 *       200:
 *         description: Perfil público encontrado.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/PublicUser'
 *       400:
 *         description: UID ausente o vacío.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: Perfil no encontrado en Firestore.
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
router.get("/:uid", verifyToken, userController.getPublicProfile);

export default router;
