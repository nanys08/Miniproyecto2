/**
 * @file internalController — Endpoints service-to-service del room-service.
 *
 * Los consume el chat-service (Repositorio 2). Hoy cubre la **persistencia de
 * mensajes** (Tarea 6): el chat-service recibe un mensaje por WebSocket y se lo
 * delega aquí para guardarlo en Firestore, manteniendo toda la lógica de base
 * de datos en el backend principal (el chat-service no necesita Firebase).
 */

import { Request, Response } from "express";
import * as messageService from "../services/messageService";
import { AppError, buildError, ErrorCode, mapFirestoreError } from "../utils/errors";
import { logger } from "../utils/logger";

/**
 * **POST /internal/rooms/:roomId/messages** — Persiste un mensaje de chat.
 *
 * Body: `{ username, content, uid? }`.
 * Respuesta: `{ message }` con el documento persistido (incluye `id` y
 * `createdAt` reales, para que el chat-service los difunda como mensaje
 * canónico). Proceso de la Tarea 2: llega → guarda → confirma (la confirmación
 * es esta respuesta 200).
 */
export const saveMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { roomId } = req.params as { roomId: string };
    const { username, content, uid } = (req.body ?? {}) as {
      username?: string;
      content?: string;
      uid?: string;
    };

    if (!username || typeof username !== "string" || !content || typeof content !== "string") {
      res.status(400).json(buildError(ErrorCode.MISSING_FIELDS));
      return;
    }

    const message = await messageService.saveMessage({
      roomId,
      // El chat-service autentica vía ticket; el uid puede no venir en modo
      // desarrollo, en cuyo caso usamos el username como identificador.
      senderUid: uid && uid.trim() ? uid : username,
      senderUsername: username,
      content,
      type: "text",
    });

    res.status(201).json({ message });
  } catch (err) {
    if (err instanceof AppError) {
      res.status(err.status).json(buildError(err.code, err.message));
      return;
    }
    const mapped = mapFirestoreError(err);
    if (mapped) {
      logger.warn("[internal.saveMessage] Firestore error mapeado", err);
      res.status(mapped.status).json(buildError(mapped.code, mapped.message));
      return;
    }
    logger.error("[internal.saveMessage] error interno", err);
    res.status(500).json(buildError(ErrorCode.INTERNAL_ERROR));
  }
};
