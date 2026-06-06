/**
 * Pruebas del ticket de autenticación coordinada (Tarea 10).
 *
 * Replican el algoritmo de emisión del room-service (chatTicket.ts) para
 * verificar que el chat-service acepta tickets válidos y rechaza los
 * inválidos, manipulados o expirados.
 */

import crypto from "crypto";
import { env } from "../src/config/env";
import * as ticketService from "../src/services/ticketService";

const SECRET = "secreto-de-prueba";

/** Mismo algoritmo que `backend/src/services/chatTicket.ts`. */
const issue = (
  payload: Record<string, unknown>,
  secret = SECRET
): string => {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url"
  );
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
};

describe("ticketService (Tarea 10)", () => {
  const originalSecret = env.internalSecret;

  beforeAll(() => {
    // El servicio lee env.internalSecret en tiempo de ejecución.
    env.internalSecret = SECRET;
  });
  afterAll(() => {
    env.internalSecret = originalSecret;
  });

  it("acepta un ticket válido y devuelve el payload", () => {
    const ticket = issue({
      roomId: "123",
      username: "Juan",
      uid: "abc",
      exp: Date.now() + 60_000,
    });
    const payload = ticketService.verifyTicket(ticket);
    expect(payload).toMatchObject({ roomId: "123", username: "Juan", uid: "abc" });
  });

  it("rechaza un ticket con firma manipulada", () => {
    const ticket = issue({
      roomId: "123",
      username: "Juan",
      exp: Date.now() + 60_000,
    });
    const tampered = ticket.slice(0, -2) + "xx";
    expect(ticketService.verifyTicket(tampered)).toBeNull();
  });

  it("rechaza un ticket firmado con otro secreto", () => {
    const ticket = issue(
      { roomId: "123", username: "Juan", exp: Date.now() + 60_000 },
      "otro-secreto"
    );
    expect(ticketService.verifyTicket(ticket)).toBeNull();
  });

  it("rechaza un ticket expirado", () => {
    const ticket = issue({
      roomId: "123",
      username: "Juan",
      exp: Date.now() - 1000,
    });
    expect(ticketService.verifyTicket(ticket)).toBeNull();
  });

  it("rechaza basura / formato inválido", () => {
    expect(ticketService.verifyTicket(undefined)).toBeNull();
    expect(ticketService.verifyTicket("")).toBeNull();
    expect(ticketService.verifyTicket("sinpunto")).toBeNull();
  });
});
