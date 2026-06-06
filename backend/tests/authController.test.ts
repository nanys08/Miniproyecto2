// Tests del authController (TS-01).
// Mockeamos los services para aislar el controller y verificar:
//   - Códigos de error estables expuestos al cliente.
//   - Mapeo correcto a HTTP status.
//   - Que los errores internos (Firebase, etc.) NO se filtren al cliente.

import type { Response } from "express";

const registerUserProfileMock = jest.fn();
const getUserProfileMock = jest.fn();
const updateUserProfileMock = jest.fn();
const deleteUserAccountMock = jest.fn();
const isUsernameTakenMock = jest.fn();
const setUserOnlineStatusMock = jest.fn();
const revokeUserTokensMock = jest.fn();
const isEmailRegisteredMock = jest.fn();

jest.mock("../src/services/authService", () => ({
  registerUserProfile: (...args: unknown[]) => registerUserProfileMock(...args),
  getUserProfile: (...args: unknown[]) => getUserProfileMock(...args),
  updateUserProfile: (...args: unknown[]) => updateUserProfileMock(...args),
  deleteUserAccount: (...args: unknown[]) => deleteUserAccountMock(...args),
  isUsernameTaken: (...args: unknown[]) => isUsernameTakenMock(...args),
  setUserOnlineStatus: (...args: unknown[]) => setUserOnlineStatusMock(...args),
  revokeUserTokens: (...args: unknown[]) => revokeUserTokensMock(...args),
  isEmailRegistered: (...args: unknown[]) => isEmailRegisteredMock(...args),
}));

jest.mock("../src/utils/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

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
  res.send = jest.fn(() => res as Response) as unknown as Response["send"];
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
  updateUserProfileMock.mockReset();
  deleteUserAccountMock.mockReset();
  isUsernameTakenMock.mockReset();
  setUserOnlineStatusMock.mockReset();
  revokeUserTokensMock.mockReset();
  isEmailRegisteredMock.mockReset();
});

// ─────────────────────────────────────────────────────────────────────────────
// register
// ─────────────────────────────────────────────────────────────────────────────

describe("register — validaciones de entrada", () => {
  it("400 MISSING_FIELDS si falta username, fullName o provider", async () => {
    const res = buildRes();
    await authController.register(baseReq({ body: { username: "x" } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: ErrorCode.MISSING_FIELDS,
      message: expect.any(String),
    });
  });

  it("400 USERNAME_INVALID si username tiene 3 caracteres (mínimo 4)", async () => {
    const res = buildRes();
    await authController.register(
      baseReq({ body: { username: "abc", fullName: "Ana", provider: "password" } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: ErrorCode.USERNAME_INVALID });
  });

  it("400 USERNAME_INVALID si username no cumple la regex", async () => {
    const res = buildRes();
    await authController.register(
      baseReq({ body: { username: "ab", fullName: "Ana", provider: "password" } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: ErrorCode.USERNAME_INVALID });
  });

  it("acepta username con punto (alineado con el frontend)", async () => {
    registerUserProfileMock.mockResolvedValueOnce({ uid: "uid-1", email: "u@u.com" });
    const res = buildRes();
    await authController.register(
      baseReq({ body: { username: "ana.p", fullName: "Ana", provider: "password" } }),
      res
    );
    expect(res.statusCode).toBe(201);
  });

  it("400 USERNAME_FORBIDDEN si el username contiene palabra prohibida", async () => {
    const res = buildRes();
    await authController.register(
      baseReq({ body: { username: "xputox", fullName: "Ana", provider: "password" } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: ErrorCode.USERNAME_FORBIDDEN });
    expect(registerUserProfileMock).not.toHaveBeenCalled();
  });

  it("400 USERNAME_FORBIDDEN detecta variantes leet (p3ne)", async () => {
    const res = buildRes();
    await authController.register(
      baseReq({ body: { username: "p3ne1", fullName: "Ana", provider: "password" } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: ErrorCode.USERNAME_FORBIDDEN });
  });

  it("400 FULLNAME_INVALID si fullName tiene menos de 3 caracteres", async () => {
    const res = buildRes();
    await authController.register(
      baseReq({ body: { username: "anita", fullName: "Jo", provider: "password" } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: ErrorCode.FULLNAME_INVALID });
    expect(registerUserProfileMock).not.toHaveBeenCalled();
  });

  it("400 FULLNAME_INVALID si fullName es solo espacios", async () => {
    const res = buildRes();
    await authController.register(
      baseReq({ body: { username: "anita", fullName: "   ", provider: "password" } }),
      res
    );
    expect(res.statusCode).toBe(400);
    // fullName con solo espacios cae primero en MISSING_FIELDS porque "   " es falsy tras
    // ser tratado como string vacío en el chequeo inicial? No: la cadena no vacía es truthy.
    expect(res.body).toMatchObject({ error: ErrorCode.FULLNAME_INVALID });
  });

  it("400 PROVIDER_INVALID si provider no es 'password' ni 'google'", async () => {
    const res = buildRes();
    await authController.register(
      baseReq({ body: { username: "anita", fullName: "Ana", provider: "facebook" } }),
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
      baseReq({ body: { username: "anita", fullName: "Ana", provider: "password" } }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ error: ErrorCode.USERNAME_ALREADY_EXISTS });
  });

  it("409 PROFILE_ALREADY_EXISTS cuando el uid ya tiene perfil", async () => {
    registerUserProfileMock.mockRejectedValueOnce(
      new AppError(ErrorCode.PROFILE_ALREADY_EXISTS, 409)
    );
    const res = buildRes();
    await authController.register(
      baseReq({ body: { username: "anita", fullName: "Ana", provider: "password" } }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ error: ErrorCode.PROFILE_ALREADY_EXISTS });
  });
});

describe("register — no filtra errores internos", () => {
  it("500 INTERNAL_ERROR sin filtrar el mensaje original", async () => {
    registerUserProfileMock.mockRejectedValueOnce(
      new Error("FIRESTORE: permission_denied en proyecto X (detalle interno)")
    );
    const res = buildRes();
    await authController.register(
      baseReq({ body: { username: "anita", fullName: "Ana", provider: "password" } }),
      res
    );
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ success: false, error: ErrorCode.INTERNAL_ERROR, message: expect.any(String) });
    expect(JSON.stringify(res.body)).not.toMatch(/FIRESTORE|permission_denied/i);
  });
});

describe("register — caso exitoso", () => {
  it("201 y devuelve el user creado con isUnivalle:false para correo externo", async () => {
    const fakeUser = {
      uid: "uid-1", username: "anita", fullName: "Ana", email: "u@u.com",
      avatar: "default_avatar.png", provider: "password", online: false, createdAt: new Date(),
    };
    registerUserProfileMock.mockResolvedValueOnce(fakeUser);
    const res = buildRes();
    await authController.register(
      baseReq({ body: { username: "anita", fullName: "Ana", provider: "password" } }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ user: { ...fakeUser, isUnivalle: false, university: "No identificado" } });
  });

  it("201 con isUnivalle:true cuando el correo es del dominio Univalle", async () => {
    const fakeUser = {
      uid: "uid-2", username: "anau", fullName: "Ana", email: "ana.perez@correounivalle.edu.co",
      avatar: "default_avatar.png", provider: "password", online: false, createdAt: new Date(),
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
    expect(res.body).toEqual({ user: { ...fakeUser, isUnivalle: true, university: "Univalle" } });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getMe
// ─────────────────────────────────────────────────────────────────────────────

describe("getMe", () => {
  it("200 con el perfil cuando existe (correo externo → isUnivalle:false)", async () => {
    getUserProfileMock.mockResolvedValueOnce({ uid: "uid-1", username: "x", email: "x@gmail.com" });
    const res = buildRes();
    await authController.getMe(baseReq(), res);
    expect(res.statusCode).toBeUndefined();
    expect(res.body).toEqual({
      user: { uid: "uid-1", username: "x", email: "x@gmail.com", isUnivalle: false, university: "No identificado" },
    });
  });

  it("200 con isUnivalle:true cuando el correo es del dominio Univalle", async () => {
    getUserProfileMock.mockResolvedValueOnce({
      uid: "uid-1", username: "anau", email: "ana.perez@correounivalle.edu.co",
    });
    const res = buildRes();
    await authController.getMe(baseReq(), res);
    expect(res.body).toEqual({
      user: { uid: "uid-1", username: "anau", email: "ana.perez@correounivalle.edu.co", isUnivalle: true, university: "Univalle" },
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
    getUserProfileMock.mockRejectedValueOnce(new Error("INTERNAL: stack trace privado"));
    const res = buildRes();
    await authController.getMe(baseReq(), res);
    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ error: ErrorCode.INTERNAL_ERROR });
    expect(JSON.stringify(res.body)).not.toMatch(/stack trace privado/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// updateMe
// ─────────────────────────────────────────────────────────────────────────────

describe("updateMe — validaciones de entrada", () => {
  it("400 MISSING_FIELDS si el body está vacío (ningún campo editable)", async () => {
    const res = buildRes();
    await authController.updateMe(baseReq({ body: {} }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: ErrorCode.MISSING_FIELDS });
    expect(updateUserProfileMock).not.toHaveBeenCalled();
  });

  it("400 MISSING_FIELDS si solo vienen campos inmutables (uid, email, provider)", async () => {
    const res = buildRes();
    await authController.updateMe(
      baseReq({ body: { uid: "hack", email: "hack@h.com", provider: "google" } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: ErrorCode.MISSING_FIELDS });
  });

  it("400 USERNAME_INVALID si username tiene menos de 4 chars", async () => {
    const res = buildRes();
    await authController.updateMe(baseReq({ body: { username: "ab" } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: ErrorCode.USERNAME_INVALID });
  });

  it("400 USERNAME_INVALID si username tiene más de 10 chars", async () => {
    const res = buildRes();
    await authController.updateMe(baseReq({ body: { username: "abcdefghijk" } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: ErrorCode.USERNAME_INVALID });
  });

  it("400 USERNAME_FORBIDDEN si el nuevo username contiene palabra prohibida", async () => {
    const res = buildRes();
    await authController.updateMe(baseReq({ body: { username: "xputox" } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: ErrorCode.USERNAME_FORBIDDEN });
    expect(updateUserProfileMock).not.toHaveBeenCalled();
  });

  it("400 FULLNAME_INVALID si fullName es solo espacios", async () => {
    const res = buildRes();
    await authController.updateMe(baseReq({ body: { fullName: "   " } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: ErrorCode.FULLNAME_INVALID });
  });

  it("400 FULLNAME_INVALID si fullName tiene menos de 3 caracteres", async () => {
    const res = buildRes();
    await authController.updateMe(baseReq({ body: { fullName: "Jo" } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: ErrorCode.FULLNAME_INVALID });
    expect(updateUserProfileMock).not.toHaveBeenCalled();
  });

  it("400 PHONE_INVALID si phone tiene menos de 10 dígitos", async () => {
    const res = buildRes();
    await authController.updateMe(baseReq({ body: { phone: "300123" } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: ErrorCode.PHONE_INVALID });
    expect(updateUserProfileMock).not.toHaveBeenCalled();
  });

  it("400 PHONE_INVALID si phone tiene más de 10 dígitos", async () => {
    const res = buildRes();
    await authController.updateMe(baseReq({ body: { phone: "30012345678" } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: ErrorCode.PHONE_INVALID });
  });

  it("acepta phone con caracteres no numéricos si suma 10 dígitos", async () => {
    updateUserProfileMock.mockResolvedValueOnce({
      uid: "uid-1", username: "x", fullName: "Ana", email: "u@u.com",
      avatar: "default_avatar.png", provider: "password", online: false,
      createdAt: new Date(), phone: "300 000 0000",
    });
    const res = buildRes();
    await authController.updateMe(baseReq({ body: { phone: "300 000 0000" } }), res);
    expect(res.statusCode).toBeUndefined();
    expect(updateUserProfileMock).toHaveBeenCalledWith("uid-1", { phone: "300 000 0000" });
  });

  it("acepta phone vacío (borra el valor)", async () => {
    updateUserProfileMock.mockResolvedValueOnce({
      uid: "uid-1", username: "x", fullName: "Ana", email: "u@u.com",
      avatar: "default_avatar.png", provider: "password", online: false,
      createdAt: new Date(), phone: "",
    });
    const res = buildRes();
    await authController.updateMe(baseReq({ body: { phone: "" } }), res);
    expect(res.statusCode).toBeUndefined();
    expect(updateUserProfileMock).toHaveBeenCalledWith("uid-1", { phone: "" });
  });
});

describe("updateMe — propaga AppError del service", () => {
  it("404 PROFILE_NOT_FOUND cuando el perfil no existe", async () => {
    updateUserProfileMock.mockRejectedValueOnce(new AppError(ErrorCode.PROFILE_NOT_FOUND, 404));
    const res = buildRes();
    await authController.updateMe(baseReq({ body: { username: "nuevo1" } }), res);
    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ error: ErrorCode.PROFILE_NOT_FOUND });
  });

  it("409 USERNAME_ALREADY_EXISTS cuando el nuevo username ya lo usa otro usuario", async () => {
    updateUserProfileMock.mockRejectedValueOnce(new AppError(ErrorCode.USERNAME_ALREADY_EXISTS, 409));
    const res = buildRes();
    await authController.updateMe(baseReq({ body: { username: "tomado1" } }), res);
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ error: ErrorCode.USERNAME_ALREADY_EXISTS });
  });

  it("500 INTERNAL_ERROR sin filtrar el detalle interno", async () => {
    updateUserProfileMock.mockRejectedValueOnce(new Error("FIRESTORE internal XYZ"));
    const res = buildRes();
    await authController.updateMe(baseReq({ body: { avatar: "/avatars/avatar2.png" } }), res);
    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ error: ErrorCode.INTERNAL_ERROR });
    expect(JSON.stringify(res.body)).not.toMatch(/XYZ/);
  });
});

describe("updateMe — casos exitosos", () => {
  const fakeUser = {
    uid: "uid-1", username: "nuevo1", fullName: "Ana P", email: "u@u.com",
    avatar: "/avatars/avatar3.png", provider: "password", online: false, createdAt: new Date(),
  };

  it("200 con el perfil actualizado, derivando isUnivalle:false para correo externo", async () => {
    updateUserProfileMock.mockResolvedValueOnce(fakeUser);
    const res = buildRes();
    await authController.updateMe(
      baseReq({ body: { username: "nuevo1", fullName: "Ana P", avatar: "/avatars/avatar3.png" } }),
      res
    );
    expect(res.statusCode).toBeUndefined(); // 200 por defecto
    expect(res.body).toEqual({ user: { ...fakeUser, isUnivalle: false, university: "No identificado" } });
  });

  it("200 solo con avatar — llama al service con solo ese campo", async () => {
    updateUserProfileMock.mockResolvedValueOnce({ ...fakeUser, avatar: "/avatars/avatar5.png" });
    const res = buildRes();
    await authController.updateMe(baseReq({ body: { avatar: "/avatars/avatar5.png" } }), res);
    expect(res.statusCode).toBeUndefined();
    expect(updateUserProfileMock).toHaveBeenCalledWith("uid-1", { avatar: "/avatars/avatar5.png" });
  });

  it("fullName se recorta de espacios antes de enviarse al service", async () => {
    updateUserProfileMock.mockResolvedValueOnce({ ...fakeUser, fullName: "Ana P" });
    const res = buildRes();
    await authController.updateMe(baseReq({ body: { fullName: "  Ana P  " } }), res);
    expect(updateUserProfileMock).toHaveBeenCalledWith("uid-1", { fullName: "Ana P" });
  });

  it("los campos inmutables enviados en el body son ignorados silenciosamente", async () => {
    updateUserProfileMock.mockResolvedValueOnce(fakeUser);
    const res = buildRes();
    await authController.updateMe(
      baseReq({ body: { username: "nuevo1", uid: "hack", email: "hack@h.com", provider: "google" } }),
      res
    );
    // uid, email y provider NO deben llegar al service
    expect(updateUserProfileMock).toHaveBeenCalledWith("uid-1", { username: "nuevo1" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// deleteMe
// ─────────────────────────────────────────────────────────────────────────────

describe("deleteMe", () => {
  it("204 sin body cuando la eliminación tiene éxito", async () => {
    deleteUserAccountMock.mockResolvedValueOnce(undefined);
    const res = buildRes();
    await authController.deleteMe(baseReq(), res);
    expect(deleteUserAccountMock).toHaveBeenCalledWith("uid-1");
    expect((res.status as jest.Mock).mock.calls[0]?.[0]).toBe(204);
  });

  it("404 PROFILE_NOT_FOUND cuando el perfil no existe en Firestore", async () => {
    deleteUserAccountMock.mockRejectedValueOnce(new AppError(ErrorCode.PROFILE_NOT_FOUND, 404));
    const res = buildRes();
    await authController.deleteMe(baseReq(), res);
    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ error: ErrorCode.PROFILE_NOT_FOUND });
  });

  it("500 INTERNAL_ERROR si el service falla, sin filtrar el detalle", async () => {
    deleteUserAccountMock.mockRejectedValueOnce(new Error("INTERNAL: Firebase deleteUser failed ABC"));
    const res = buildRes();
    await authController.deleteMe(baseReq(), res);
    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ error: ErrorCode.INTERNAL_ERROR });
    expect(JSON.stringify(res.body)).not.toMatch(/ABC/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// logout
// ─────────────────────────────────────────────────────────────────────────────

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
    revokeUserTokensMock.mockRejectedValueOnce(new Error("INTERNAL: Firebase revoke failed XYZ-token-id"));
    const res = buildRes();
    await authController.logout(baseReq(), res);
    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ error: ErrorCode.INTERNAL_ERROR });
    expect(JSON.stringify(res.body)).not.toMatch(/XYZ-token-id/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkUsername
// ─────────────────────────────────────────────────────────────────────────────

describe("checkUsername", () => {
  it("400 USERNAME_INVALID si el path param no cumple regex", async () => {
    const res = buildRes();
    await authController.checkUsername(
      baseReq({ params: { username: "ab" } as Record<string, string> }), res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: ErrorCode.USERNAME_INVALID });
    expect(isUsernameTakenMock).not.toHaveBeenCalled();
  });

  it("devuelve { available: true } cuando el username está libre", async () => {
    isUsernameTakenMock.mockResolvedValueOnce(false);
    const res = buildRes();
    await authController.checkUsername(
      baseReq({ params: { username: "libre1" } as Record<string, string> }), res
    );
    expect(res.body).toEqual({ available: true });
  });

  it("devuelve { available: false } cuando está tomado", async () => {
    isUsernameTakenMock.mockResolvedValueOnce(true);
    const res = buildRes();
    await authController.checkUsername(
      baseReq({ params: { username: "tomado" } as Record<string, string> }), res
    );
    expect(res.body).toEqual({ available: false });
  });

  it("devuelve { available: false } sin consultar DB si el username es profano", async () => {
    const res = buildRes();
    await authController.checkUsername(
      baseReq({ params: { username: "puta1" } as Record<string, string> }), res
    );
    expect(res.body).toEqual({ available: false });
    expect(isUsernameTakenMock).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkUnivalle
// ─────────────────────────────────────────────────────────────────────────────

describe("checkUnivalle", () => {
  it("200 con isUnivalle:true + university:'Univalle' para correo institucional", async () => {
    const res = buildRes();
    await authController.checkUnivalle(
      baseReq({ params: { email: "ana@correounivalle.edu.co" } as Record<string, string> }), res
    );
    expect(res.body).toEqual({ isUnivalle: true, domain: "correounivalle.edu.co", university: "Univalle" });
  });

  it("200 con isUnivalle:false para correo externo", async () => {
    const res = buildRes();
    await authController.checkUnivalle(
      baseReq({ params: { email: "ana@gmail.com" } as Record<string, string> }), res
    );
    expect(res.body).toEqual({ isUnivalle: false, domain: "correounivalle.edu.co", university: "No identificado" });
  });

  it("200 sin importar capitalización del correo", async () => {
    const res = buildRes();
    await authController.checkUnivalle(
      baseReq({ params: { email: "Ana@CorreoUnivalle.edu.co" } as Record<string, string> }), res
    );
    expect(res.body).toEqual({ isUnivalle: true, domain: "correounivalle.edu.co", university: "Univalle" });
  });

  it("400 EMAIL_INVALID si el path param no es un email válido", async () => {
    const res = buildRes();
    await authController.checkUnivalle(
      baseReq({ params: { email: "no-es-email" } as Record<string, string> }), res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: ErrorCode.EMAIL_INVALID });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkEmail
// ─────────────────────────────────────────────────────────────────────────────

describe("checkEmail", () => {
  it("400 EMAIL_INVALID si el path param no es un email válido", async () => {
    const res = buildRes();
    await authController.checkEmail(
      baseReq({ params: { email: "no-es-un-email" } as Record<string, string> }), res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: ErrorCode.EMAIL_INVALID });
    expect(isEmailRegisteredMock).not.toHaveBeenCalled();
  });

  it("devuelve { available: true } cuando el email no está registrado", async () => {
    isEmailRegisteredMock.mockResolvedValueOnce(false);
    const res = buildRes();
    await authController.checkEmail(
      baseReq({ params: { email: "nuevo@example.com" } as Record<string, string> }), res
    );
    expect(res.body).toEqual({ available: true });
  });

  it("devuelve { available: false } cuando el email ya está registrado", async () => {
    isEmailRegisteredMock.mockResolvedValueOnce(true);
    const res = buildRes();
    await authController.checkEmail(
      baseReq({ params: { email: "tomado@example.com" } as Record<string, string> }), res
    );
    expect(res.body).toEqual({ available: false });
  });

  it("500 INTERNAL_ERROR si el service falla, sin filtrar el detalle", async () => {
    isEmailRegisteredMock.mockRejectedValueOnce(new Error("INTERNAL: firebase admin failure XYZ"));
    const res = buildRes();
    await authController.checkEmail(
      baseReq({ params: { email: "x@x.com" } as Record<string, string> }), res
    );
    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ error: ErrorCode.INTERNAL_ERROR });
    expect(JSON.stringify(res.body)).not.toMatch(/XYZ/);
  });
});
