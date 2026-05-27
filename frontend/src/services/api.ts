import { auth, firebaseConfigured } from "@/services/firebase";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function authHeader(): Promise<Record<string, string>> {
  if (!firebaseConfigured || !auth) return {};
  const currentUser = auth.currentUser;
  if (!currentUser) return {};
  try {
    // getIdToken() devuelve el token cacheado si es válido, o lo refresca
    // automáticamente si está a punto de expirar. No forzamos refresh aquí
    // para no ralentizar cada petición; deleteAccount() lo fuerza cuando
    // importa (operación destructiva).
    const token = await currentUser.getIdToken();
    return { Authorization: `Bearer ${token}` };
  } catch {
    // Si el refresh falla (sin red, token revocado, etc.) no enviamos
    // el header roto — el backend devolverá 401 y el usuario verá el error.
    return {};
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(await authHeader()),
  };

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(data?.error || `HTTP ${res.status}`, res.status);
  }

  return res.json() as Promise<T>;
}

// Cliente REST tipado contra el backend (/api/*).
// Adjunta el Firebase ID Token automáticamente cuando hay sesión activa y Firebase configurado.
export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};
