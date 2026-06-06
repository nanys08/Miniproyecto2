/**
 * @file internalRoutes — Rutas service-to-service del room-service.
 *
 * Las llama el chat-service (Repositorio 2). Protegidas con el secreto
 * compartido (`X-Internal-Secret`). Base: `/internal`.
 */

import { Router } from "express";
import { verifyInternalSecret } from "../middlewares/internalAuth";
import * as internalController from "../controllers/internalController";

const router = Router();

router.use(verifyInternalSecret);

/**
 * @openapi
 * /internal/rooms/{roomId}/messages:
 *   post:
 *     tags: [Interno]
 *     summary: (chat-service) Persiste un mensaje de chat en Firestore
 *     description: |
 *       La llama el **chat-service** cuando recibe un mensaje por WebSocket
 *       (Tarea 6): el backend principal guarda el mensaje en la subcolección
 *       `rooms/{roomId}/messages` y devuelve el documento persistido (con
 *       `id` y `createdAt` del servidor) para que el chat-service lo difunda
 *       como mensaje canónico.
 *
 *       Requiere el header `X-Internal-Secret`.
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema: { type: string }
 *         example: "123"
 *       - in: header
 *         name: X-Internal-Secret
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, content]
 *             properties:
 *               username: { type: string, example: "Juan" }
 *               content: { type: string, example: "Hola" }
 *               uid: { type: string, example: "abc123" }
 *     responses:
 *       201:
 *         description: Mensaje persistido.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   $ref: '#/components/schemas/Message'
 *       400:
 *         description: Faltan `username` o `content`.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Secreto interno ausente o inválido.
 *       404:
 *         description: La sala no existe.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post("/rooms/:roomId/messages", internalController.saveMessage);

export default router;
