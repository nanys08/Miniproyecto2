import { Router } from "express";
import authRoutes from "./authRoutes";
import roomRoutes from "./roomRoutes";
import userRoutes from "./userRoutes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/rooms", roomRoutes);
router.use("/users", userRoutes);

export default router;
