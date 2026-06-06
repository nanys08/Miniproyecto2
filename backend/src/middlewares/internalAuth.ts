/**
 * @file internalAuth — Protege las rutas internas service-to-service.
 *
 * El chat-service (Repositorio 2) llama a `/internal/*` del room-service para
 * persistir mensajes (Tarea 6). Esas rutas NO son para el frontend; se
 * protegen con el secreto compartido en el header `X-Internal-Secret`
 * (el mismo `INTERNAL_SECRET` usado para firmar los tickets de conexión).
 *
 * En desarrollo, si el secreto no está configurado, dejamos pasar pero
 * registramos una advertencia (para no bloquear pruebas locales rápidas).
 */

import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";
import { buildError, ErrorCode } from "../utils/errors";
import { logger } from "../utils/logger";

export const verifyInternalSecret = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const secret = env.chatService.internalSecret;
  if (!secret) {
    logger.warn(
      "INTERNAL_SECRET no configurado — ruta interna aceptada sin verificar (solo desarrollo)"
    );
    next();
    return;
  }

  const provided = req.header("X-Internal-Secret");
  if (provided !== secret) {
    logger.warn(`Llamada interna rechazada a ${req.path}: secreto inválido`);
    res.status(401).json(buildError(ErrorCode.INVALID_TOKEN, "Llamada interna no autorizada"));
    return;
  }
  next();
};
