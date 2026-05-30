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
import { isUnivalleEmail, UNIVALLE_DOMAIN } from "@/utils/validation";
import {
  AuthContext,
  type AuthContextValue,
  type AppUser,
} from "@/context/auth-context";

export class NeedsUsernameError extends Error {
  constructor() { super("needs-username"); }
}

/**
 * Se lanza cuando el usuario se autentica con un correo que NO pertenece al
 * dominio institucional de Univalle. La capa de UI debe mostrar un mensaje
 * claro y NO continuar con el registro/login.
 */
export class NotUnivalleError extends Error {
  constructor() {
    super(`Solo se permiten correos institucionales @${UNIVALLE_DOMAIN}`);
    this.name = "NotUnivalleError";
  }
}

/**
 * Traduce un error de `signInWithPopup` (Firebase) a un mensaje en español.
 * Devuelve `null` cuando el "error" es benigno (el usuario cerró el popup),
 * para que la UI no muestre una alerta innecesaria.
 */
export function googleAuthErrorMessage(err: unknown): string | null {
  const code = (err as { code?: string } | null)?.code;
  switch (code) {
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
    case "auth/user-cancelled":
      return null; // El usuario cerró el popup: no es un error real.
    case "auth/popup-blocked":
      return "El navegador bloqueó la ventana emergente. Habilita los pop-ups e inténtalo de nuevo.";
    case "auth/unauthorized-domain":
      return "Este dominio no está autorizado para iniciar sesión con Google.";
    case "auth/network-request-failed":
      return "Error de red. Verifica tu conexión e inténtalo de nuevo.";
    case "auth/operation-not-allowed":
      return "El inicio de sesión con Google no está habilitado.";
    default:
      return "No fue posible iniciar sesión con Google.";
  }
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
        // Restricción de acceso: solo correos institucionales de Univalle.
        // Si el correo de la cuenta Google no es del dominio, cerramos la
        // sesión recién abierta y abortamos antes de pedir username.
        if (!isUnivalleEmail(result.user.email ?? "")) {
          await signOut(auth!);
          throw new NotUnivalleError();
        }
        sessionStorage.setItem("google-displayName", result.user.displayName ?? "");
        const profile = await fetchProfile(result.user).catch(() => null);
        if (!profile) {
          setUser({ uid: result.user.uid, email: result.user.email });
          throw new NeedsUsernameError();
        }
        setUser(profile);
      },

      async register(email, password, username, fullName, avatar) {
        // Restricción de acceso: bloqueamos ANTES de crear la cuenta en
        // Firebase Auth para no dejar usuarios huérfanos sin perfil.
        if (!isUnivalleEmail(email)) {
          throw new NotUnivalleError();
        }
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
        // 1. Refrescar el token ANTES de la petición para evitar 401 por
        //    token expirado o caché desactualizada en el SDK de Firebase.
        //    Si el usuario no tiene sesión activa, lanzamos para que el
        //    componente muestre el error adecuado.
        const firebaseUser = auth?.currentUser;
        if (!firebaseUser) {
          throw new Error("No hay sesión activa. Inicia sesión de nuevo.");
        }
        await firebaseUser.getIdToken(true); // forceRefresh — actualiza caché interna

        // 2. Eliminar en backend (Firestore + Firebase Auth)
        await api.delete("/auth/me");

        // 3. Limpiar estado local
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
