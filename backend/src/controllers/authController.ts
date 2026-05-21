import { Response } from "express";
import { AuthRequest } from "../middlewares/authMiddleware";
import * as authService from "../services/authService";
import { AuthProvider } from "../models/User";
import { AppError, ErrorCode, buildError } from "../utils/errors";
import { logger } from "../utils/logger";

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;
const VALID_PROVIDERS: AuthProvider[] = ["password", "google"];

// Envía un AppError tal cual al cliente. Cualquier otro error se loggea
// internamente y se devuelve como INTERNAL_ERROR — nunca filtramos el
// mensaje original de Firebase al cliente.
const sendError = (res: Response, err: unknown, context: string): void => {
  if (err instanceof AppError) {
    res.status(err.status).json(buildError(err.code, err.message));
    return;
  }
  logger.error(`[${context}] error interno`, err);
  res
    .status(500)
    .json(buildError(ErrorCode.INTERNAL_ERROR));
};

// POST /api/auth/register
// Body: { username, fullName, provider, avatar? }
// Header: Authorization: Bearer <firebase_id_token>
export const register = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { uid, email } = req.user!;
    const { username, fullName, provider, avatar } = req.body ?? {};

    if (!username || !fullName || !provider) {
      res.status(400).json(buildError(ErrorCode.MISSING_FIELDS));
      return;
    }
    if (typeof username !== "string" || !USERNAME_REGEX.test(username)) {
      res.status(400).json(buildError(ErrorCode.USERNAME_INVALID));
      return;
    }
    if (!VALID_PROVIDERS.includes(provider)) {
      res.status(400).json(buildError(ErrorCode.PROVIDER_INVALID));
      return;
    }

    const user = await authService.registerUserProfile(
      uid,
      username,
      fullName,
      email || "",
      provider,
      avatar
    );
    res.status(201).json({ user });
  } catch (err) {
    sendError(res, err, "register");
  }
};

// GET /api/auth/me
// Header: Authorization: Bearer <firebase_id_token>
export const getMe = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const profile = await authService.getUserProfile(req.user!.uid);
    if (!profile) {
      res.status(404).json(buildError(ErrorCode.PROFILE_NOT_FOUND));
      return;
    }
    res.json({ user: profile });
  } catch (err) {
    sendError(res, err, "getMe");
  }
};

// POST /api/auth/logout
// Revoca todos los refresh tokens del usuario (cierra sesión en todas las
// pestañas y dispositivos) y lo marca offline. El frontend debería además
// llamar a `firebase.auth().signOut()` localmente.
export const logout = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { uid } = req.user!;
    await authService.setUserOnlineStatus(uid, false);
    await authService.revokeUserTokens(uid);
    res.status(204).send();
  } catch (err) {
    sendError(res, err, "logout");
  }
};

// GET /api/auth/check-username/:username
export const checkUsername = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const username = req.params["username"] as string;
    if (!USERNAME_REGEX.test(username)) {
      res.status(400).json(buildError(ErrorCode.USERNAME_INVALID));
      return;
    }
    const taken = await authService.isUsernameTaken(username);
    res.json({ available: !taken });
  } catch (err) {
    sendError(res, err, "checkUsername");
  }
};
