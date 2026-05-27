import { Router } from "express";
import authRoutes from "./authRoutes";
import roomRoutes from "./roomRoutes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/rooms", roomRoutes);

// Sprint 1+ — rutas a agregar
// router.use("/messages", messageRoutes);

export default router;
