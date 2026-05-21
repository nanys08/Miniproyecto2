// Tests del verifyToken middleware (TS-01: protección de rutas privadas).
// Escenarios críticos que pide la HU:
//   - acceso autorizado (token válido → next + req.user poblado)
//   - acceso bloqueado (sin token, header mal formado)
//   - token inválido / firma rota
//   - token expirado (auth/id-token-expired)
//   - token revocado (auth/id-token-revoked) — requiere checkRevoked=true

import type { NextFunction, Response } from "express";

const verifyIdTokenMock = jest.fn();

jest.mock("../src/config/firebase", () => ({
  db: {},
  auth: { verifyIdToken: (...args: unknown[]) => verifyIdTokenMock(...args) },
}));

jest.mock("../src/utils/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { verifyToken, AuthRequest } from "../src/middlewares/authMiddleware";
import { ErrorCode } from "../src/utils/errors";

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
  return res as Response & { statusCode?: number; body?: unknown };
};

const buildReq = (headers: Record<string, string | undefined> = {}): AuthRequest =>
  ({ headers } as unknown as AuthRequest);

const makeFirebaseError = (code: string) => {
  const err = new Error(`Firebase: ${code}`) as Error & { code: string };
  err.code = code;
  return err;
};

beforeEach(() => {
  verifyIdTokenMock.mockReset();
});

describe("verifyToken — acceso autorizado", () => {
  it("llama next() y popula req.user cuando el token es válido", async () => {
    verifyIdTokenMock.mockResolvedValueOnce({
      uid: "uid-1",
      email: "u@u.com",
    });
    const req = buildReq({ authorization: "Bearer good-token" });
    const res = buildRes();
    const next = jest.fn() as unknown as NextFunction;

    await verifyToken(req, res, next);

    expect(verifyIdTokenMock).toHaveBeenCalledWith("good-token", true);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toEqual({ uid: "uid-1", email: "u@u.com" });
    expect(res.statusCode).toBeUndefined();
  });
});

describe("verifyToken — acceso bloqueado por falta de credenciales", () => {
  it("401 MISSING_TOKEN si no hay header Authorization", async () => {
    const req = buildReq();
    const res = buildRes();
    const next = jest.fn() as unknown as NextFunction;

    await verifyToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ error: ErrorCode.MISSING_TOKEN });
    expect(verifyIdTokenMock).not.toHaveBeenCalled();
  });

  it("401 MISSING_TOKEN si el header no empieza por 'Bearer '", async () => {
    const req = buildReq({ authorization: "Basic abc" });
    const res = buildRes();
    const next = jest.fn() as unknown as NextFunction;

    await verifyToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ error: ErrorCode.MISSING_TOKEN });
  });

  it("401 MISSING_TOKEN si viene 'Bearer ' pero sin token", async () => {
    const req = buildReq({ authorization: "Bearer " });
    const res = buildRes();
    const next = jest.fn() as unknown as NextFunction;

    await verifyToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ error: ErrorCode.MISSING_TOKEN });
    expect(verifyIdTokenMock).not.toHaveBeenCalled();
  });
});

describe("verifyToken — token inválido / expirado / revocado", () => {
  it("401 INVALID_TOKEN cuando la firma es inválida", async () => {
    verifyIdTokenMock.mockRejectedValueOnce(
      makeFirebaseError("auth/argument-error")
    );
    const req = buildReq({ authorization: "Bearer broken" });
    const res = buildRes();
    const next = jest.fn() as unknown as NextFunction;

    await verifyToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ error: ErrorCode.INVALID_TOKEN });
  });

  it("401 INVALID_TOKEN cuando el token ha expirado (auth/id-token-expired)", async () => {
    verifyIdTokenMock.mockRejectedValueOnce(
      makeFirebaseError("auth/id-token-expired")
    );
    const req = buildReq({ authorization: "Bearer expired" });
    const res = buildRes();
    const next = jest.fn() as unknown as NextFunction;

    await verifyToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ error: ErrorCode.INVALID_TOKEN });
  });

  it("401 INVALID_TOKEN cuando el token fue revocado (auth/id-token-revoked)", async () => {
    verifyIdTokenMock.mockRejectedValueOnce(
      makeFirebaseError("auth/id-token-revoked")
    );
    const req = buildReq({ authorization: "Bearer revoked" });
    const res = buildRes();
    const next = jest.fn() as unknown as NextFunction;

    await verifyToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ error: ErrorCode.INVALID_TOKEN });
    // Confirmamos que el middleware activó checkRevoked=true.
    expect(verifyIdTokenMock).toHaveBeenCalledWith("revoked", true);
  });

  it("no filtra el detalle interno de Firebase en la respuesta", async () => {
    verifyIdTokenMock.mockRejectedValueOnce(
      new Error("INTERNAL: firebase admin SDK stack trace privado")
    );
    const req = buildReq({ authorization: "Bearer x" });
    const res = buildRes();
    const next = jest.fn() as unknown as NextFunction;

    await verifyToken(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(JSON.stringify(res.body)).not.toMatch(/stack trace privado/);
  });
});
