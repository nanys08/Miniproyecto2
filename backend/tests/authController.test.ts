// Tests del authController (TS-01).
// Mockeamos los services para aislar el controller y verificar:
//   - Códigos de error estables expuestos al cliente.
//   - Mapeo correcto a HTTP status.
//   - Que los errores internos (Firebase, etc.) NO se filtren al cliente.

import type { Response } from "express";

const registerUserProfileMock = jest.fn();
const getUserProfileMock = jest.fn();
const isUsernameTakenMock = jest.fn();
const setUserOnlineStatusMock = jest.fn();
const revokeUserTokensMock = jest.fn();
const isEmailRegisteredMock = jest.fn();

jest.mock("../src/services/authService", () => ({
  registerUserProfile: (...args: unknown[]) => registerUserProfileMock(...args),
  getUserProfile: (...args: unknown[]) => getUserProfileMock(...args),
  isUsernameTaken: (...args: unknown[]) => isUsernameTakenMock(...args),
  setUserOnlineStatus: (...args: unknown[]) => setUserOnlineStatusMock(...args),
  revokeUserTokens: (...args: unknown[]) => revokeUserTokensMock(...args),
  isEmailRegistered: (...args: unknown[]) => isEmailRegisteredMock(...args),
}));

jest.mock("../src/utils/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// Tampoco queremos que Firebase Admin intente inicializarse en los tests del
// controller — los services están mockeados, pero el middleware u otros
// imports indirectos podrían tocarlo.
jest.mock("../src/config/firebase", () => ({
  db: {},
  auth: { verifyIdToken: jest.fn() },
}));

import * as authController from "../src/controllers/authController";
import type { AuthRequest } from "../src/middlewares/authMiddleware";
import { AppError, ErrorCode } from "../src/utils/errors";

const buildRes = () => {
  const res: Partial<Response> & {
    statusCode?: number;
    body?: unknown;
  } = {};
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res as Response;
  }) as unknown as Response["status"];
  res.json = jest.fn((data: unknown) => {
    res.body = data;
    return res as Response;
  }) as unknown as Response["json"];
  return res as Response & { statusCode?: number; body?: unknown };
};

const baseReq = (overrides: Partial<AuthRequest> = {}): AuthRequest =>
  ({
    user: { uid: "uid-1", email: "u@u.com" },
    body: {},
    params: {},
    ...overrides,
  } as AuthRequest);

beforeEach(() => {
  registerUserProfileMock.mockReset();
  getUserProfileMock.mockReset();
  isUsernameTakenMock.mockReset();
  setUserOnlineStatusMock.mockReset();
  revokeUserTokensMock.mockReset();
  isEmailRegisteredMock.mockReset();
});

describe("register — validaciones de entrada", () => {
  it("400 MISSING_FIELDS si falta username, fullName o provider", async () => {
    const res = buildRes();
    await authController.register(baseReq({ body: { username: "x" } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: ErrorCode.MISSING_FIELDS,
      message: expect.any(String),
    });
  });

  it("400 USERNAME_INVALID si username tiene 3 caracteres (mínimo 4)", async () => {
    const res = buildRes();
    await authController.register(
      baseReq({
        body: { username: "abc", fullName: "Ana", provider: "password" },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: ErrorCode.USERNAME_INVALID });
  });

  it("400 USERNAME_INVALID si username no cumple la regex", async () => {
    const res = buildRes();
    await authController.register(
      baseReq({
        body: { username: "ab", fullName: "Ana", provider: "password" },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: ErrorCode.USERNAME_INVALID });
  });

  it("acepta username con punto (alineado con el frontend)", async () => {
    registerUserProfileMock.mockResolvedValueOnce({ uid: "uid-1" });
    const res = buildRes();
    await authController.register(
      baseReq({
        body: { username: "ana.p", fullName: "Ana", provider: "password" },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
  });

  it("400 USERNAME_FORBIDDEN si el username contiene palabra prohibida", async () => {
    const res = buildRes();
    await authController.register(
      baseReq({
        body: { username: "xputox", fullName: "Ana", provider: "password" },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: ErrorCode.USERNAME_FORBIDDEN });
    expect(registerUserProfileMock).not.toHaveBeenCalled();
  });

  it("400 USERNAME_FORBIDDEN detecta variantes leet (p3ne)", async () => {
    const res = buildRes();
    await authController.register(
      baseReq({
        body: { username: "p3ne1", fullName: "Ana", provider: "password" },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: ErrorCode.USERNAME_FORBIDDEN });
  });

  it("400 PROVIDER_INVALID si provider no es 'password' ni 'google'", async () => {
    const res = buildRes();
    await authController.register(
      baseReq({
        body: { username: "anita", fullName: "Ana", provider: "facebook" },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: ErrorCode.PROVIDER_INVALID });
  });
});

describe("register — propaga AppError del service tal cual", () => {
  it("409 USERNAME_ALREADY_EXISTS cuando el service lanza ese código", async () => {
    registerUserProfileMock.mockRejectedValueOnce(
      new AppError(ErrorCode.USERNAME_ALREADY_EXISTS, 409)
    );
    const res = buildRes();
    await authController.register(
      baseReq({
        body: { username: "anita", fullName: "Ana", provider: "password" },
      }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({
      error: ErrorCode.USERNAME_ALREADY_EXISTS,
    });
  });

  it("409 PROFILE_ALREADY_EXISTS cuando el uid ya tiene perfil", async () => {
    registerUserProfileMock.mockRejectedValueOnce(
      new AppError(ErrorCode.PROFILE_ALREADY_EXISTS, 409)
    );
    const res = buildRes();
    await authController.register(
      baseReq({
        body: { username: "anita", fullName: "Ana", provider: "password" },
      }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({
      error: ErrorCode.PROFILE_ALREADY_EXISTS,
    });
  });
});

describe("register — no filtra errores internos", () => {
  it("500 INTERNAL_ERROR cuando el service lanza un Error genérico, sin filtrar el mensaje original", async () => {
    registerUserProfileMock.mockRejectedValueOnce(
      new Error("FIRESTORE: permission_denied en proyecto X (detalle interno)")
    );
    const res = buildRes();
    await authController.register(
      baseReq({
        body: { username: "anita", fullName: "Ana", provider: "password" },
      }),
      res
    );
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      error: ErrorCode.INTERNAL_ERROR,
      message: expect.any(String),
    });
    // El detalle interno NO debe haberse filtrado al cliente.
    expect(JSON.stringify(res.body)).not.toMatch(/FIRESTORE|permission_denied/i);
  });
});

describe("register — caso exitoso", () => {
  it("201 y devuelve el user creado con isUnivalle:false para correo externo", async () => {
    const fakeUser = {
      uid: "uid-1",
      username: "anita",
      fullName: "Ana",
      email: "u@u.com",
      avatar: "default_avatar.png",
      provider: "password",
      online: false,
      createdAt: new Date(),
    };
    registerUserProfileMock.mockResolvedValueOnce(fakeUser);
    const res = buildRes();
    await authController.register(
      baseReq({
        body: { username: "anita", fullName: "Ana", provider: "password" },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({
      user: { ...fakeUser, isUnivalle: false, university: "No identificado" },
    });
  });

  it("201 y devuelve isUnivalle:true + university:'Univalle' cuando el correo es del dominio Univalle", async () => {
    const fakeUser = {
      uid: "uid-2",
      username: "anau",
      fullName: "Ana",
      email: "ana.perez@correounivalle.edu.co",
      avatar: "default_avatar.png",
      provider: "password",
      online: false,
      createdAt: new Date(),
    };
    registerUserProfileMock.mockResolvedValueOnce(fakeUser);
    const res = buildRes();
    await authController.register(
      baseReq({
        user: { uid: "uid-2", email: "ana.perez@correounivalle.edu.co" },
        body: { username: "anau", fullName: "Ana", provider: "password" },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({
      user: { ...fakeUser, isUnivalle: true, university: "Univalle" },
    });
  });
});

describe("getMe", () => {
  it("200 con el perfil cuando existe (correo externo → isUnivalle:false)", async () => {
    getUserProfileMock.mockResolvedValueOnce({
      uid: "uid-1",
      username: "x",
      email: "x@gmail.com",
    });
    const res = buildRes();
    await authController.getMe(baseReq(), res);
    expect(res.statusCode).toBeUndefined(); // no se llamó status (default 200)
    expect(res.body).toEqual({
      user: {
        uid: "uid-1",
        username: "x",
        email: "x@gmail.com",
        isUnivalle: false,
        university: "No identificado",
      },
    });
  });

  it("200 con isUnivalle:true + university:'Univalle' cuando el correo persistido es del dominio Univalle", async () => {
    getUserProfileMock.mockResolvedValueOnce({
      uid: "uid-1",
      username: "anau",
      email: "ana.perez@correounivalle.edu.co",
    });
    const res = buildRes();
    await authController.getMe(baseReq(), res);
    expect(res.body).toEqual({
      user: {
        uid: "uid-1",
        username: "anau",
        email: "ana.perez@correounivalle.edu.co",
        isUnivalle: true,
        university: "Univalle",
      },
    });
  });

  it("404 PROFILE_NOT_FOUND cuando no existe", async () => {
    getUserProfileMock.mockResolvedValueOnce(null);
    const res = buildRes();
    await authController.getMe(baseReq(), res);
    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ error: ErrorCode.PROFILE_NOT_FOUND });
  });

  it("500 INTERNAL_ERROR si el service falla, sin filtrar el detalle", async () => {
    getUserProfileMock.mockRejectedValueOnce(
      new Error("INTERNAL: stack trace privado")
    );
    const res = buildRes();
    await authController.getMe(baseReq(), res);
    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ error: ErrorCode.INTERNAL_ERROR });
    expect(JSON.stringify(res.body)).not.toMatch(/stack trace privado/);
  });
});

describe("logout", () => {
  it("204 sin body, marca offline y revoca tokens del uid del request", async () => {
    setUserOnlineStatusMock.mockResolvedValueOnce(undefined);
    revokeUserTokensMock.mockResolvedValueOnce(undefined);

    const res = buildRes();
    await authController.logout(baseReq(), res);

    expect(setUserOnlineStatusMock).toHaveBeenCalledWith("uid-1", false);
    expect(revokeUserTokensMock).toHaveBeenCalledWith("uid-1");
    expect((res.status as jest.Mock).mock.calls[0]?.[0]).toBe(204);
  });

  it("500 INTERNAL_ERROR si revokeUserTokens falla, sin filtrar el detalle", async () => {
    setUserOnlineStatusMock.mockResolvedValueOnce(undefined);
    revokeUserTokensMock.mockRejectedValueOnce(
      new Error("INTERNAL: Firebase revoke failed XYZ-token-id")
    );
    const res = buildRes();
    await authController.logout(baseReq(), res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ error: ErrorCode.INTERNAL_ERROR });
    expect(JSON.stringify(res.body)).not.toMatch(/XYZ-token-id/);
  });
});

describe("checkUsername", () => {
  it("400 USERNAME_INVALID si el path param no cumple regex", async () => {
    const res = buildRes();
    await authController.checkUsername(
      baseReq({ params: { username: "ab" } as Record<string, string> }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: ErrorCode.USERNAME_INVALID });
    expect(isUsernameTakenMock).not.toHaveBeenCalled();
  });

  it("devuelve { available: true } cuando el username está libre", async () => {
    isUsernameTakenMock.mockResolvedValueOnce(false);
    const res = buildRes();
    await authController.checkUsername(
      baseReq({ params: { username: "libre1" } as Record<string, string> }),
      res
    );
    expect(res.body).toEqual({ available: true });
  });

  it("devuelve { available: false } cuando está tomado", async () => {
    isUsernameTakenMock.mockResolvedValueOnce(true);
    const res = buildRes();
    await authController.checkUsername(
      baseReq({ params: { username: "tomado" } as Record<string, string> }),
      res
    );
    expect(res.body).toEqual({ available: false });
  });

  it("devuelve { available: false } sin consultar DB si el username es profano", async () => {
    const res = buildRes();
    await authController.checkUsername(
      baseReq({ params: { username: "puta1" } as Record<string, string> }),
      res
    );
    expect(res.body).toEqual({ available: false });
    expect(isUsernameTakenMock).not.toHaveBeenCalled();
  });
});

describe("checkUnivalle", () => {
  it("200 con isUnivalle:true + university:'Univalle' para correo institucional", async () => {
    const res = buildRes();
    await authController.checkUnivalle(
      baseReq({ params: { email: "ana@correounivalle.edu.co" } as Record<string, string> }),
      res
    );
    expect(res.body).toEqual({
      isUnivalle: true,
      domain: "correounivalle.edu.co",
      university: "Univalle",
    });
  });

  it("200 con isUnivalle:false + university:'No identificado' para correo externo", async () => {
    const res = buildRes();
    await authController.checkUnivalle(
      baseReq({ params: { email: "ana@gmail.com" } as Record<string, string> }),
      res
    );
    expect(res.body).toEqual({
      isUnivalle: false,
      domain: "correounivalle.edu.co",
      university: "No identificado",
    });
  });

  it("200 sin importar capitalización del correo", async () => {
    const res = buildRes();
    await authController.checkUnivalle(
      baseReq({ params: { email: "Ana@CorreoUnivalle.edu.co" } as Record<string, string> }),
      res
    );
    expect(res.body).toEqual({
      isUnivalle: true,
      domain: "correounivalle.edu.co",
      university: "Univalle",
    });
  });

  it("400 EMAIL_INVALID si el path param no es un email válido", async () => {
    const res = buildRes();
    await authController.checkUnivalle(
      baseReq({ params: { email: "no-es-email" } as Record<string, string> }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: ErrorCode.EMAIL_INVALID });
  });
});

describe("checkEmail", () => {
  it("400 EMAIL_INVALID si el path param no es un email válido", async () => {
    const res = buildRes();
    await authController.checkEmail(
      baseReq({ params: { email: "no-es-un-email" } as Record<string, string> }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: ErrorCode.EMAIL_INVALID });
    expect(isEmailRegisteredMock).not.toHaveBeenCalled();
  });

  it("devuelve { available: true } cuando el email no está registrado", async () => {
    isEmailRegisteredMock.mockResolvedValueOnce(false);
    const res = buildRes();
    await authController.checkEmail(
      baseReq({ params: { email: "nuevo@example.com" } as Record<string, string> }),
      res
    );
    expect(res.body).toEqual({ available: true });
  });

  it("devuelve { available: false } cuando el email ya está registrado", async () => {
    isEmailRegisteredMock.mockResolvedValueOnce(true);
    const res = buildRes();
    await authController.checkEmail(
      baseReq({ params: { email: "tomado@example.com" } as Record<string, string> }),
      res
    );
    expect(res.body).toEqual({ available: false });
  });

  it("500 INTERNAL_ERROR si el service falla, sin filtrar el detalle", async () => {
    isEmailRegisteredMock.mockRejectedValueOnce(
      new Error("INTERNAL: firebase admin failure XYZ")
    );
    const res = buildRes();
    await authController.checkEmail(
      baseReq({ params: { email: "x@x.com" } as Record<string, string> }),
      res
    );
    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ error: ErrorCode.INTERNAL_ERROR });
    expect(JSON.stringify(res.body)).not.toMatch(/XYZ/);
  });
});
