import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
} from "firebase/auth";
import { auth, firebaseConfigured } from "@/services/firebase";
import { api, ApiError } from "@/services/api";
import { disconnectSocket } from "@/services/socket";
import {
  AuthContext,
  type AuthContextValue,
  type AppUser,
} from "@/context/auth-context";

const DEMO_STORAGE_KEY = "demo-user";

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

function readDemoUser(): AppUser | null {
  try {
    const raw = localStorage.getItem(DEMO_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AppUser) : null;
  } catch {
    return null;
  }
}

function writeDemoUser(u: AppUser | null) {
  if (u) localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(u));
  else localStorage.removeItem(DEMO_STORAGE_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(() =>
    firebaseConfigured ? null : readDemoUser()
  );
  const [loading, setLoading] = useState(firebaseConfigured);

  useEffect(() => {
    if (!firebaseConfigured || !auth) {
      setLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        try {
          const res = await api.get<{ user: { username: string; fullName: string; avatar: string } }>("/auth/me");
          setUser({
            uid: u.uid,
            email: u.email,
            username: res.user.username,
            displayName: res.user.fullName,
            avatar: res.user.avatar,
            isDemo: false,
          });
        } catch {
          setUser({ uid: u.uid, email: u.email, isDemo: false });
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
      demoMode: !firebaseConfigured,
      async login(email, password) {
        if (!firebaseConfigured || !auth) {
          if (!email || !password) throw new Error("Credenciales requeridas");
          const fake: AppUser = { uid: `demo-${Date.now()}`, email, isDemo: true };
          writeDemoUser(fake);
          setUser(fake);
          return;
        }
        await signInWithEmailAndPassword(auth, email, password);
      },
      async loginWithGoogle() {
        if (!firebaseConfigured || !auth) {
          const fake: AppUser = { uid: `demo-google-${Date.now()}`, email: "demo@google.local", isDemo: true };
          writeDemoUser(fake);
          setUser(fake);
          return;
        }
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(auth, provider);

        // Guarda el displayName en sessionStorage para el modal
        sessionStorage.setItem("google-displayName", result.user.displayName ?? "");
        
        sessionStorage.setItem("google-displayName", result.user.displayName ?? "");

        await ensureProfileExists();
        // Si llega aquí el usuario ya tenía perfil → va al dashboard
        void result;
      },
      async register(email, password, username, fullName, avatar) {
        if (!firebaseConfigured || !auth) {
          if (!email || !password || !username) {
            throw new Error("Todos los campos son requeridos");
          }
          const fake: AppUser = { uid: `demo-${Date.now()}`, email, isDemo: true };
          writeDemoUser(fake);
          setUser(fake);
          return;
        }
        await createUserWithEmailAndPassword(auth, email, password);
        await api.post("/auth/register", { username, fullName, avatar, provider: "password" });
      },
      async logout() {
        disconnectSocket();
        if (!firebaseConfigured || !auth) {
          writeDemoUser(null);
          setUser(null);
          return;
        }
        await signOut(auth);
      },
    }),
    [user, loading]
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}