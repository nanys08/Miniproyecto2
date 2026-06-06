/**
 * @file internalAuth — Protege las rutas internas service-to-service.
 *
 * El room-service (Repositorio 1) llama a `/internal/*` para "informar al
 * WebSocket" (Tarea 5). Esas rutas NO son para el frontend; las protegemos
 * con un secreto compartido en el header `X-Internal-Secret`.
 *
 * En desarrollo, si `INTERNAL_SECRET` no está configurado, dejamos pasar pero
 * registramos una advertencia (para no bloquear pruebas locales rápidas).
 */

import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";
import { ErrorCode, buildError } from "../utils/errors";
import { logger } from "../utils/logger";

export const verifyInternalSecret = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!env.internalSecret) {
    logger.warn(
      "INTERNAL_SECRET no configurado — ruta interna aceptada sin verificar (solo desarrollo)"
    );
    next();
    return;
  }

  const provided = req.header("X-Internal-Secret");
  if (provided !== env.internalSecret) {
    logger.warn(`Llamada interna rechazada a ${req.path}: secreto inválido`);
    res
      .status(401)
      .json(buildError(ErrorCode.UNAUTHORIZED_INTERNAL));
    return;
  }
  next();
};
