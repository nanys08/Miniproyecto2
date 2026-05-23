import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
} from "firebase/auth";
import { auth } from "@/services/firebase";
import { api, ApiError } from "@/services/api";
import { disconnectSocket } from "@/services/socket";
import {
  AuthContext,
  type AuthContextValue,
  type AppUser,
} from "@/context/auth-context";

export class NeedsUsernameError extends Error {
  constructor() { super("needs-username"); }
}

async function ensureProfileExists(): Promise<void> {
  try {
    await api.get("/auth/me");
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      throw new NeedsUsernameError();
    }
    throw err;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) { setLoading(false); return; }
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        try {
          const res = await api.get<{ user: { username: string; fullName: string; avatar: string; isUnivalle?: boolean; university?: string; } }>("/auth/me");
          setUser({
            uid: u.uid,
            email: u.email,
            username: res.user.username,
            displayName: res.user.fullName,
            avatar: res.user.avatar,
            isUnivalle: res.user.isUnivalle,
            university: res.user.university,
          });
        } catch {
          setUser({ uid: u.uid, email: u.email });
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      demoMode: false,
      async login(email, password) {
        await signInWithEmailAndPassword(auth!, email, password);
      },
      async loginWithGoogle() {
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(auth!, provider);
        sessionStorage.setItem("google-displayName", result.user.displayName ?? "");
        await ensureProfileExists();
        // Recarga el perfil después de registrarse
        try {
          const res = await api.get<{ user: { username: string; fullName: string; avatar: string; isUnivalle?: boolean; university?: string } }>("/auth/me");
          setUser({
            uid: result.user.uid,
            email: result.user.email,
            username: res.user.username,
            displayName: res.user.fullName,
            avatar: res.user.avatar,
            isUnivalle: res.user.isUnivalle,
            university: res.user.university,
          });
        } catch {
          // Si falla, el onAuthStateChanged lo manejará
        }
        void result;
      },
      async register(email, password, username, fullName, avatar) {
        await createUserWithEmailAndPassword(auth!, email, password);
        await api.post("/auth/register", { username, fullName, avatar, provider: "password" });
        // Actualiza el estado inmediatamente sin esperar al onAuthStateChanged
        const firebaseUser = auth!.currentUser;
        if (firebaseUser) {
          const res = await api.get<{ user: { username: string; fullName: string; avatar: string; isUnivalle?: boolean; university?: string } }>("/auth/me");
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            username: res.user.username,
            displayName: res.user.fullName,
            avatar: res.user.avatar,
            isUnivalle: res.user.isUnivalle,
            university: res.user.university,
          });
        }
      },
      async logout() {
        disconnectSocket();
        await signOut(auth!);
      },
    }),
    [user, loading]
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}