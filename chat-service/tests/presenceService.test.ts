/**
 * Pruebas funcionales del registro de presencia (Tareas 7, 8 y 9).
 *
 * Evidencia de la Tarea 8 (bloqueo de username duplicado) y de la Tarea 9
 * (lista de participantes).
 */

import * as presence from "../src/services/presenceService";

const user = (username: string, socketId: string): presence.ConnectedUser => ({
  username,
  socketId,
  joinedAt: new Date().toISOString(),
});

describe("presenceService", () => {
  beforeEach(() => presence.__resetForTests());

  describe("Tarea 7 — gestión de usuarios conectados", () => {
    it("guarda usuarios por sala", () => {
      presence.addUser("123", user("Juan", "s1"));
      presence.addUser("123", user("Ana", "s2"));
      expect(presence.getParticipants("123")).toEqual(["Juan", "Ana"]);
    });

    it("aísla las salas entre sí", () => {
      presence.addUser("123", user("Juan", "s1"));
      presence.addUser("456", user("Carlos", "s2"));
      expect(presence.getParticipants("123")).toEqual(["Juan"]);
      expect(presence.getParticipants("456")).toEqual(["Carlos"]);
    });

    it("quita al usuario al desconectar por socketId", () => {
      presence.addUser("123", user("Juan", "s1"));
      presence.addUser("123", user("Ana", "s2"));
      const removed = presence.removeBySocketId("s1");
      expect(removed).toEqual({ roomId: "123", username: "Juan" });
      expect(presence.getParticipants("123")).toEqual(["Ana"]);
    });
  });

  describe("Tarea 8 — validación de username", () => {
    it("detecta que un username ya está conectado", () => {
      presence.addUser("123", user("Juan", "s1"));
      expect(presence.isUsernameConnected("123", "Juan")).toBe(true);
      expect(presence.isUsernameConnected("123", "Ana")).toBe(false);
    });

    it("el mismo username SÍ puede conectarse en otra sala distinta", () => {
      presence.addUser("123", user("Juan", "s1"));
      expect(presence.isUsernameConnected("456", "Juan")).toBe(false);
    });
  });

  describe("Tarea 9 — participantes activos", () => {
    it("devuelve [] para una sala sin nadie", () => {
      expect(presence.getParticipants("vacia")).toEqual([]);
    });

    it("devuelve la lista de usernames conectados", () => {
      presence.addUser("123", user("Juan", "s1"));
      presence.addUser("123", user("Ana", "s2"));
      expect(presence.getParticipants("123")).toEqual(["Juan", "Ana"]);
    });
  });

  describe("Tarea 5 — cierre de sala", () => {
    it("cierra la sala y devuelve los sockets a desconectar", () => {
      presence.addUser("123", user("Juan", "s1"));
      presence.addUser("123", user("Ana", "s2"));
      const sockets = presence.closeRoom("123");
      expect(sockets.sort()).toEqual(["s1", "s2"]);
      expect(presence.isRoomClosed("123")).toBe(true);
      expect(presence.getParticipants("123")).toEqual([]);
    });

    it("markRoomActive reabre una sala previamente cerrada", () => {
      presence.closeRoom("123");
      expect(presence.isRoomClosed("123")).toBe(true);
      presence.markRoomActive("123", "Matemáticas");
      expect(presence.isRoomClosed("123")).toBe(false);
      expect(presence.getRoomName("123")).toBe("Matemáticas");
    });
  });
});
