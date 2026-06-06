/**
 * Pruebas del modelo de mensaje y la integración de persistencia (Tarea 6).
 */

import { fromPersisted, buildLocal, MAX_MESSAGE_LENGTH } from "../src/models/Message";
import { PersistedMessage } from "../src/services/persistenceClient";
import * as persistence from "../src/services/persistenceClient";

describe("Message — modelo y mapeadores (Tareas 1 y 6)", () => {
  it("MAX_MESSAGE_LENGTH es 500 (Tarea 6)", () => {
    expect(MAX_MESSAGE_LENGTH).toBe(500);
  });

  it("fromPersisted mapea el documento canónico al modelo del profesor", () => {
    const persisted: PersistedMessage = {
      id: "001",
      roomId: "123",
      senderUid: "uid-1",
      senderUsername: "Juan",
      content: "Hola",
      type: "text",
      createdAt: "2026-06-01T15:00:00.000Z",
    };
    const msg = fromPersisted(persisted);
    expect(msg).toMatchObject({
      messageId: "001",
      id: "001", // alias para el frontend actual
      roomId: "123",
      username: "Juan",
      senderUsername: "Juan", // alias
      content: "Hola",
      timestamp: "2026-06-01T15:00:00.000Z",
      createdAt: "2026-06-01T15:00:00.000Z", // alias
    });
  });

  it("fromPersisted normaliza un Firestore Timestamp a ISO", () => {
    const persisted: PersistedMessage = {
      id: "002",
      roomId: "123",
      senderUid: "uid-1",
      senderUsername: "Ana",
      content: "Hey",
      type: "text",
      createdAt: { _seconds: 1748790000, _nanoseconds: 0 },
    };
    const msg = fromPersisted(persisted);
    expect(typeof msg.timestamp).toBe("string");
    expect(msg.timestamp).toBe(new Date(1748790000 * 1000).toISOString());
  });

  it("buildLocal construye un mensaje con id y timestamp (degradación)", () => {
    const msg = buildLocal({ roomId: "123", username: "Juan", content: "Hola" });
    expect(msg).toMatchObject({ roomId: "123", username: "Juan", content: "Hola" });
    expect(msg.id).toMatch(/^local-/);
    expect(typeof msg.timestamp).toBe("string");
  });
});

describe("persistenceClient (Tarea 6)", () => {
  it("devuelve null si ROOM_SERVICE_URL no está configurado", async () => {
    // En el entorno de test no hay ROOM_SERVICE_URL → persistencia desactivada.
    expect(persistence.isPersistenceEnabled()).toBe(false);
    const result = await persistence.persistMessage({
      roomId: "123",
      username: "Juan",
      content: "Hola",
    });
    expect(result).toBeNull();
  });
});
