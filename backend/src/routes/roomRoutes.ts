/**
 * @file roomRoutes — Rutas REST para el dominio de salas de estudio.
 *
 * Todas las rutas requieren autenticación (`verifyToken`).
 * Base: `/api/rooms`
 */

import { Router } from "express";
import { verifyToken } from "../middlewares/authMiddleware";
import * as roomController from "../controllers/roomController";

const router = Router();

/**
 * @openapi
 * /api/rooms:
 *   post:
 *     tags: [Rooms]
 *     summary: Crea una nueva sala de estudio
 *     description: |
 *       Crea un documento `rooms/{roomId}` en Firestore con un ID único
 *       auto-generado. El usuario autenticado queda como `ownerId` y primer
 *       participante de la sala.
 *
 *       Validaciones:
 *       - `name` es obligatorio, no puede estar vacío y máximo 100 caracteres.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateRoomRequest'
 *           example:
 *             name: Sala Matemáticas
 *     responses:
 *       201:
 *         description: Sala creada correctamente.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 room:
 *                   $ref: '#/components/schemas/Room'
 *       400:
 *         description: Nombre inválido o vacío.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: ROOM_NAME_INVALID
 *               message: El nombre de la sala es inválido o está vacío
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.post("/", verifyToken, roomController.createRoom);

/**
 * @openapi
 * /api/rooms:
 *   get:
 *     tags: [Rooms]
 *     summary: Lista las salas del usuario autenticado
 *     description: |
 *       Devuelve las salas donde el usuario es `ownerId`,
 *       ordenadas de más reciente a más antigua.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de salas (vacía si no tiene ninguna).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 rooms:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Room'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get("/", verifyToken, roomController.getRooms);

/**
 * @openapi
 * /api/rooms/{roomId}:
 *   get:
 *     tags: [Rooms]
 *     summary: Obtiene una sala por ID
 *     description: |
 *       Devuelve el documento de una sala específica. Útil para unirse a
 *       salas compartidas por enlace.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID único de la sala (generado por Firestore).
 *         example: abc123XYZ
 *     responses:
 *       200:
 *         description: Datos de la sala.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 room:
 *                   $ref: '#/components/schemas/Room'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: Sala no encontrada.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: ROOM_NOT_FOUND
 *               message: Sala no encontrada
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get("/:roomId", verifyToken, roomController.getRoomById);

/**
 * @openapi
 * /api/rooms/{roomId}:
 *   delete:
 *     tags: [Rooms]
 *     summary: Elimina una sala (solo el dueño)
 *     description: |
 *       Elimina el documento `rooms/{roomId}` de Firestore.
 *       Solo puede ejecutarla el usuario cuyo `uid` coincide con `ownerId`.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID único de la sala.
 *     responses:
 *       204:
 *         description: Sala eliminada correctamente (sin body).
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: El usuario no es el dueño de la sala.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Sala no encontrada.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.delete("/:roomId", verifyToken, roomController.deleteRoom);

export default router;
