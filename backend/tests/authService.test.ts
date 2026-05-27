// Tests del authService (TS-01).
// Mockeamos ../src/config/firebase con un Firestore en memoria que simula:
//   - lecturas/escrituras directas por doc(uid)
//   - queries where('username','==',X).limit(1)
//   - runTransaction serializado para verificar comportamiento bajo concurrencia.

import type { User } from "../src/models/User";

const store = new Map<string, User>();

const makeDocRef = (uid: string) => ({
  __type: "doc" as const,
  uid,
  get: async () => ({
    exists: store.has(uid),
    data: () => store.get(uid) as User | undefined,
  }),
  set: async (data: User) => {
    store.set(uid, data);
  },
  update: async (partial: Partial<User>) => {
    const existing = store.get(uid);
    if (existing) store.set(uid, { ...existing, ...partial });
  },
  delete: async () => {
    store.delete(uid);
  },
});

const makeQuery = (username: string) => ({
  __type: "query" as const,
  username,
  limit: function () {
    return this;
  },
  get: async () => {
    const docs = Array.from(store.values()).filter((u) => u.username === username);
    return {
      empty: docs.length === 0,
      docs: docs.map((d) => ({ data: () => d })),
    };
  },
});

// Serializa transacciones para simular el comportamiento at-most-one-winner
// de Firestore cuando dos clientes pelean por el mismo doc/username.
let txLock: Promise<void> = Promise.resolve();

const dbMock = {
  collection: (_name: string) => ({
    doc: (uid: string) => makeDocRef(uid),
    where: (_field: string, _op: string, value: string) => ({
      limit: (_n: number) => makeQuery(value),
    }),
  }),
  runTransaction: async <T>(
    fn: (tx: {
      get: (
        refOrQuery: ReturnType<typeof makeDocRef> | ReturnType<typeof makeQuery>
      ) => Promise<unknown>;
      set: (ref: ReturnType<typeof makeDocRef>, data: User) => void;
      update: (ref: ReturnType<typeof makeDocRef>, data: Partial<User>) => void;
    }) => Promise<T>
  ): Promise<T> => {
    const prev = txLock;
    let release: () => void = () => {};
    txLock = new Promise<void>((r) => { release = r; });
    await prev;
    try {
      const tx = {
        get: async (
          refOrQuery: ReturnType<typeof makeDocRef> | ReturnType<typeof makeQuery>
        ) => refOrQuery.get(),
        set: (ref: ReturnType<typeof makeDocRef>, data: User) => {
          store.set(ref.uid, data);
        },
        update: (ref: ReturnType<typeof makeDocRef>, data: Partial<User>) => {
          const existing = store.get(ref.uid);
          if (existing) store.set(ref.uid, { ...existing, ...data });
        },
      };
      return await fn(tx);
    } finally {
      release();
    }
  },
};

const revokeRefreshTokensMock = jest.fn();
const deleteUserMock = jest.fn();

jest.mock("../src/config/firebase", () => ({
  db: dbMock,
  auth: {
    revokeRefreshTokens: (...args: unknown[]) => revokeRefreshTokensMock(...args),
    deleteUser: (...args: unknown[]) => deleteUserMock(...args),
  },
}));

jest.mock("../src/utils/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import * as authService from "../src/services/authService";
import { AppError, ErrorCode } from "../src/utils/errors";

beforeEach(() => {
  store.clear();
  txLock = Promise.resolve();
  revokeRefreshTokensMock.mockReset();
  deleteUserMock.mockReset();
});

// ─────────────────────────────────────────────────────────────────────────────
// registerUserProfile
// ─────────────────────────────────────────────────────────────────────────────

describe("registerUserProfile — caso feliz y persistencia", () => {
  it("persiste el perfil con TODOS los campos requeridos y nada más", async () => {
    const user = await authService.registerUserProfile(
      "uid-1", "juanp", "Juan Pérez", "juan@gmail.com", "password"
    );

    expect(user).toMatchObject({
      uid: "uid-1", username: "juanp", fullName: "Juan Pérez",
      email: "juan@gmail.com", provider: "password", avatar: "default_avatar.png", online: false,
    });
    expect(user.createdAt).toBeInstanceOf(Date);

    const persisted = store.get("uid-1")!;
    expect(Object.keys(persisted).sort()).toEqual(
      ["avatar", "createdAt", "email", "fullName", "online", "provider", "uid", "username"].sort()
    );
  });

  it("usa el avatar provisto cuando viene en parámetros", async () => {
    const user = await authService.registerUserProfile(
      "uid-2", "ana", "Ana Ruiz", "ana@gmail.com", "google", "https://photo.google/ana.png"
    );
    expect(user.avatar).toBe("https://photo.google/ana.png");
    expect(user.provider).toBe("google");
  });
});

describe("registerUserProfile — validaciones de unicidad", () => {
  it("rechaza con USERNAME_ALREADY_EXISTS (409) si otro usuario ya tiene ese username", async () => {
    await authService.registerUserProfile("uid-A", "tomado", "Primero", "a@a.com", "password");
    await expect(
      authService.registerUserProfile("uid-B", "tomado", "Segundo", "b@b.com", "google")
    ).rejects.toMatchObject({ code: ErrorCode.USERNAME_ALREADY_EXISTS, status: 409 });
    expect(store.size).toBe(1);
  });

  it("rechaza con PROFILE_ALREADY_EXISTS (409) si el uid ya tiene perfil", async () => {
    await authService.registerUserProfile("uid-X", "primero", "Nombre", "x@x.com", "password");
    await expect(
      authService.registerUserProfile("uid-X", "otro", "Otro Nombre", "x@x.com", "password")
    ).rejects.toMatchObject({ code: ErrorCode.PROFILE_ALREADY_EXISTS, status: 409 });
    expect(store.get("uid-X")!.username).toBe("primero");
  });
});

describe("registerUserProfile — concurrencia", () => {
  it("ante dos registros simultáneos con el mismo username, solo uno gana", async () => {
    const results = await Promise.allSettled([
      authService.registerUserProfile("uid-C1", "carrera", "Cliente Uno", "c1@c.com", "password"),
      authService.registerUserProfile("uid-C2", "carrera", "Cliente Dos", "c2@c.com", "google"),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const rejection = rejected[0] as PromiseRejectedResult;
    expect(rejection.reason).toBeInstanceOf(AppError);
    expect((rejection.reason as AppError).code).toBe(ErrorCode.USERNAME_ALREADY_EXISTS);

    const docsConUsername = Array.from(store.values()).filter((u) => u.username === "carrera");
    expect(docsConUsername).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// updateUserProfile
// ─────────────────────────────────────────────────────────────────────────────

describe("updateUserProfile — caso feliz", () => {
  it("actualiza username, fullName y avatar correctamente", async () => {
    await authService.registerUserProfile("uid-1", "juanp", "Juan Pérez", "j@j.com", "password");

    const updated = await authService.updateUserProfile("uid-1", {
      username: "juanp_new",
      fullName: "Juan P. Actualizado",
      avatar: "/avatars/avatar3.png",
    });

    expect(updated.username).toBe("juanp_new");
    expect(updated.fullName).toBe("Juan P. Actualizado");
    expect(updated.avatar).toBe("/avatars/avatar3.png");
    // Campos inmutables no cambian
    expect(updated.email).toBe("j@j.com");
    expect(updated.provider).toBe("password");
    expect(updated.uid).toBe("uid-1");
  });

  it("actualiza solo el avatar sin tocar username ni fullName", async () => {
    await authService.registerUserProfile("uid-2", "anap", "Ana P", "a@a.com", "google");
    const updated = await authService.updateUserProfile("uid-2", { avatar: "/avatars/avatar7.png" });
    expect(updated.avatar).toBe("/avatars/avatar7.png");
    expect(updated.username).toBe("anap");
    expect(updated.fullName).toBe("Ana P");
  });

  it("actualiza solo fullName sin tocar username ni avatar", async () => {
    await authService.registerUserProfile("uid-3", "pepep", "Pepe", "p@p.com", "password");
    const updated = await authService.updateUserProfile("uid-3", { fullName: "Pepe Actualizado" });
    expect(updated.fullName).toBe("Pepe Actualizado");
    expect(updated.username).toBe("pepep");
  });

  it("permite 'actualizar' el username con el mismo valor actual (idempotente)", async () => {
    await authService.registerUserProfile("uid-4", "mismouser", "Mismo", "m@m.com", "password");
    // No debe lanzar USERNAME_ALREADY_EXISTS aunque el username "existe"
    // porque pertenece al mismo usuario
    const updated = await authService.updateUserProfile("uid-4", { username: "mismouser" });
    expect(updated.username).toBe("mismouser");
  });
});

describe("updateUserProfile — validaciones de unicidad", () => {
  it("rechaza con USERNAME_ALREADY_EXISTS si el nuevo username pertenece a otro usuario", async () => {
    await authService.registerUserProfile("uid-A", "anny_dev", "Anny", "a@a.com", "password");
    await authService.registerUserProfile("uid-B", "bob_dev", "Bob", "b@b.com", "google");

    // uid-B intenta tomar el username de uid-A
    await expect(
      authService.updateUserProfile("uid-B", { username: "anny_dev" })
    ).rejects.toMatchObject({ code: ErrorCode.USERNAME_ALREADY_EXISTS, status: 409 });

    // Ambos usuarios mantienen sus usernames originales
    expect(store.get("uid-A")!.username).toBe("anny_dev");
    expect(store.get("uid-B")!.username).toBe("bob_dev");
  });

  it("rechaza con PROFILE_NOT_FOUND si el uid no tiene perfil en Firestore", async () => {
    await expect(
      authService.updateUserProfile("uid-inexistente", { fullName: "Alguien" })
    ).rejects.toMatchObject({ code: ErrorCode.PROFILE_NOT_FOUND, status: 404 });
  });
});

describe("updateUserProfile — concurrencia en username", () => {
  it("ante dos updates simultáneos del mismo username en usuarios distintos, solo uno gana", async () => {
    await authService.registerUserProfile("uid-E1", "user_e1", "E1", "e1@e.com", "password");
    await authService.registerUserProfile("uid-E2", "user_e2", "E2", "e2@e.com", "password");

    const results = await Promise.allSettled([
      authService.updateUserProfile("uid-E1", { username: "disputado" }),
      authService.updateUserProfile("uid-E2", { username: "disputado" }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(AppError);
    expect(((rejected[0] as PromiseRejectedResult).reason as AppError).code)
      .toBe(ErrorCode.USERNAME_ALREADY_EXISTS);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// deleteUserAccount
// ─────────────────────────────────────────────────────────────────────────────

describe("deleteUserAccount", () => {
  it("elimina el documento de Firestore y llama a auth.deleteUser con el uid", async () => {
    deleteUserMock.mockResolvedValueOnce(undefined);
    await authService.registerUserProfile("uid-D", "deleted", "To Delete", "d@d.com", "password");
    expect(store.has("uid-D")).toBe(true);

    await authService.deleteUserAccount("uid-D");

    // Doc eliminado de Firestore
    expect(store.has("uid-D")).toBe(false);
    // Auth.deleteUser llamado con el uid correcto
    expect(deleteUserMock).toHaveBeenCalledWith("uid-D");
  });

  it("rechaza con PROFILE_NOT_FOUND si el uid no tiene perfil en Firestore", async () => {
    await expect(
      authService.deleteUserAccount("uid-no-existe")
    ).rejects.toMatchObject({ code: ErrorCode.PROFILE_NOT_FOUND, status: 404 });
    // auth.deleteUser nunca debe haberse llamado
    expect(deleteUserMock).not.toHaveBeenCalled();
  });

  it("propaga el error si auth.deleteUser falla (doc Firestore ya borrado)", async () => {
    deleteUserMock.mockRejectedValueOnce(new Error("Firebase Auth error"));
    await authService.registerUserProfile("uid-F", "fail_user", "Fail", "f@f.com", "password");

    await expect(authService.deleteUserAccount("uid-F")).rejects.toThrow("Firebase Auth error");
    // El doc de Firestore ya fue borrado antes de que fallara Auth
    expect(store.has("uid-F")).toBe(false);
    expect(deleteUserMock).toHaveBeenCalledWith("uid-F");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isUsernameTaken
// ─────────────────────────────────────────────────────────────────────────────

describe("isUsernameTaken", () => {
  it("devuelve true si hay un usuario con ese username", async () => {
    await authService.registerUserProfile("uid-Y", "ocupado", "Y", "y@y.com", "password");
    await expect(authService.isUsernameTaken("ocupado")).resolves.toBe(true);
  });

  it("devuelve false si nadie lo tiene", async () => {
    await expect(authService.isUsernameTaken("libre")).resolves.toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getUserProfile
// ─────────────────────────────────────────────────────────────────────────────

describe("getUserProfile", () => {
  it("devuelve el doc cuando existe", async () => {
    await authService.registerUserProfile("uid-Z", "zeta", "Zeta", "z@z.com", "google");
    const profile = await authService.getUserProfile("uid-Z");
    expect(profile).toMatchObject({ uid: "uid-Z", username: "zeta", provider: "google" });
  });

  it("devuelve null si el uid no tiene perfil", async () => {
    await expect(authService.getUserProfile("noexiste")).resolves.toBeNull();
  });

  it("flujo login posterior: register → getUserProfile recupera lo persistido", async () => {
    const created = await authService.registerUserProfile(
      "uid-LP", "loginposterior", "Login Posterior", "lp@lp.com", "password"
    );
    const fetched = await authService.getUserProfile("uid-LP");
    expect(fetched).toEqual(created);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// setUserOnlineStatus
// ─────────────────────────────────────────────────────────────────────────────

describe("setUserOnlineStatus", () => {
  it("actualiza el campo online sin tocar los demás", async () => {
    await authService.registerUserProfile("uid-O", "ondemand", "O", "o@o.com", "password");
    await authService.setUserOnlineStatus("uid-O", true);
    expect(store.get("uid-O")!.online).toBe(true);
    expect(store.get("uid-O")!.username).toBe("ondemand");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// revokeUserTokens
// ─────────────────────────────────────────────────────────────────────────────

describe("revokeUserTokens", () => {
  it("delega en auth.revokeRefreshTokens con el uid", async () => {
    revokeRefreshTokensMock.mockResolvedValueOnce(undefined);
    await authService.revokeUserTokens("uid-R");
    expect(revokeRefreshTokensMock).toHaveBeenCalledWith("uid-R");
  });
});
