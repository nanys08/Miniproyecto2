import { Request, Response, NextFunction } from "express";
import { auth } from "../config/firebase";
import { buildError, ErrorCode } from "../utils/errors";
import { logger } from "../utils/logger";

export interface AuthRequest extends Request {
  user?: {
    uid: string;
    email?: string;
  };
}

// Verifica el ID Token de Firebase enviado en Authorization: Bearer <token>.
// Pasa `checkRevoked: true` para que `authService.revokeUserTokens(uid)` tenga
// efecto inmediato (sin esperar a que expire el token de ≤1h).
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
    const decoded = await auth.verifyIdToken(token, true);
    req.user = { uid: decoded.uid, email: decoded.email };
    next();
  } catch (err) {
    // Loggeamos el motivo internamente, al cliente solo el código.
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
