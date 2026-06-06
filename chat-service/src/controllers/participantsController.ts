/**
 * @file participantsController — Endpoint público de participantes activos (Tarea 9).
 */

import { Request, Response } from "express";
import * as presence from "../services/presenceService";
import { ErrorCode, buildError } from "../utils/errors";

/**
 * **GET /participants?roomId=123** — Lista de usernames conectados ahora mismo
 * en la sala. Devuelve un array plano, p. ej. `["Juan", "Ana"]`.
 *
 * Si la sala no tiene a nadie (o no existe) devuelve `[]` con 200 — no es un
 * error: simplemente no hay participantes activos.
 */
export const getParticipants = (req: Request, res: Response): void => {
  const roomId = (req.query.roomId ?? "") as string;
  if (!roomId.trim()) {
    res
      .status(400)
      .json(buildError(ErrorCode.MISSING_FIELDS, "Falta el query param roomId"));
    return;
  }
  res.json(presence.getParticipants(roomId.trim()));
};
