import { createContext } from "react";

export interface AppUser {
  uid: string;
  email: string | null;
  username?: string;
  displayName?: string;
  avatar?: string;
  isUnivalle?: boolean;
  university?: string;
}

export interface AuthContextValue {
  user: AppUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  register: (
    email: string,
    password: string,
    username: string,
    fullName: string,
    avatar: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
  /** Re-fetches /auth/me y actualiza el estado del usuario. Útil tras
   *  completar el registro de Google desde el modal de username. */
  refreshProfile: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);