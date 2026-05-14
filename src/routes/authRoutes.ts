import { Router } from "express";
import { verifyToken } from "../middlewares/authMiddleware";
import * as authController from "../controllers/authController";

const router = Router();

// Rutas protegidas — requieren Firebase ID Token válido
router.post("/register", verifyToken, authController.register);
router.get("/me", verifyToken, authController.getMe);

// Ruta pública
router.get("/check-username/:username", authController.checkUsername);

export default router;
