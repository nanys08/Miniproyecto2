// Tests del mapper de errores de Firestore.
// Verificamos que códigos conocidos del Admin SDK se traducen a AppError
// con el status HTTP correcto, y que NO se filtra el mensaje original
// (puede contener paths/project ID internos).

import { AppError, ErrorCode, mapFirestoreError } from "../src/utils/errors";

describe("mapFirestoreError", () => {
  it("devuelve null para entrada vacía / no-objeto", () => {
    expect(mapFirestoreError(null)).toBeNull();
    expect(mapFirestoreError(undefined)).toBeNull();
    expect(mapFirestoreError("string")).toBeNull();
    expect(mapFirestoreError(42)).toBeNull();
  });

  it("devuelve null cuando el objeto no tiene `code`", () => {
    expect(mapFirestoreError({ message: "boom" })).toBeNull();
    expect(mapFirestoreError(new Error("boom"))).toBeNull();
  });

  it("permission-denied → INTERNAL_ERROR 500 sin filtrar detalles", () => {
    const err = { code: "permission-denied", message: "internal path /x/y/z" };
    const mapped = mapFirestoreError(err);
    expect(mapped).toBeInstanceOf(AppError);
    expect(mapped?.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(mapped?.status).toBe(500);
    expect(mapped?.message).not.toContain("/x/y/z");
  });

  it("permission-denied (gRPC code 7) → INTERNAL_ERROR 500", () => {
    const mapped = mapFirestoreError({ code: 7 });
    expect(mapped?.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(mapped?.status).toBe(500);
  });

  it("not-found → PROFILE_NOT_FOUND 404", () => {
    const mapped = mapFirestoreError({ code: "not-found" });
    expect(mapped?.code).toBe(ErrorCode.PROFILE_NOT_FOUND);
    expect(mapped?.status).toBe(404);
  });

  it("not-found (gRPC code 5) → PROFILE_NOT_FOUND 404", () => {
    const mapped = mapFirestoreError({ code: 5 });
    expect(mapped?.code).toBe(ErrorCode.PROFILE_NOT_FOUND);
    expect(mapped?.status).toBe(404);
  });

  it("unavailable → INTERNAL_ERROR 503 (transitorio)", () => {
    const mapped = mapFirestoreError({ code: "unavailable" });
    expect(mapped?.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(mapped?.status).toBe(503);
  });

  it("deadline-exceeded → INTERNAL_ERROR 503 (transitorio)", () => {
    const mapped = mapFirestoreError({ code: "deadline-exceeded" });
    expect(mapped?.status).toBe(503);
  });

  it("códigos desconocidos quedan en null (catch-all del controller)", () => {
    expect(mapFirestoreError({ code: "aborted" })).toBeNull();
    expect(mapFirestoreError({ code: "internal" })).toBeNull();
    expect(mapFirestoreError({ code: "resource-exhausted" })).toBeNull();
  });
});
