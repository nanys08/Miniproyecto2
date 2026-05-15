import { Response } from "express";
import { AuthRequest } from "../middlewares/authMiddleware";
import * as authService from "../services/authService";

// POST /api/auth/register
// Body: { username, avatar? }
// Header: Authorization: Bearer <firebase_id_token>
export const register = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { uid, email } = req.user!;
    const { username, avatar } = req.body;

    if (!username) {
      res.status(400).json({ error: "El campo username es requerido" });
      return;
    }

    const user = await authService.registerUserProfile(
      uid,
      username,
      email || "",
      avatar
    );
    res.status(201).json({ user });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Error al registrar usuario";
    res.status(400).json({ error: message });
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
      res.status(404).json({ error: "Perfil no encontrado" });
      return;
    }
    res.json({ user: profile });
  } catch {
    res.status(500).json({ error: "Error al obtener perfil" });
  }
};

// GET /api/auth/check-username/:username
export const checkUsername = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const username = req.params["username"] as string;
    const taken = await authService.isUsernameTaken(username);
    res.json({ available: !taken });
  } catch {
    res.status(500).json({ error: "Error al verificar username" });
  }
};
