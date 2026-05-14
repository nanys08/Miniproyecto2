import { Router } from "express";
import authRoutes from "./authRoutes";

const router = Router();

router.use("/auth", authRoutes);

// Sprint 1+ — rutas a agregar
// router.use("/rooms", roomRoutes);
// router.use("/messages", messageRoutes);

export default router;
