import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  type User as FirebaseUser,
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

/** Tipado del subconjunto de la respuesta /auth/me que nos interesa. */
interface ProfileResponse {
  user: {
    username: string;
    fullName: string;
    avatar: string;
    isUnivalle?: boolean;
    university?: string;
  };
}

/**
 * Llama a /auth/me y devuelve un AppUser completo, o `null` si no hay perfil
 * en Firestore (404). Cualquier otro error se propaga.
 */
async function fetchProfile(
  firebaseUser: Pick<FirebaseUser, "uid" | "email">
): Promise<AppUser | null> {
  try {
    const res = await api.get<ProfileResponse>("/auth/me");
    return {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      username: res.user.username,
      displayName: res.user.fullName,
      avatar: res.user.avatar,
      isUnivalle: res.user.isUnivalle,
      university: res.user.university,
    };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return null; // Perfil no existe aún (primer login Google)
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
        const profile = await fetchProfile(u).catch(() => null);
        if (profile) {
          setUser(profile);
        } else {
          // Autenticado en Firebase pero sin perfil en Firestore todavía
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

      async login(email, password) {
        await signInWithEmailAndPassword(auth!, email, password);
        // onAuthStateChanged se encarga de actualizar el estado del usuario
      },

      async loginWithGoogle() {
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(auth!, provider);
        // Guardar displayName de Google para usarlo luego en el modal de registro
        sessionStorage.setItem("google-displayName", result.user.displayName ?? "");

        // Verificar si el usuario ya tiene perfil en Firestore
        const profile = await fetchProfile(result.user).catch(() => null);
        if (!profile) {
          // Sin perfil: dejar el estado como "parcial" y señalizar al caller
          setUser({ uid: result.user.uid, email: result.user.email });
          throw new NeedsUsernameError();
        }
        // Con perfil: actualizar estado inmediatamente
        setUser(profile);
      },

      async register(email, password, username, fullName, avatar) {
        await createUserWithEmailAndPassword(auth!, email, password);
        await api.post("/auth/register", { username, fullName, avatar, provider: "password" });
        // Actualizar estado inmediatamente sin esperar al onAuthStateChanged
        const firebaseUser = auth!.currentUser;
        if (firebaseUser) {
          const profile = await fetchProfile(firebaseUser);
          if (profile) setUser(profile);
        }
      },

      async refreshProfile() {
        const firebaseUser = auth?.currentUser;
        if (!firebaseUser) return;
        const profile = await fetchProfile(firebaseUser).catch(() => null);
        if (profile) {
          setUser(profile);
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
