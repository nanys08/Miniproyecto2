/**
 * @file internalRoutes — Rutas service-to-service usadas por el room-service
 * para informar al WebSocket (Tarea 5). Protegidas por secreto compartido.
 *
 * No están pensadas para el frontend: se documentan en Swagger bajo el tag
 * `Interno` para que quede constancia del contrato entre ambos repos.
 */

import { Router } from "express";
import { verifyInternalSecret } from "../middlewares/internalAuth";
import * as internalController from "../controllers/internalController";

const router = Router();

router.use(verifyInternalSecret);

/**
 * @openapi
 * /internal/rooms/notify-join:
 *   post:
 *     tags: [Interno]
 *     summary: (room-service) Avisa que un usuario validado entró a una sala
 *     description: |
 *       Lo llama el **room-service** después de validar la sala y la membresía
 *       del usuario. Marca la sala como activa en el chat-service para que el
 *       handshake WebSocket correspondiente sea aceptado (Tarea 5).
 *
 *       Requiere el header `X-Internal-Secret`.
 *     parameters:
 *       - in: header
 *         name: X-Internal-Secret
 *         required: true
 *         schema: { type: string }
 *         description: Secreto compartido entre room-service y chat-service.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [roomId]
 *             properties:
 *               roomId: { type: string, example: "123" }
 *               roomName: { type: string, example: "Matemáticas" }
 *               username: { type: string, example: "Juan" }
 *               uid: { type: string, example: "abc123" }
 *     responses:
 *       200:
 *         description: Sala marcada como activa.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 *                 roomId: { type: string, example: "123" }
 *                 participants:
 *                   type: array
 *                   items: { type: string }
 *                   example: ["Juan"]
 *       400:
 *         description: Falta `roomId`.
 *       401:
 *         description: Secreto interno ausente o inválido.
 */
router.post("/rooms/notify-join", internalController.notifyJoin);

/**
 * @openapi
 * /internal/rooms/notify-closed:
 *   post:
 *     tags: [Interno]
 *     summary: (room-service) Avisa que una sala fue eliminada — cerrar conexiones
 *     description: |
 *       Lo llama el **room-service** tras `DELETE /api/rooms/{roomId}`. El
 *       chat-service cierra todas las conexiones WebSocket activas de esa sala
 *       y la marca como cerrada para rechazar reconexiones (Tarea 5).
 *
 *       Requiere el header `X-Internal-Secret`.
 *     parameters:
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
 *             required: [roomId]
 *             properties:
 *               roomId: { type: string, example: "123" }
 *     responses:
 *       200:
 *         description: Conexiones cerradas.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 *                 roomId: { type: string, example: "123" }
 *                 closedConnections: { type: integer, example: 2 }
 *       400:
 *         description: Falta `roomId`.
 *       401:
 *         description: Secreto interno ausente o inválido.
 */
router.post("/rooms/notify-closed", internalController.notifyClosed);

export default router;
