import { createContext } from "react";

export interface AppUser {
  uid: string;
  email: string | null;
  username?: string;
  displayName?: string;
  avatar?: string;
  isDemo?: boolean;
}

export interface AuthContextValue {
  user: AppUser | null;
  loading: boolean;
  demoMode: boolean;
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
}

export const AuthContext = createContext<AuthContextValue | null>(null);