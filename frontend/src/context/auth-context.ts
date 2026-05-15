import { createContext } from "react";

// Usuario mínimo común a Firebase y a modo demo.
export interface AppUser {
  uid: string;
  email: string | null;
  // Solo `true` cuando Firebase no está configurado y se está usando un usuario simulado.
  isDemo?: boolean;
}

export interface AuthContextValue {
  user: AppUser | null;
  loading: boolean;
  /** `true` si la app corre sin Firebase configurado. */
  demoMode: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  register: (
    email: string,
    password: string,
    username: string
  ) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
