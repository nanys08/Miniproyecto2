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

// Deriva un username válido a partir del displayName o email.
function deriveUsername(displayName: string | null, email: string | null): string {
  const base = (displayName || email?.split("@")[0] || "user")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita acentos combinables
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 20) || "user";
  return base;
}

// Tras un sign-in con Google: si el usuario no tiene perfil en Firestore,
// crea uno automáticamente derivando un username único.
async function ensureProfileExists(
  displayName: string | null,
  email: string | null
): Promise<void> {
  try {
    await api.get("/auth/me");
    return; // perfil ya existe
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 404) {
      throw err;
    }
  }

  // Perfil no existe → registrarlo. Si el username está tomado (400), agregamos sufijo.
  const base = deriveUsername(displayName, email);
  for (let i = 0; i < 5; i++) {
    const candidate =
      i === 0 ? base : `${base}_${Math.floor(1000 + Math.random() * 9000)}`;
    try {
      await api.post("/auth/register", { username: candidate });
      return;
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        continue; // username en uso, reintenta
      }
      throw err;
    }
  }
  throw new Error("No se pudo generar un username único");
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

  // Solo hidrata Firebase si está configurado; en modo demo se hidrata desde localStorage.
  useEffect(() => {
    if (!firebaseConfigured || !auth) {
      setLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(
        u ? { uid: u.uid, email: u.email, isDemo: false } : null
      );
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
          // Modo demo: cualquier email/contraseña no vacíos crean una sesión local.
          if (!email || !password) throw new Error("Credenciales requeridas");
          const fake: AppUser = {
            uid: `demo-${Date.now()}`,
            email,
            isDemo: true,
          };
          writeDemoUser(fake);
          setUser(fake);
          return;
        }
        await signInWithEmailAndPassword(auth, email, password);
      },
      async loginWithGoogle() {
        if (!firebaseConfigured || !auth) {
          // Modo demo: simula login con Google con datos genéricos
          const fake: AppUser = {
            uid: `demo-google-${Date.now()}`,
            email: "demo@google.local",
            isDemo: true,
          };
          writeDemoUser(fake);
          setUser(fake);
          return;
        }
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(auth, provider);
        // Asegura que exista perfil en Firestore (lo crea si es la primera vez)
        await ensureProfileExists(
          result.user.displayName,
          result.user.email
        );
      },
      async register(email, password, username) {
        if (!firebaseConfigured || !auth) {
          if (!email || !password || !username) {
            throw new Error("Todos los campos son requeridos");
          }
          const fake: AppUser = {
            uid: `demo-${Date.now()}`,
            email,
            isDemo: true,
          };
          writeDemoUser(fake);
          setUser(fake);
          return;
        }
        await createUserWithEmailAndPassword(auth, email, password);
        await api.post("/auth/register", { username });
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
