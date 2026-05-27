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

interface ProfileResponse {
  user: {
    username: string;
    fullName: string;
    avatar: string;
    phone?: string;
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
      phone: res.user.phone,
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
      },

      async loginWithGoogle() {
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(auth!, provider);
        sessionStorage.setItem("google-displayName", result.user.displayName ?? "");
        const profile = await fetchProfile(result.user).catch(() => null);
        if (!profile) {
          setUser({ uid: result.user.uid, email: result.user.email });
          throw new NeedsUsernameError();
        }
        setUser(profile);
      },

      async register(email, password, username, fullName, avatar) {
        await createUserWithEmailAndPassword(auth!, email, password);
        await api.post("/auth/register", { username, fullName, avatar, provider: "password" });
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

      async deleteAccount() {
        // 1. Eliminar en backend (Firestore + Firebase Auth)
        await api.delete("/auth/me");
        // 2. Limpiar estado local
        disconnectSocket();
        if (auth) await signOut(auth);
        // onAuthStateChanged disparará con null → setUser(null) → ProtectedRoute redirige
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
