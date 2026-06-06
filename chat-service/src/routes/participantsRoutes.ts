/**
 * @file participantsRoutes — Ruta REST de participantes activos (Tarea 9).
 */

import { Router } from "express";
import * as participantsController from "../controllers/participantsController";

const router = Router();

/**
 * @openapi
 * /participants:
 *   get:
 *     tags: [Participantes]
 *     summary: Lista de participantes conectados ahora mismo en una sala
 *     description: |
 *       Devuelve los **usernames** con una conexión WebSocket activa en la
 *       sala indicada. Es la foto en vivo de la presencia (Tarea 9), no la
 *       lista histórica de miembros (esa vive en el room-service).
 *
 *       Si la sala no existe o no tiene a nadie conectado, devuelve `[]`.
 *     parameters:
 *       - in: query
 *         name: roomId
 *         required: true
 *         schema: { type: string }
 *         description: ID de la sala.
 *         example: "123"
 *     responses:
 *       200:
 *         description: Array de usernames conectados.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { type: string }
 *             example: ["Juan", "Ana"]
 *       400:
 *         description: Falta el query param `roomId`.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               success: false
 *               error: MISSING_FIELDS
 *               message: Falta el query param roomId
 */
router.get("/participants", participantsController.getParticipants);

export default router;
