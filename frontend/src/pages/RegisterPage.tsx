import { useState, useEffect, useRef, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import Input from "@/components/Input";
import Button from "@/components/Button";
import GoogleButton from "@/components/GoogleButton";
import Logo from "@/components/Logo";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import { NeedsUsernameError, googleAuthErrorMessage } from "@/context/AuthContext";
import { api, ApiError } from "@/services/api";

const AVATARS = [
  "/avatars/avatar1.png",
  "/avatars/avatar2.png",
  "/avatars/avatar3.png",
  "/avatars/avatar4.png",
  "/avatars/avatar5.png",
  "/avatars/avatar6.png",
  "/avatars/avatar7.png",
  "/avatars/avatar8.png",
];

const USERNAME_REGEX = /^[a-zA-Z0-9_.]{4,10}$/;
const USERNAME_MIN = 4;
const USERNAME_MAX = 10;
const USERNAME_CHARSET = /^[a-zA-Z0-9_.]+$/;

/**
 * Razón específica por la que un username falla la regex (para feedback
 * en tiempo real). Devuelve `null` cuando el valor cumple la regex
 * completa (4-10 caracteres del charset permitido).
 */
function usernameInvalidReason(value: string): string | null {
  if (!value) return null;
  if (value.length < USERNAME_MIN)
    return `Mínimo ${USERNAME_MIN} caracteres`;
  if (value.length > USERNAME_MAX)
    return `Máximo ${USERNAME_MAX} caracteres`;
  if (!USERNAME_CHARSET.test(value))
    return "Solo letras, números, punto y guion bajo";
  return null;
}

type UsernameStatus =
  | "idle"
  | "checking"
  | "available"
  | "taken"
  | "invalid"
  | "check_failed";

export default function RegisterPage() {
  const { register, loginWithGoogle, user: authUser, refreshProfile } = useAuth();
  const { show } = useToast();
  const navigate = useNavigate();

  const [avatar, setAvatar] = useState<number | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const [avatarError, setAvatarError] = useState("");
  const [fullNameError, setFullNameError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [termsError, setTermsError] = useState("");
  const [globalError, setGlobalError] = useState("");

  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const googleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Sequence numbers para descartar respuestas obsoletas si el usuario
  // sigue tecleando mientras una llamada al backend está en vuelo.
  const checkSeqRef = useRef(0);
  const googleCheckSeqRef = useRef(0);

  const [googleAvatar, setGoogleAvatar] = useState<number | null>(null);
  const [googleAvatarError, setGoogleAvatarError] = useState("");
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const [googleUsername, setGoogleUsername] = useState("");
  const [googleUsernameStatus, setGoogleUsernameStatus] = useState<UsernameStatus>("idle");
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleUsernameError, setGoogleUsernameError] = useState("");

  const [loading, setLoading] = useState(false);
  const isManualRegisteringRef = useRef(false);

  // Si el usuario llegó aquí autenticado con Google pero sin perfil
  // (redirigido desde /login), mostramos el modal de completar registro.
  // Ignoramos el estado transitorio que ocurre durante el registro manual.
  useEffect(() => {
    if (authUser && !authUser.username && !isManualRegisteringRef.current) {
      setShowGoogleModal(true);
    }
  }, [authUser]);

  // El status se actualiza SINCRÓNICAMENTE en el `onChange` del input
  // (más abajo) — así el botón se deshabilita en el mismo render que el
  // teclazo, sin ventana de carrera. Este efecto solo se encarga de
  // disparar el fetch debounced cuando el status es "checking" y de
  // descartar respuestas obsoletas si el usuario sigue tecleando mientras
  // una llamada al backend está en vuelo.
  useEffect(() => {
    if (usernameStatus !== "checking") return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const seq = ++checkSeqRef.current;
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.get<{ available: boolean }>(`/auth/check-username/${username}`);
        if (seq !== checkSeqRef.current) return; // hay una verificación más nueva
        setUsernameStatus(res.available ? "available" : "taken");
      } catch {
        if (seq !== checkSeqRef.current) return;
        setUsernameStatus("check_failed");
      }
    }, 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [username, usernameStatus]);

  function validateAll(): boolean {
    let valid = true;
    if (avatar === null) { setAvatarError("Elige un avatar"); valid = false; } else setAvatarError("");
    if (!fullName.trim() || fullName.trim().length < 3) { setFullNameError("El nombre debe tener al menos 3 caracteres"); valid = false; } else setFullNameError("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setEmailError("Ingresa un correo electrónico válido"); valid = false; } else setEmailError("");
    if (!USERNAME_REGEX.test(username)) { setUsernameError("Entre 4 y 10 caracteres"); valid = false; } else setUsernameError("");
    if (usernameStatus === "taken") { setUsernameError("Username ya existe"); valid = false; }
    const hasMin = password.length >= 8;
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSymbol = /[^a-zA-Z0-9]/.test(password);
    if (!hasMin || !hasUpper || !hasLower || !hasNumber || !hasSymbol) {
      setPasswordError("Mínimo 8 caracteres, 1 mayúscula, 1 minúscula, 1 número y 1 símbolo");
      valid = false;
    } else {
      setPasswordError("");
    }
    if (!acceptedTerms) { setTermsError("Debes aceptar los términos"); valid = false; } else setTermsError("");
    return valid;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setGlobalError("");
    if (!validateAll()) return;
    // Defensa en profundidad: el botón ya está disabled hasta que el
    // username esté server-verified como disponible, pero el Enter dentro
    // de un input podría saltarse esa barrera. Aquí bloqueamos también.
    if (usernameStatus !== "available") {
      if (usernameStatus === "checking") {
        setUsernameError("Espera un momento, estamos verificando el username…");
      }
      return;
    }
    setLoading(true);
    isManualRegisteringRef.current = true;
    try {
      await register(email, password, username, fullName, AVATARS[avatar!]);
      show("success", "¡Cuenta creada exitosamente!");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      // Mapear códigos del backend a errores de campo (defensa en profundidad)
      if (err instanceof ApiError) {
        switch (err.message) {
          case "FULLNAME_INVALID":
            setFullNameError("El nombre debe tener al menos 3 caracteres");
            break;
          case "USERNAME_INVALID":
            setUsernameError("Entre 4 y 10 caracteres: letras, números, punto y guion bajo");
            break;
          case "USERNAME_ALREADY_EXISTS":
            setUsernameError("Username ya existe");
            break;
          case "USERNAME_FORBIDDEN":
            setUsernameError("Ese username no está permitido");
            break;
          default:
            setGlobalError("Ocurrió un error de conexión, inténtalo nuevamente");
        }
      } else {
        setGlobalError("Ocurrió un error de conexión, inténtalo nuevamente");
      }
    } finally {
      setLoading(false);
      isManualRegisteringRef.current = false;
    }
  }

  async function handleGoogle() {
    setGlobalError("");
    setGoogleLoading(true);
    try {
      await loginWithGoogle();
      show("success", "Inicio de sesión exitoso");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      if (err instanceof NeedsUsernameError) {
        // El usuario se autenticó con Google pero no tiene perfil.
        // El useEffect detectará authUser sin username y abrirá el modal.
        setShowGoogleModal(true);
      } else {
        console.error("Google sign-in falló:", err);
        const msg = googleAuthErrorMessage(err);
        if (msg) setGlobalError(msg);
      }
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleGoogleUsernameSubmit(e: FormEvent) {
    e.preventDefault();
    if (googleAvatar === null) { setGoogleAvatarError("Elige un avatar"); return; }
    if (!USERNAME_REGEX.test(googleUsername)) { setGoogleUsernameError("Username inválido"); return; }
    // Defensa en profundidad: el botón está disabled mientras el username
    // no esté "available", pero el Enter podría bypassear. Solo
    // permitimos enviar cuando el backend confirmó disponibilidad.
    if (googleUsernameStatus !== "available") {
      if (googleUsernameStatus === "checking") {
        setGoogleUsernameError("Espera un momento, estamos verificando…");
      } else if (googleUsernameStatus === "taken") {
        setGoogleUsernameError("Ese username ya está en uso, elige otro");
      }
      return;
    }
    setGoogleLoading(true);
    try {
      await api.post("/auth/register", {
        username: googleUsername,
        fullName: sessionStorage.getItem("google-displayName") || authUser?.displayName || "Usuario",
        avatar: AVATARS[googleAvatar],
        provider: "google",
      });
      // Refrescar el estado del usuario con el perfil recién creado
      await refreshProfile();
      show("success", "¡Cuenta creada exitosamente!");
      setShowGoogleModal(false);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      // El servidor es la verdad: si el username estaba realmente tomado o
      // el regex falló en el server, lo decimos al usuario en términos claros.
      if (err instanceof ApiError) {
        switch (err.message) {
          case "USERNAME_ALREADY_EXISTS":
            setGoogleUsernameError("Ese username ya está en uso, elige otro");
            break;
          case "USERNAME_INVALID":
            setGoogleUsernameError("Username inválido (4-10 caracteres: letras, números, . y _)");
            break;
          case "USERNAME_FORBIDDEN":
            setGoogleUsernameError("Ese username no está permitido");
            break;
          default:
            setGoogleUsernameError("Error al guardar el username, intenta de nuevo");
        }
      } else {
        setGoogleUsernameError("Error al guardar el username, intenta de nuevo");
      }
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 w-screen h-screen bg-slate-50 overflow-y-auto flex items-start justify-center py-12 px-4 box-border z-10">
        <div className="w-full max-w-[850px] my-auto bg-white rounded-2xl p-6 md:p-10 shadow-[0_4px_25px_rgba(0,0,0,0.04)] border border-slate-100 box-border block text-left">

          <div className="flex items-center gap-3 mb-6 w-full">
            <Logo size="lg" showText={false} />
            <span className="text-xl font-bold text-slate-900 tracking-tight">EstudioColab</span>
          </div>

          <div className="text-center mb-6 w-full">
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Crea tu cuenta</h1>
            <p className="mt-1 text-sm text-slate-500">Únete y empieza a estudiar en equipo</p>
          </div>

          <div className="max-w-md mx-auto mb-6 w-full">
            <GoogleButton
              type="button"
              onClick={handleGoogle}
              isLoading={googleLoading}
              className="w-full !bg-white !border !border-slate-200 !text-slate-800 hover:!bg-slate-50 !py-3 !text-sm !rounded-xl"
            />
          </div>

          <div className="my-6 flex items-center gap-3 w-full" aria-hidden="true">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-sm text-slate-400">o</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          {globalError && (
            <p role="alert" aria-live="assertive"
              className="mb-4 flex items-center gap-1.5 text-sm text-red-700 justify-center w-full">
              <span aria-hidden="true">⚠</span> {globalError}
            </p>
          )}

          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6 w-full box-border">

            <fieldset className="w-full block box-border">
              <legend className="mb-4 text-base font-bold text-slate-900">Avatares</legend>
              {avatarError && (
                <p role="alert" className="mb-2 text-sm text-red-600">⚠ {avatarError}</p>
              )}
              <div
                className={`grid grid-cols-8 gap-2 md:gap-3 w-full items-end ${avatarError ? "ring-2 ring-red-400 rounded-xl p-2" : ""}`}
                role="radiogroup"
                aria-label="Selecciona tu avatar"
                style={{ display: 'grid', gridTemplateColumns: 'repeat(8, minmax(0, 1fr))' }}
              >
                {AVATARS.map((src, i) => (
                  <div key={i} className="flex flex-col items-center w-full box-border">
                    <span className="text-sm font-bold text-slate-900 mb-1.5 block text-center">
                      {i + 1}
                    </span>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={avatar === i}
                      aria-label={`Avatar ${i + 1}`}
                      onClick={() => { setAvatar(i); setAvatarError(""); }}
                      className={`relative w-full aspect-square rounded-xl overflow-hidden transition-all focus-visible:ring-2 focus-visible:ring-blue-500 block bg-slate-50
                        ${avatar === i
                          ? "ring-4 ring-blue-400 shadow-sm"
                          : "ring-1 ring-slate-200 hover:ring-slate-300"
                        }`}
                    >
                      <img
                        src={src}
                        alt={`Avatar ${i + 1}`}
                        className="w-full h-full object-cover block"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                          (e.target as HTMLImageElement).parentElement!.style.background = "#e2e8f0";
                        }}
                      />
                    </button>
                  </div>
                ))}
              </div>
            </fieldset>

            <div className="grid grid-cols-2 gap-5 w-full" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              <Input
                label="Nombre completo"
                placeholder="Juan Pérez"
                autoComplete="name"
                value={fullName}
                onChange={(e) => { setFullName(e.target.value); setFullNameError(""); }}
                error={fullNameError}
              />
              <Input
                label="Correo electrónico"
                type="email"
                placeholder="tu@email.com"
                autoComplete="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setEmailError(""); }}
                error={emailError}
              />
            </div>

            <div className="grid grid-cols-2 gap-5 w-full" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              <div className="flex flex-col gap-1 w-full">
                <Input
                  label="Username"
                  placeholder="Mínimo 4 caracteres"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => {
                    const val = e.target.value;
                    setUsername(val);
                    setUsernameError("");
                    // Sincrónico: el botón se deshabilita en el mismo
                    // render que el teclazo. El efecto debounced se
                    // encargará de la llamada al backend.
                    if (!val) {
                      setUsernameStatus("idle");
                    } else if (!USERNAME_REGEX.test(val)) {
                      setUsernameStatus("invalid");
                    } else {
                      setUsernameStatus("checking");
                    }
                  }}
                  error={usernameError}
                />
                {!usernameError && usernameStatus === "available" && (
                  <p className="text-xs text-green-600 font-medium" role="status" aria-live="polite">✅ Disponible</p>
                )}
                {!usernameError && usernameStatus === "taken" && (
                  <p className="text-xs text-amber-600 font-medium" role="status" aria-live="polite">⚠ Ya existe</p>
                )}
                {!usernameError && usernameStatus === "checking" && (
                  <p className="text-xs text-slate-400" role="status" aria-live="polite">Verificando...</p>
                )}
                {!usernameError && usernameStatus === "invalid" && usernameInvalidReason(username) && (
                  <p className="text-xs text-red-600 font-medium" role="status" aria-live="polite">
                    ⚠ {usernameInvalidReason(username)}
                  </p>
                )}
                {!usernameError && usernameStatus === "check_failed" && (
                  <p className="text-xs text-orange-600 font-medium" role="status" aria-live="polite">
                    ⚠ No pudimos verificar la disponibilidad. Inténtalo de nuevo en un momento.
                  </p>
                )}
              </div>
              <Input
                label="Contraseña"
                type="password"
                placeholder="Mínimo 8 caracteres"
                autoComplete="new-password"
                value={password}
                onChange={(e) => {
                  const val = e.target.value;
                  setPassword(val);
                  if (val.length === 0) { setPasswordError(""); return; }
                  const hasMin = val.length >= 8;
                  const hasUpper = /[A-Z]/.test(val);
                  const hasLower = /[a-z]/.test(val);
                  const hasNumber = /[0-9]/.test(val);
                  const hasSymbol = /[^a-zA-Z0-9]/.test(val);
                  if (!hasMin || !hasUpper || !hasLower || !hasNumber || !hasSymbol) {
                    setPasswordError("Mínimo 8 caracteres, 1 mayúscula, 1 minúscula, 1 número y 1 símbolo");
                  } else {
                    setPasswordError("");
                  }
                }}
                error={passwordError}
              />
            </div>

            <div className="mt-2 w-full">
              <label className="flex items-start gap-2.5 text-sm text-slate-600 cursor-pointer w-full">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => { setAcceptedTerms(e.target.checked); setTermsError(""); }}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 flex-shrink-0"
                  aria-describedby={termsError ? "terms-error" : undefined}
                />
                <span className="leading-tight">
                  Acepto los{" "}
                  <Link to="/terms" className="text-blue-600 hover:underline font-medium">Términos de servicio</Link>
                  {" "}y la{" "}
                  <Link to="/privacy" className="text-blue-600 hover:underline font-medium">Política de privacidad</Link>
                </span>
              </label>
              {termsError && (
                <p id="terms-error" role="alert" className="mt-1 text-xs text-red-600">{termsError}</p>
              )}
            </div>

            <Button
              type="submit"
              isLoading={loading}
              disabled={loading || usernameStatus !== "available"}
              aria-describedby={
                usernameStatus !== "available" ? "submit-blocked-hint" : undefined
              }
              className="w-full !py-3.5 !text-base !rounded-xl font-bold mt-2"
            >
              Crear cuenta
            </Button>
            {usernameStatus !== "available" && (
              <p
                id="submit-blocked-hint"
                role="status"
                aria-live="polite"
                className="text-center text-xs text-slate-500"
              >
                {usernameStatus === "checking"
                  ? "Esperando a verificar tu username…"
                  : usernameStatus === "taken"
                  ? "Elige un username disponible para continuar"
                  : usernameStatus === "check_failed"
                  ? "No pudimos verificar el username, escribe una letra para reintentar"
                  : "Elige un username válido para continuar"}
              </p>
            )}
          </form>

          <p className="mt-6 text-center text-sm text-slate-500 w-full">
            ¿Ya tienes cuenta?{" "}
            <Link to="/login" className="font-semibold text-blue-600 hover:underline">
              Inicia sesión
            </Link>
          </p>

          <p className="mt-4 text-center text-xs text-slate-400 w-full">
            Seguro • Accesible • Para estudiantes
          </p>
        </div>
      </div>

      {/* Modal de completar perfil (usuario de Google sin username) */}
      {showGoogleModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="google-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 id="google-modal-title" className="text-lg font-bold text-slate-900">
              Completa tu perfil
            </h2>
            <p className="mt-1 text-xs text-slate-500">Elige un avatar y un username único para tu cuenta</p>

            <div className="mt-4">
              <p className="text-sm font-medium text-slate-800 mb-2">Elige tu avatar</p>
              {googleAvatarError && <p className="text-xs text-red-600 mb-1">⚠ {googleAvatarError}</p>}
              <div className="grid grid-cols-8 gap-1.5">
                {AVATARS.map((src, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => { setGoogleAvatar(i); setGoogleAvatarError(""); }}
                    className={`relative aspect-square rounded-lg overflow-hidden transition-all
                      ${googleAvatar === i ? "ring-2 ring-blue-500 ring-offset-1" : "ring-1 ring-slate-200 hover:ring-slate-300"}`}
                  >
                    <img src={src} alt={`Avatar ${i + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleGoogleUsernameSubmit} className="mt-4 flex flex-col gap-3" noValidate>
              <div>
                <Input
                  label="Username"
                  placeholder="ej. juanp2026"
                  value={googleUsername}
                  onChange={(e) => {
                    const val = e.target.value;
                    setGoogleUsername(val);
                    setGoogleUsernameError("");
                    if (googleDebounceRef.current) clearTimeout(googleDebounceRef.current);
                    // Status sincrónico para que el botón se deshabilite
                    // ya mismo (no esperamos al backend).
                    if (!val) {
                      setGoogleUsernameStatus("idle");
                      return;
                    }
                    if (!USERNAME_REGEX.test(val)) {
                      setGoogleUsernameStatus("invalid");
                      return;
                    }
                    setGoogleUsernameStatus("checking");
                    const seq = ++googleCheckSeqRef.current;
                    googleDebounceRef.current = setTimeout(async () => {
                      try {
                        const res = await api.get<{ available: boolean }>(`/auth/check-username/${val}`);
                        if (seq !== googleCheckSeqRef.current) return; // stale
                        setGoogleUsernameStatus(res.available ? "available" : "taken");
                      } catch {
                        if (seq !== googleCheckSeqRef.current) return;
                        setGoogleUsernameStatus("check_failed");
                      }
                    }, 500);
                  }}
                  error={googleUsernameError}
                />
                {!googleUsernameError && googleUsernameStatus === "available" && (
                  <p className="mt-1 text-xs text-green-600" role="status" aria-live="polite">✅ Disponible</p>
                )}
                {!googleUsernameError && googleUsernameStatus === "taken" && (
                  <p className="mt-1 text-xs text-amber-600" role="status" aria-live="polite">⚠ Username ocupado</p>
                )}
                {!googleUsernameError && googleUsernameStatus === "checking" && (
                  <p className="mt-1 text-xs text-slate-400" role="status" aria-live="polite">Verificando...</p>
                )}
                {!googleUsernameError && googleUsernameStatus === "invalid" && usernameInvalidReason(googleUsername) && (
                  <p className="mt-1 text-xs text-red-600 font-medium" role="status" aria-live="polite">
                    ⚠ {usernameInvalidReason(googleUsername)}
                  </p>
                )}
                {!googleUsernameError && googleUsernameStatus === "check_failed" && (
                  <p className="mt-1 text-xs text-orange-600" role="status" aria-live="polite">
                    ⚠ No pudimos verificar disponibilidad. Inténtalo de nuevo.
                  </p>
                )}
              </div>
              <Button
                type="submit"
                isLoading={googleLoading}
                disabled={googleLoading || googleUsernameStatus !== "available"}
                aria-describedby={
                  googleUsernameStatus !== "available" ? "google-submit-hint" : undefined
                }
                className="w-full !rounded-xl"
              >
                Guardar y continuar
              </Button>
              {googleUsernameStatus !== "available" && (
                <p
                  id="google-submit-hint"
                  role="status"
                  aria-live="polite"
                  className="text-center text-xs text-slate-500"
                >
                  {googleUsernameStatus === "checking"
                    ? "Esperando a verificar tu username…"
                    : googleUsernameStatus === "taken"
                    ? "Elige un username disponible para continuar"
                    : googleUsernameStatus === "check_failed"
                    ? "No pudimos verificar el username, escribe una letra para reintentar"
                    : "Elige un username válido para continuar"}
                </p>
              )}
            </form>
          </div>
        </div>
      )}
    </>
  );
}
