/**
 * @file userController — Lecturas públicas (autenticadas) de perfiles
 * de otros usuarios.
 *
 * `getMe` y `updateMe` viven en `authController` porque actúan sobre el
 * propio usuario; aquí solo exponemos lo necesario para que un cliente
 * pueda resolver el `uid` de un participante de sala a su avatar +
 * username + displayName (sin filtrar email ni teléfono, que son
 * datos privados del titular).
 */

import { Response } from "express";
import { AuthRequest } from "../middlewares/authMiddleware";
import * as authService from "../services/authService";
import { AppError, ErrorCode, buildError, mapFirestoreError } from "../utils/errors";
import { logger } from "../utils/logger";

/** Centraliza el envío de errores con la misma política que el resto. */
const sendError = (res: Response, err: unknown, context: string): void => {
  if (err instanceof AppError) {
    res.status(err.status).json(buildError(err.code, err.message));
    return;
  }
  const mapped = mapFirestoreError(err);
  if (mapped) {
    logger.warn(`[${context}] Firestore error mapeado`, err);
    res.status(mapped.status).json(buildError(mapped.code, mapped.message));
    return;
  }
  logger.error(`[${context}] error interno`, err);
  res.status(500).json(buildError(ErrorCode.INTERNAL_ERROR));
};

/**
 * **GET /api/users/:uid** — Perfil **público** de cualquier usuario.
 *
 * Requiere token (cualquier usuario autenticado puede consultarlo, para
 * resolver avatares de participantes de sala). Devuelve solo campos
 * seguros para mostrar en UI: nunca email ni phone.
 *
 * @param req Path param `uid`.
 * @param res 200 con `{ user }`, 404 si el perfil no existe.
 */
export const getPublicProfile = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { uid } = req.params as { uid: string };
    if (!uid || !uid.trim()) {
      res.status(400).json(buildError(ErrorCode.MISSING_FIELDS));
      return;
    }
    const profile = await authService.getUserProfile(uid);
    if (!profile) {
      res.status(404).json(buildError(ErrorCode.PROFILE_NOT_FOUND));
      return;
    }
    // Whitelist explícita: solo lo necesario para pintar la tarjeta del
    // participante. Si en el futuro mostramos universidad, añadirla aquí.
    res.json({
      user: {
        uid: profile.uid,
        username: profile.username,
        displayName: profile.fullName,
        avatar: profile.avatar,
      },
    });
  } catch (err) {
    sendError(res, err, "getPublicProfile");
  }
};
