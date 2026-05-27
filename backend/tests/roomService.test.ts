// Tests del roomService.
// Mockeamos ../src/config/firebase con un Firestore en memoria que simula:
//   - Escritura por doc (set/delete)
//   - Lectura por doc (get)
//   - Query where('ownerId','==',uid).orderBy(...).get()

import type { Room } from "../src/models/Room";

// ─── Store en memoria ────────────────────────────────────────────────────────
const store = new Map<string, Room>();
let autoIdCounter = 0;

const makeDocRef = (id: string) => ({
  id,
  get: async () => ({
    exists: store.has(id),
    data: () => store.get(id) as Room | undefined,
  }),
  set: async (data: Room) => {
    store.set(id, data);
  },
  delete: async () => {
    store.delete(id);
  },
});

// Simula db.collection("rooms").where(...).orderBy(...).get()
const makeQuerySnap = (uid: string) => {
  const docs = Array.from(store.values())
    .filter((r) => r.ownerId === uid)
    .sort((a, b) => {
      const ta = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
      const tb = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
      return tb - ta; // desc
    });
  return {
    docs: docs.map((d) => ({ data: () => d })),
  };
};

const collectionMock = {
  doc: (id?: string) => {
    const resolvedId = id ?? `auto-id-${++autoIdCounter}`;
    return makeDocRef(resolvedId);
  },
  where: (_field: string, _op: string, value: string) => ({
    orderBy: (_f: string, _dir: string) => ({
      get: async () => makeQuerySnap(value),
    }),
    limit: (_n: number) => ({
      get: async () => {
        const docs = Array.from(store.values()).filter((r) => r.ownerId === value);
        return { empty: docs.length === 0, docs: docs.map((d) => ({ data: () => d })) };
      },
    }),
  }),
};

const dbMock = {
  collection: (_name: string) => collectionMock,
};

jest.mock("../src/config/firebase", () => ({
  db: dbMock,
  auth: {},
}));

jest.mock("../src/utils/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import * as roomService from "../src/services/roomService";
import { AppError, ErrorCode } from "../src/utils/errors";

beforeEach(() => {
  store.clear();
  autoIdCounter = 0;
});

// ─────────────────────────────────────────────────────────────────────────────
// createRoom
// ─────────────────────────────────────────────────────────────────────────────
describe("createRoom", () => {
  it("crea la sala con todos los campos requeridos", async () => {
    const room = await roomService.createRoom("uid-owner", "Sala Matemáticas");

    expect(room.name).toBe("Sala Matemáticas");
    expect(room.ownerId).toBe("uid-owner");
    expect(room.roomId).toBeTruthy();
    expect(room.isActive).toBe(true);
    expect(room.participants).toContain("uid-owner");
    expect(room.createdAt).toBeInstanceOf(Date);
  });

  it("el roomId coincide con el ID del documento en Firestore", async () => {
    const room = await roomService.createRoom("uid-owner", "Sala Test");

    // El store debe contener el documento con ese ID
    const persisted = store.get(room.roomId);
    expect(persisted).toBeDefined();
    expect(persisted!.roomId).toBe(room.roomId);
  });

  it("el creador es automáticamente participante", async () => {
    const room = await roomService.createRoom("uid-a", "Sala Física");
    expect(room.participants).toEqual(["uid-a"]);
  });

  it("dos salas distintas tienen IDs distintos", async () => {
    const r1 = await roomService.createRoom("uid-a", "Sala A");
    const r2 = await roomService.createRoom("uid-a", "Sala B");
    expect(r1.roomId).not.toBe(r2.roomId);
  });

  it("persiste el documento en Firestore", async () => {
    const room = await roomService.createRoom("uid-owner", "Sala Química");
    expect(store.size).toBe(1);
    expect(store.get(room.roomId)?.name).toBe("Sala Química");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getRoomsByUser
// ─────────────────────────────────────────────────────────────────────────────
describe("getRoomsByUser", () => {
  it("devuelve array vacío si el usuario no tiene salas", async () => {
    const rooms = await roomService.getRoomsByUser("uid-sin-salas");
    expect(rooms).toEqual([]);
  });

  it("devuelve solo las salas del usuario indicado", async () => {
    await roomService.createRoom("uid-a", "Sala A1");
    await roomService.createRoom("uid-a", "Sala A2");
    await roomService.createRoom("uid-b", "Sala B1");

    const roomsA = await roomService.getRoomsByUser("uid-a");
    expect(roomsA).toHaveLength(2);
    roomsA.forEach((r) => expect(r.ownerId).toBe("uid-a"));

    const roomsB = await roomService.getRoomsByUser("uid-b");
    expect(roomsB).toHaveLength(1);
    expect(roomsB[0].name).toBe("Sala B1");
  });

  it("devuelve las salas ordenadas de más reciente a más antigua", async () => {
    // Creamos salas con fechas explícitas para controlar el orden
    const old: Room = {
      roomId: "r-old",
      name: "Sala Antigua",
      ownerId: "uid-c",
      createdAt: new Date("2024-01-01"),
      participants: ["uid-c"],
      isActive: true,
    };
    const recent: Room = {
      roomId: "r-recent",
      name: "Sala Reciente",
      ownerId: "uid-c",
      createdAt: new Date("2024-06-01"),
      participants: ["uid-c"],
      isActive: true,
    };
    store.set("r-old", old);
    store.set("r-recent", recent);

    const rooms = await roomService.getRoomsByUser("uid-c");
    expect(rooms[0].roomId).toBe("r-recent");
    expect(rooms[1].roomId).toBe("r-old");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getRoomById
// ─────────────────────────────────────────────────────────────────────────────
describe("getRoomById", () => {
  it("devuelve la sala cuando existe", async () => {
    const created = await roomService.createRoom("uid-owner", "Sala Test");
    const found = await roomService.getRoomById(created.roomId);
    expect(found).not.toBeNull();
    expect(found!.roomId).toBe(created.roomId);
  });

  it("devuelve null cuando la sala no existe", async () => {
    const found = await roomService.getRoomById("id-inventado");
    expect(found).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// deleteRoom
// ─────────────────────────────────────────────────────────────────────────────
describe("deleteRoom", () => {
  it("elimina el documento de Firestore correctamente", async () => {
    const room = await roomService.createRoom("uid-owner", "Sala a Eliminar");
    expect(store.has(room.roomId)).toBe(true);

    await roomService.deleteRoom(room.roomId);
    expect(store.has(room.roomId)).toBe(false);
  });

  it("lanza ROOM_NOT_FOUND (404) si la sala no existe", async () => {
    await expect(roomService.deleteRoom("id-no-existe")).rejects.toMatchObject({
      code: ErrorCode.ROOM_NOT_FOUND,
      status: 404,
    });
  });

  it("el store no cambia si la sala no existe (no borra otras salas)", async () => {
    const room = await roomService.createRoom("uid-owner", "Sala Intacta");
    await expect(roomService.deleteRoom("otro-id")).rejects.toThrow(AppError);
    // La otra sala sigue en el store
    expect(store.has(room.roomId)).toBe(true);
  });
});
