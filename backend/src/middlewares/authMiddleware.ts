/**
 * @file authMiddleware — Verificación de Firebase ID Tokens en requests REST.
 *
 * Mantiene una superficie mínima: una sola función `verifyToken` que se
 * aplica como middleware Express en rutas privadas. Si pasa, deja en
 * `req.user` el `uid` y `email` extraídos del token.
 *
 * Diseño:
 *  - `checkRevoked: true` para que `revokeUserTokens` tenga efecto inmediato
 *    sin esperar a que expire el token (≤ 1h).
 *  - Nunca se filtra al cliente el mensaje original de Firebase (puede
 *    contener UID, project ID, etc.). Solo el código estable.
 */

import { Request, Response, NextFunction } from "express";
import { auth } from "../config/firebase";
import { buildError, ErrorCode } from "../utils/errors";
import { logger } from "../utils/logger";

/**
 * Request enriquecido tras `verifyToken`. Los handlers que usan
 * `req.user.uid` viven detrás del middleware y pueden asumir que existe.
 */
export interface AuthRequest extends Request {
  user?: {
    /** Firebase Auth UID extraído del ID Token. */
    uid: string;
    /** Email verificado del usuario (puede no estar si el provider no lo expone). */
    email?: string;
  };
}

/**
 * Middleware Express que valida el header `Authorization: Bearer <token>`.
 *
 * Resultados:
 *  - Token presente y válido → llama a `next()` con `req.user` poblado.
 *  - Sin header o sin token → 401 `MISSING_TOKEN`.
 *  - Token inválido / expirado / revocado → 401 `INVALID_TOKEN`. El motivo
 *    real (`auth/id-token-expired`, `auth/id-token-revoked`, etc.) queda
 *    en logs internos pero no se devuelve al cliente.
 *
 * @param req  Request entrante.
 * @param res  Response (usada solo para responder 401 cuando falla).
 * @param next Callback de Express, llamado solo en caso de éxito.
 */
export const verifyToken = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json(buildError(ErrorCode.MISSING_TOKEN));
    return;
  }

  const token = authHeader.split("Bearer ")[1];
  if (!token) {
    res.status(401).json(buildError(ErrorCode.MISSING_TOKEN));
    return;
  }

  try {
    // checkRevoked: false — la verificación criptográfica es suficiente.
    // checkRevoked: true haría una llamada de red extra a Firebase en CADA
    // request; en Render free-tier esa llamada puede timeout y convertir
    // tokens válidos en 401. La revocación natural ocurre cuando el token
    // caduca (~1 h); para forzar logout inmediato el cliente ya llama a
    // signOut() localmente.
    const decoded = await auth.verifyIdToken(token, false);
    req.user = { uid: decoded.uid, email: decoded.email };
    next();
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (
      code === "auth/id-token-expired" ||
      code === "auth/id-token-revoked"
    ) {
      logger.warn(`Token rechazado (${code})`);
    } else {
      logger.warn("Token inválido en verifyToken", err);
    }
    res.status(401).json(buildError(ErrorCode.INVALID_TOKEN));
  }
};
