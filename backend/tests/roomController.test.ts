// Tests del roomController.
// Mockeamos roomService para aislar el controller y verificar:
//   - Códigos HTTP y de error estables expuestos al cliente.
//   - Validación de nombre vacío/inválido antes de llamar al service.
//   - Que errores internos de Firestore NO se filtren al cliente.
//   - Control de acceso: solo el dueño puede eliminar una sala.

import type { Response } from "express";

const createRoomMock = jest.fn();
const getRoomsByUserMock = jest.fn();
const getRoomByIdMock = jest.fn();
const deleteRoomMock = jest.fn();
const getRoomByAccessCodeMock = jest.fn();
const addParticipantMock = jest.fn();
const removeParticipantMock = jest.fn();

const saveMessageMock = jest.fn();
const getRoomMessagesMock = jest.fn();
const deleteRoomMessagesMock = jest.fn();

jest.mock("../src/services/roomService", () => ({
  createRoom: (...args: unknown[]) => createRoomMock(...args),
  getRoomsByUser: (...args: unknown[]) => getRoomsByUserMock(...args),
  getRoomById: (...args: unknown[]) => getRoomByIdMock(...args),
  deleteRoom: (...args: unknown[]) => deleteRoomMock(...args),
  getRoomByAccessCode: (...args: unknown[]) => getRoomByAccessCodeMock(...args),
  addParticipant: (...args: unknown[]) => addParticipantMock(...args),
  removeParticipant: (...args: unknown[]) => removeParticipantMock(...args),
}));

jest.mock("../src/services/messageService", () => ({
  saveMessage: (...args: unknown[]) => saveMessageMock(...args),
  getRoomMessages: (...args: unknown[]) => getRoomMessagesMock(...args),
  deleteRoomMessages: (...args: unknown[]) => deleteRoomMessagesMock(...args),
  DEFAULT_HISTORY_LIMIT: 50,
  MAX_HISTORY_LIMIT: 200,
  MAX_MESSAGE_LENGTH: 2000,
}));

jest.mock("../src/utils/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("../src/config/firebase", () => ({
  db: {},
  auth: { verifyIdToken: jest.fn() },
}));

import * as roomController from "../src/controllers/roomController";
import type { AuthRequest } from "../src/middlewares/authMiddleware";
import { AppError, ErrorCode } from "../src/utils/errors";

// ─── helpers ────────────────────────────────────────────────────────────────

const buildRes = () => {
  const res: Partial<Response> & { statusCode?: number; body?: unknown } = {};
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res as Response;
  }) as unknown as Response["status"];
  res.json = jest.fn((data: unknown) => {
    res.body = data;
    return res as Response;
  }) as unknown as Response["json"];
  res.send = jest.fn(() => res as Response) as unknown as Response["send"];
  return res as Response & { statusCode?: number; body?: unknown };
};

const baseReq = (overrides: Partial<AuthRequest> = {}): AuthRequest =>
  ({
    user: { uid: "owner-uid", email: "owner@test.com" },
    body: {},
    params: {},
    ...overrides,
  } as AuthRequest);

const fakeRoom = {
  roomId: "room-abc123",
  name: "Sala Matemáticas",
  ownerId: "owner-uid",
  accessCode: "B6K3F2",
  createdAt: new Date(),
  participants: ["owner-uid"],
  isActive: true,
};

beforeEach(() => {
  createRoomMock.mockReset();
  getRoomsByUserMock.mockReset();
  getRoomByIdMock.mockReset();
  deleteRoomMock.mockReset();
  getRoomByAccessCodeMock.mockReset();
  addParticipantMock.mockReset();
  removeParticipantMock.mockReset();
  saveMessageMock.mockReset();
  getRoomMessagesMock.mockReset();
  deleteRoomMessagesMock.mockReset();
  // Por defecto, el borrado de mensajes resuelve OK — los tests específicos
  // que necesiten simular fallo lo sobrescriben con mockRejectedValueOnce.
  deleteRoomMessagesMock.mockResolvedValue(undefined);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/rooms — createRoom
// ─────────────────────────────────────────────────────────────────────────────
describe("createRoom", () => {
  it("400 ROOM_NAME_INVALID cuando name está ausente", async () => {
    const req = baseReq({ body: {} });
    const res = buildRes();
    await roomController.createRoom(req, res);
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toBe("ROOM_NAME_INVALID");
    expect(createRoomMock).not.toHaveBeenCalled();
  });

  it("400 ROOM_NAME_INVALID cuando name es cadena vacía", async () => {
    const req = baseReq({ body: { name: "   " } });
    const res = buildRes();
    await roomController.createRoom(req, res);
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toBe("ROOM_NAME_INVALID");
    expect(createRoomMock).not.toHaveBeenCalled();
  });

  it("400 ROOM_NAME_INVALID cuando name supera 100 caracteres", async () => {
    const req = baseReq({ body: { name: "a".repeat(101) } });
    const res = buildRes();
    await roomController.createRoom(req, res);
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toBe("ROOM_NAME_INVALID");
    expect(createRoomMock).not.toHaveBeenCalled();
  });

  it("201 y devuelve la sala cuando name es válido", async () => {
    createRoomMock.mockResolvedValue(fakeRoom);
    const req = baseReq({ body: { name: "Sala Matemáticas" } });
    const res = buildRes();
    await roomController.createRoom(req, res);
    expect(res.statusCode).toBe(201);
    expect((res.body as { room: unknown }).room).toEqual(fakeRoom);
    expect(createRoomMock).toHaveBeenCalledWith("owner-uid", "Sala Matemáticas", undefined);
  });

  it("trimmea el nombre antes de guardar", async () => {
    createRoomMock.mockResolvedValue({ ...fakeRoom, name: "Sala Física" });
    const req = baseReq({ body: { name: "  Sala Física  " } });
    const res = buildRes();
    await roomController.createRoom(req, res);
    expect(createRoomMock).toHaveBeenCalledWith("owner-uid", "Sala Física", undefined);
  });

  it("pasa el accessCode al service cuando viene en el body", async () => {
    createRoomMock.mockResolvedValue({ ...fakeRoom, accessCode: "B6K3F2" });
    const req = baseReq({ body: { name: "Sala Mate", accessCode: "B6K3F2" } });
    const res = buildRes();
    await roomController.createRoom(req, res);
    expect(createRoomMock).toHaveBeenCalledWith("owner-uid", "Sala Mate", "B6K3F2");
  });

  it("500 INTERNAL_ERROR cuando el service lanza error desconocido", async () => {
    createRoomMock.mockRejectedValue(new Error("Firestore caído"));
    const req = baseReq({ body: { name: "Sala Test" } });
    const res = buildRes();
    await roomController.createRoom(req, res);
    expect(res.statusCode).toBe(500);
    expect((res.body as { error: string }).error).toBe("INTERNAL_ERROR");
    // El mensaje interno NO se filtra al cliente
    expect(JSON.stringify(res.body)).not.toContain("Firestore caído");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/rooms — getRooms
// ─────────────────────────────────────────────────────────────────────────────
describe("getRooms", () => {
  it("200 con array vacío cuando el usuario no tiene salas", async () => {
    getRoomsByUserMock.mockResolvedValue([]);
    const req = baseReq();
    const res = buildRes();
    await roomController.getRooms(req, res);
    expect(res.statusCode).toBeUndefined(); // res.json() sin .status() = 200 implícito
    expect((res.body as { rooms: unknown[] }).rooms).toEqual([]);
  });

  it("200 con las salas del usuario", async () => {
    getRoomsByUserMock.mockResolvedValue([fakeRoom]);
    const req = baseReq();
    const res = buildRes();
    await roomController.getRooms(req, res);
    expect((res.body as { rooms: unknown[] }).rooms).toHaveLength(1);
    expect((res.body as { rooms: typeof fakeRoom[] }).rooms[0].roomId).toBe("room-abc123");
    expect(getRoomsByUserMock).toHaveBeenCalledWith("owner-uid");
  });

  it("500 INTERNAL_ERROR cuando Firestore falla", async () => {
    getRoomsByUserMock.mockRejectedValue(new Error("DB error"));
    const req = baseReq();
    const res = buildRes();
    await roomController.getRooms(req, res);
    expect(res.statusCode).toBe(500);
    expect((res.body as { error: string }).error).toBe("INTERNAL_ERROR");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/rooms/:roomId — getRoomById
// ─────────────────────────────────────────────────────────────────────────────
describe("getRoomById", () => {
  it("200 con los datos de la sala cuando existe", async () => {
    getRoomByIdMock.mockResolvedValue(fakeRoom);
    const req = baseReq({ params: { roomId: "room-abc123" } });
    const res = buildRes();
    await roomController.getRoomById(req, res);
    expect((res.body as { room: typeof fakeRoom }).room).toEqual(fakeRoom);
  });

  it("404 ROOM_NOT_FOUND cuando la sala no existe", async () => {
    getRoomByIdMock.mockResolvedValue(null);
    const req = baseReq({ params: { roomId: "no-existe" } });
    const res = buildRes();
    await roomController.getRoomById(req, res);
    expect(res.statusCode).toBe(404);
    expect((res.body as { error: string }).error).toBe("ROOM_NOT_FOUND");
  });

  it("500 INTERNAL_ERROR cuando Firestore falla", async () => {
    getRoomByIdMock.mockRejectedValue(new Error("DB timeout"));
    const req = baseReq({ params: { roomId: "room-abc123" } });
    const res = buildRes();
    await roomController.getRoomById(req, res);
    expect(res.statusCode).toBe(500);
    expect((res.body as { error: string }).error).toBe("INTERNAL_ERROR");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/rooms/:roomId — deleteRoom
// ─────────────────────────────────────────────────────────────────────────────
describe("deleteRoom", () => {
  it("204 cuando el dueño elimina su propia sala", async () => {
    getRoomByIdMock.mockResolvedValue(fakeRoom); // ownerId === "owner-uid"
    deleteRoomMock.mockResolvedValue(undefined);
    const req = baseReq({ params: { roomId: "room-abc123" } });
    const res = buildRes();
    await roomController.deleteRoom(req, res);
    expect(res.statusCode).toBe(204);
    expect(deleteRoomMock).toHaveBeenCalledWith("room-abc123");
  });

  it("403 cuando un usuario distinto al dueño intenta eliminar", async () => {
    getRoomByIdMock.mockResolvedValue({ ...fakeRoom, ownerId: "otro-uid" });
    const req = baseReq({
      user: { uid: "intruso-uid" },
      params: { roomId: "room-abc123" },
    });
    const res = buildRes();
    await roomController.deleteRoom(req, res);
    expect(res.statusCode).toBe(403);
    expect(deleteRoomMock).not.toHaveBeenCalled();
  });

  it("404 ROOM_NOT_FOUND cuando la sala no existe", async () => {
    getRoomByIdMock.mockResolvedValue(null);
    const req = baseReq({ params: { roomId: "no-existe" } });
    const res = buildRes();
    await roomController.deleteRoom(req, res);
    expect(res.statusCode).toBe(404);
    expect((res.body as { error: string }).error).toBe("ROOM_NOT_FOUND");
    expect(deleteRoomMock).not.toHaveBeenCalled();
  });

  it("500 INTERNAL_ERROR oculta detalles internos", async () => {
    getRoomByIdMock.mockRejectedValue(new Error("Firestore timeout"));
    const req = baseReq({ params: { roomId: "room-abc123" } });
    const res = buildRes();
    await roomController.deleteRoom(req, res);
    expect(res.statusCode).toBe(500);
    expect((res.body as { error: string }).error).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(res.body)).not.toContain("Firestore timeout");
  });

  it("propaga AppError del service (p.ej. ROOM_NOT_FOUND desde deleteRoom)", async () => {
    getRoomByIdMock.mockResolvedValue(fakeRoom);
    deleteRoomMock.mockRejectedValue(new AppError(ErrorCode.ROOM_NOT_FOUND, 404));
    const req = baseReq({ params: { roomId: "room-abc123" } });
    const res = buildRes();
    await roomController.deleteRoom(req, res);
    expect(res.statusCode).toBe(404);
    expect((res.body as { error: string }).error).toBe("ROOM_NOT_FOUND");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/rooms/join/:code — joinRoomByCode
// ─────────────────────────────────────────────────────────────────────────────
describe("joinRoomByCode", () => {
  it("200 con la sala cuando el código existe", async () => {
    getRoomByAccessCodeMock.mockResolvedValue(fakeRoom);
    const req = baseReq({ params: { code: "B6K3F2" } });
    const res = buildRes();
    await roomController.joinRoomByCode(req, res);
    expect((res.body as { room: typeof fakeRoom }).room.roomId).toBe("room-abc123");
    expect(getRoomByAccessCodeMock).toHaveBeenCalledWith("B6K3F2");
  });

  it("400 ROOM_CODE_INVALID cuando el código está vacío", async () => {
    const req = baseReq({ params: { code: "   " } });
    const res = buildRes();
    await roomController.joinRoomByCode(req, res);
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toBe("ROOM_CODE_INVALID");
    expect(getRoomByAccessCodeMock).not.toHaveBeenCalled();
  });

  it("404 ROOM_NOT_FOUND cuando ninguna sala coincide", async () => {
    getRoomByAccessCodeMock.mockResolvedValue(null);
    const req = baseReq({ params: { code: "ZZZZZZ" } });
    const res = buildRes();
    await roomController.joinRoomByCode(req, res);
    expect(res.statusCode).toBe(404);
    expect((res.body as { error: string }).error).toBe("ROOM_NOT_FOUND");
  });

  it("500 INTERNAL_ERROR oculta detalles internos", async () => {
    getRoomByAccessCodeMock.mockRejectedValue(new Error("Firestore down"));
    const req = baseReq({ params: { code: "B6K3F2" } });
    const res = buildRes();
    await roomController.joinRoomByCode(req, res);
    expect(res.statusCode).toBe(500);
    expect((res.body as { error: string }).error).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(res.body)).not.toContain("Firestore down");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/rooms/:roomId/messages — getRoomHistory
// ─────────────────────────────────────────────────────────────────────────────
describe("getRoomHistory", () => {
  const fakeMessages = [
    { id: "m1", roomId: "room-abc123", senderUid: "owner-uid", senderUsername: "owner", content: "hola", type: "text", createdAt: new Date() },
  ];

  it("200 con el historial cuando el solicitante es el dueño", async () => {
    getRoomByIdMock.mockResolvedValue(fakeRoom);
    getRoomMessagesMock.mockResolvedValue(fakeMessages);
    const req = baseReq({ params: { roomId: "room-abc123" } });
    const res = buildRes();
    await roomController.getRoomHistory(req, res);
    expect(res.statusCode).toBeUndefined();
    expect(res.body).toEqual({ messages: fakeMessages });
    expect(getRoomMessagesMock).toHaveBeenCalledWith("room-abc123", undefined);
  });

  it("200 cuando el solicitante es participante (no dueño)", async () => {
    getRoomByIdMock.mockResolvedValue({
      ...fakeRoom,
      ownerId: "otro-uid",
      participants: ["otro-uid", "miembro-uid"],
    });
    getRoomMessagesMock.mockResolvedValue([]);
    const req = baseReq({
      user: { uid: "miembro-uid" },
      params: { roomId: "room-abc123" },
    });
    const res = buildRes();
    await roomController.getRoomHistory(req, res);
    expect(res.body).toEqual({ messages: [] });
  });

  it("403 cuando el solicitante no es miembro de la sala", async () => {
    getRoomByIdMock.mockResolvedValue({
      ...fakeRoom,
      ownerId: "otro-uid",
      participants: ["otro-uid"],
    });
    const req = baseReq({
      user: { uid: "intruso-uid" },
      params: { roomId: "room-abc123" },
    });
    const res = buildRes();
    await roomController.getRoomHistory(req, res);
    expect(res.statusCode).toBe(403);
    expect(getRoomMessagesMock).not.toHaveBeenCalled();
  });

  it("404 ROOM_NOT_FOUND cuando la sala no existe", async () => {
    getRoomByIdMock.mockResolvedValue(null);
    const req = baseReq({ params: { roomId: "no-existe" } });
    const res = buildRes();
    await roomController.getRoomHistory(req, res);
    expect(res.statusCode).toBe(404);
    expect((res.body as { error: string }).error).toBe("ROOM_NOT_FOUND");
  });

  it("aplica el query param `limit` cuando es válido", async () => {
    getRoomByIdMock.mockResolvedValue(fakeRoom);
    getRoomMessagesMock.mockResolvedValue([]);
    const req = baseReq({
      params: { roomId: "room-abc123" },
      query: { limit: "10" } as Record<string, string>,
    });
    const res = buildRes();
    await roomController.getRoomHistory(req, res);
    expect(getRoomMessagesMock).toHaveBeenCalledWith("room-abc123", 10);
  });

  it("ignora `limit` inválido y deja que el service use el default", async () => {
    getRoomByIdMock.mockResolvedValue(fakeRoom);
    getRoomMessagesMock.mockResolvedValue([]);
    const req = baseReq({
      params: { roomId: "room-abc123" },
      query: { limit: "abc" } as Record<string, string>,
    });
    const res = buildRes();
    await roomController.getRoomHistory(req, res);
    expect(getRoomMessagesMock).toHaveBeenCalledWith("room-abc123", undefined);
  });

  it("500 INTERNAL_ERROR oculta detalles internos del service de mensajes", async () => {
    getRoomByIdMock.mockResolvedValue(fakeRoom);
    getRoomMessagesMock.mockRejectedValue(new Error("Firestore index missing"));
    const req = baseReq({ params: { roomId: "room-abc123" } });
    const res = buildRes();
    await roomController.getRoomHistory(req, res);
    expect(res.statusCode).toBe(500);
    expect((res.body as { error: string }).error).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(res.body)).not.toContain("index missing");
  });
});
