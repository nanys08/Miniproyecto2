/**
 * ProfilePage — Pantalla de perfil de usuario.
 *
 * Estados visuales:
 *  - idle     : formulario normal
 *  - loading  : overlay semitransparente azul + spinner
 *  - success  : banner verde + botón "Guardar" en verde por 4s
 *  - error    : banner rojo + errores campo a campo bajo cada input
 *
 * Funcionalidades:
 *  - Editar nombre completo, username, teléfono y avatar
 *  - Validación live de username (disponibilidad y formato)
 *  - Eliminación de cuenta con modal de confirmación (escribe "Eliminar")
 *
 * Accesibilidad: WCAG 2.1 AA — navegación por teclado, focus trap en modal,
 *  aria-live para mensajes de estado, labels correctos, contraste ≥ 4.5:1.
 */

import {
  useState,
  useEffect,
  useRef,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/utils/cn";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import { api, ApiError } from "@/services/api";
import { friendlyError } from "@/services/apiErrors";
import Input from "@/components/Input";
import Button from "@/components/Button";
import Avatar from "@/components/Avatar";

// ─── Constantes ─────────────────────────────────────────────────────────────

const AVATARS = [
  "/avatars/avatar1.png",
  "/avatars/avatar2.png",
  "/avatars/avatar3.png",
  "/avatars/avatar4.png",
  "/avatars/avatar5.png",
  "/avatars/avatar6.png",
  "/avatars/avatar7.png",
  "/avatars/avatar8.png",
] as const;

const USERNAME_REGEX = /^[a-zA-Z0-9_.]{4,10}$/;

// Mapeo de códigos de error del backend a campo de formulario
const ERROR_FIELD_MAP: Record<string, { field: keyof FieldErrors; message: string }> = {
  USERNAME_ALREADY_EXISTS: { field: "username", message: "El username ya está en uso" },
  USERNAME_INVALID:        { field: "username", message: "Entre 4 y 10 caracteres: letras, números, punto y guion bajo" },
  USERNAME_FORBIDDEN:      { field: "username", message: "Ese username no está permitido" },
  FULLNAME_INVALID:        { field: "fullName", message: "El nombre completo debe tener al menos 3 caracteres" },
  PHONE_INVALID:           { field: "phone",    message: "El teléfono debe tener entre 7 y 15 dígitos" },
  MISSING_FIELDS:          { field: "fullName", message: "El nombre completo no puede estar vacío" },
};

// ─── Tipos ───────────────────────────────────────────────────────────────────

type SaveStatus = "idle" | "loading" | "success" | "error";
type UsernameStatus =
  | "idle"
  | "checking"
  | "available"
  | "taken"
  | "invalid"
  | "same"
  | "check_failed";

interface FieldErrors {
  fullName?: string;
  username?: string;
  phone?: string;
}

// ─── Componente ──────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { user, refreshProfile, deleteAccount } = useAuth();
  const { show } = useToast();
  const navigate = useNavigate();

  // ── Campos del formulario ──
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState<number | null>(null);

  // Username actual del usuario (para comparar y omitir check de disponibilidad)
  const [originalUsername, setOriginalUsername] = useState("");

  // ── Estados de UI ──
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [globalError, setGlobalError] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Modal de eliminación ──
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const deleteInputRef = useRef<HTMLInputElement>(null);
  const openDeleteBtnRef = useRef<HTMLButtonElement>(null);

  // ── Refs a11y ──
  const statusRef = useRef<HTMLDivElement>(null);

  // ── Cargar datos del usuario al montar ──────────────────────────────────
  useEffect(() => {
    if (!user) return;
    setFullName(user.displayName ?? "");
    setUsername(user.username ?? "");
    setPhone(user.phone ?? "");
    setOriginalUsername(user.username ?? "");
    const idx = AVATARS.indexOf(user.avatar as typeof AVATARS[number]);
    setSelectedAvatar(idx >= 0 ? idx : null);
  }, [user]);

  // ── Cleanup timers al desmontar ─────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  // ── Validación live de username ─────────────────────────────────────────
  useEffect(() => {
    if (!username) {
      setUsernameStatus("idle");
      return;
    }
    if (!USERNAME_REGEX.test(username)) {
      setUsernameStatus("invalid");
      return;
    }
    // Si no cambió respecto al username actual, no consultar DB
    if (username === originalUsername) {
      setUsernameStatus("same");
      return;
    }
    setUsernameStatus("checking");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.get<{ available: boolean }>(`/auth/check-username/${username}`);
        setUsernameStatus(res.available ? "available" : "taken");
      } catch {
        // Backend caído / Firestore indisponible. Mostramos un mensaje
        // visible en vez de quedarnos en "idle" silencioso.
        setUsernameStatus("check_failed");
      }
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [username, originalUsername]);

  // ── Focus al status banner cuando cambia a error/success ────────────────
  useEffect(() => {
    if (saveStatus === "error" || saveStatus === "success") {
      statusRef.current?.focus();
    }
  }, [saveStatus]);

  // ── Focus al input de confirmación cuando se abre el modal ──────────────
  useEffect(() => {
    if (showDeleteModal) {
      setTimeout(() => deleteInputRef.current?.focus(), 50);
    } else {
      setDeleteConfirmText("");
      setDeleteError("");
    }
  }, [showDeleteModal]);

  // ────────────────────────────────────────────────────────────────────────
  // Validación del formulario antes de enviar
  // ────────────────────────────────────────────────────────────────────────
  function validateForm(): boolean {
    const errors: FieldErrors = {};

    if (!fullName.trim() || fullName.trim().length < 3) {
      errors.fullName = "El nombre completo debe tener al menos 3 caracteres";
    }
    if (phone.trim()) {
      const digits = phone.replace(/\D/g, "");
      if (digits.length < 7 || digits.length > 15) {
        errors.phone = "El teléfono debe tener entre 7 y 15 dígitos";
      }
    }
    if (!USERNAME_REGEX.test(username)) {
      errors.username = "Entre 4 y 10 caracteres: letras, números, punto y guion bajo";
    } else if (usernameStatus === "taken") {
      errors.username = "El username ya está en uso";
    } else if (usernameStatus === "checking") {
      errors.username = "Espera a que termine la verificación";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Guardar cambios
  // ────────────────────────────────────────────────────────────────────────
  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setGlobalError("");
    setFieldErrors({});

    if (!validateForm()) {
      setSaveStatus("error");
      setGlobalError("Algunos campos son incorrectos. Revísalos antes de continuar.");
      return;
    }

    setSaveStatus("loading");

    try {
      const payload: Record<string, string> = {
        fullName: fullName.trim(),
        username,
        phone: phone.trim(),
      };
      if (selectedAvatar !== null) {
        payload.avatar = AVATARS[selectedAvatar];
      }

      await api.patch("/auth/me", payload);
      await refreshProfile();

      setOriginalUsername(username);
      setSaveStatus("success");
      show("success", "Perfil actualizado correctamente");

      // Volver a idle después de 4 segundos
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => setSaveStatus("idle"), 4000);
    } catch (err) {
      setSaveStatus("error");

      if (err instanceof ApiError) {
        const mapped = ERROR_FIELD_MAP[err.message];
        if (mapped) {
          setFieldErrors({ [mapped.field]: mapped.message });
          setGlobalError("Algunos campos son incorrectos. Revísalos antes de continuar.");
        } else {
          // No es un error de campo conocido — convertimos el ApiError en
          // un mensaje friendly (sesión expirada, sin conexión, 5xx, etc.)
          // para que el usuario sepa qué pasó sin ver un código técnico.
          setGlobalError(friendlyError(err).message);
        }
      } else {
        setGlobalError(friendlyError(err).message);
      }
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // Eliminar cuenta
  // ────────────────────────────────────────────────────────────────────────
  async function handleDeleteConfirm(e: FormEvent) {
    e.preventDefault();
    if (deleteConfirmText !== "Eliminar") return;
    setDeleteError("");
    setDeleteLoading(true);
    try {
      await deleteAccount();
      // El toast es global (ToastProvider en la raíz), persiste tras navegar.
      show("success", "Tu cuenta se eliminó correctamente");
      navigate("/login", { replace: true });
    } catch (err) {
      setDeleteError(friendlyError(err).message);
      setDeleteLoading(false);
    }
  }

  function handleDeleteKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && deleteConfirmText === "Eliminar") {
      void handleDeleteConfirm(e as unknown as FormEvent);
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────────
  const displayName = user?.displayName ?? user?.email?.split("@")[0] ?? "Usuario";
  const currentAvatarSrc = selectedAvatar !== null
    ? AVATARS[selectedAvatar]
    : (user?.avatar ?? null);
  const isAvatarPreset = currentAvatarSrc !== null && AVATARS.includes(currentAvatarSrc as typeof AVATARS[number]);
  const canDelete = deleteConfirmText === "Eliminar";

  return (
    <div className="mx-auto max-w-3xl">

      {/* ── Card principal ── */}
      <div
        className={cn(
          "relative rounded-2xl bg-white shadow-sm transition-all",
          saveStatus === "success" && "ring-2 ring-green-400 ring-offset-2",
          saveStatus === "error" && "ring-2 ring-red-300 ring-offset-2"
        )}
      >

        {/* ── Overlay de carga ── */}
        {saveStatus === "loading" && (
          <div
            role="status"
            aria-live="polite"
            aria-label="Guardando cambios"
            className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-2xl bg-blue-50/80 backdrop-blur-[2px]"
          >
            {/* Spinner */}
            <div
              aria-hidden="true"
              className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-r-transparent"
            />
            {/* Barra de progreso */}
            <div className="mt-4 h-1 w-40 overflow-hidden rounded-full bg-blue-100">
              <div className="h-full w-full origin-left animate-pulse rounded-full bg-blue-500" />
            </div>
            <p className="mt-3 text-sm font-medium text-blue-700">Guardando cambios…</p>
          </div>
        )}

        {/* ── Avatar (rompe el borde superior) ── */}
        <div className="flex flex-col items-center pt-8 pb-4 px-8">
          <div className="relative">
            {currentAvatarSrc && isAvatarPreset ? (
              <img
                src={currentAvatarSrc}
                alt={`Avatar de ${displayName}`}
                className="h-24 w-24 rounded-full object-cover ring-4 ring-white shadow-md"
              />
            ) : currentAvatarSrc ? (
              <img
                src={currentAvatarSrc}
                alt={`Avatar de ${displayName}`}
                className="h-24 w-24 rounded-full object-cover ring-4 ring-white shadow-md"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            ) : (
              <Avatar
                name={displayName}
                email={user?.email}
                size="xl"
                className="ring-4 ring-white shadow-md"
              />
            )}
          </div>
          <p className="mt-3 text-lg font-bold text-slate-900">{displayName}</p>
          {user?.username && (
            <p className="text-sm text-slate-500">@{user.username}</p>
          )}
          {user?.university && user.isUnivalle && (
            <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-blue-200">
              🎓 {user.university}
            </span>
          )}
        </div>

        {/* ── Contenido principal ── */}
        <div className="px-6 pb-8 md:px-10">

          {/* Título sección */}
          <h1 className="mb-5 text-xl font-bold text-slate-900">Datos Personales</h1>

          {/* ── Banner de estado (error / success) ── */}
          <div
            ref={statusRef}
            tabIndex={-1}
            className="outline-none"
            aria-live="assertive"
            aria-atomic="true"
          >
            {saveStatus === "error" && globalError && (
              <div
                role="alert"
                className="mb-5 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3"
              >
                <span aria-hidden="true" className="mt-0.5 shrink-0 text-red-500">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                    <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"/>
                  </svg>
                </span>
                <div>
                  <p className="text-sm font-semibold text-red-800">¡Error! {globalError}</p>
                </div>
              </div>
            )}

            {saveStatus === "success" && (
              <div
                role="status"
                className="mb-5 flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3"
              >
                <span aria-hidden="true" className="mt-0.5 shrink-0 text-green-600">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd"/>
                  </svg>
                </span>
                <p className="text-sm font-semibold text-green-800">
                  ¡Éxito! Tu perfil se ha actualizado correctamente.
                </p>
              </div>
            )}
          </div>

          {/* ── Formulario ── */}
          <form onSubmit={handleSave} noValidate className="space-y-6">

            {/* Fila 1: Nombre completo + Teléfono */}
            <div className="grid gap-5 sm:grid-cols-2">
              <Input
                label="Nombre completo"
                placeholder="Juan Pérez"
                autoComplete="name"
                required
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  if (fieldErrors.fullName) setFieldErrors((p) => ({ ...p, fullName: undefined }));
                  if (saveStatus === "error" && !globalError) setSaveStatus("idle");
                }}
                error={fieldErrors.fullName}
                disabled={saveStatus === "loading"}
              />
              <div className="flex flex-col gap-1">
                <Input
                  label="Teléfono"
                  placeholder="+57 300 123 4567"
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    if (fieldErrors.phone) setFieldErrors((p) => ({ ...p, phone: undefined }));
                  }}
                  hint={!fieldErrors.phone ? "Opcional" : undefined}
                  error={fieldErrors.phone}
                  disabled={saveStatus === "loading"}
                />
              </div>
            </div>

            {/* Fila 2: Correo (disabled) + Universidad (disabled) */}
            <div className="grid gap-5 sm:grid-cols-2">
              <Input
                label="Correo electrónico"
                type="email"
                value={user?.email ?? ""}
                disabled
                hint="No se puede cambiar el correo"
                onChange={() => undefined}
              />
              <Input
                label="Universidad"
                value={user?.university ?? "No identificado"}
                disabled
                hint="Se detecta automáticamente"
                onChange={() => undefined}
              />
            </div>

            {/* Fila 3: Username */}
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <Input
                  label="Username"
                  placeholder="tu_usuario"
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (fieldErrors.username) setFieldErrors((p) => ({ ...p, username: undefined }));
                  }}
                  error={fieldErrors.username}
                  disabled={saveStatus === "loading"}
                />
                {/* Indicadores de disponibilidad del username */}
                {!fieldErrors.username && (
                  <div aria-live="polite" className="min-h-[1.25rem]">
                    {usernameStatus === "same" && (
                      <p className="text-xs text-slate-500">✓ Es tu username actual</p>
                    )}
                    {usernameStatus === "available" && (
                      <p className="text-xs font-medium text-green-600">✅ Disponible</p>
                    )}
                    {usernameStatus === "taken" && (
                      <p className="text-xs font-medium text-amber-600">⚠ Ya está en uso</p>
                    )}
                    {usernameStatus === "checking" && (
                      <p className="text-xs text-slate-400">Verificando…</p>
                    )}
                    {usernameStatus === "invalid" && username.length > 0 && (
                      <p className="text-xs text-red-600">4-10 caracteres: letras, números, . y _</p>
                    )}
                    {usernameStatus === "check_failed" && (
                      <p className="text-xs font-medium text-orange-600">
                        ⚠ No pudimos verificar disponibilidad. Inténtalo de nuevo en un momento.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Columna derecha vacía en fila 3 — espacio reservado */}
              <div />
            </div>

            {/* ── Selector de avatar ── */}
            <fieldset>
              <legend className="mb-3 text-sm font-medium text-slate-800">
                Avatar
                <span className="ml-2 text-xs font-normal text-slate-500">(selecciona uno)</span>
              </legend>
              <div
                role="radiogroup"
                aria-label="Selecciona tu avatar"
                className="grid grid-cols-8 gap-2"
              >
                {AVATARS.map((src, i) => {
                  const isSelected = selectedAvatar === i;
                  return (
                    <button
                      key={i}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      aria-label={`Avatar ${i + 1}`}
                      onClick={() => setSelectedAvatar(i)}
                      disabled={saveStatus === "loading"}
                      className={cn(
                        "relative aspect-square w-full rounded-xl overflow-hidden transition-all",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1",
                        "disabled:cursor-not-allowed disabled:opacity-60",
                        isSelected
                          ? "ring-4 ring-blue-500 shadow-md scale-105"
                          : "ring-1 ring-slate-200 hover:ring-slate-400 hover:scale-105"
                      )}
                    >
                      <img
                        src={src}
                        alt={`Avatar ${i + 1}`}
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                          (e.target as HTMLImageElement).parentElement!.style.background = "#e2e8f0";
                        }}
                      />
                      {isSelected && (
                        <span
                          aria-hidden="true"
                          className="absolute bottom-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[9px] text-white shadow"
                        >
                          ✓
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {/* ── Botones de acción ── */}
            <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-6">
              <Button
                type="submit"
                isLoading={saveStatus === "loading"}
                disabled={saveStatus === "loading" || usernameStatus === "checking"}
                className={cn(
                  "min-w-[160px] transition-colors",
                  saveStatus === "success"
                    ? "!bg-green-600 hover:!bg-green-700"
                    : ""
                )}
              >
                {saveStatus === "loading"
                  ? "Guardando…"
                  : saveStatus === "success"
                  ? "✓ Guardado"
                  : "Guardar cambios"}
              </Button>

              <button
                ref={openDeleteBtnRef}
                type="button"
                onClick={() => setShowDeleteModal(true)}
                disabled={saveStatus === "loading"}
                className={cn(
                  "inline-flex min-w-[160px] items-center justify-center gap-2 rounded-md border-2 border-red-500 px-4 py-[10px]",
                  "text-sm font-medium text-red-600 transition-colors",
                  "hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2",
                  "disabled:cursor-not-allowed disabled:opacity-50"
                )}
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0" aria-hidden="true">
                  <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd"/>
                </svg>
                Eliminar cuenta
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          Modal de confirmación de eliminación
      ══════════════════════════════════════════════════════════════════ */}
      {showDeleteModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
          aria-describedby="delete-modal-desc"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
          onKeyDown={(e) => { if (e.key === "Escape") setShowDeleteModal(false); }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">

            {/* Encabezado */}
            <div className="flex items-start justify-between gap-4">
              <h2
                id="delete-modal-title"
                className="text-xl font-bold text-slate-900"
              >
                Eliminar cuenta
              </h2>
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                aria-label="Cancelar y cerrar"
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"/>
                </svg>
              </button>
            </div>

            {/* Advertencia de consecuencias */}
            <div
              id="delete-modal-desc"
              className="mt-4 rounded-lg border-2 border-red-200 bg-red-50 p-4"
            >
              <div className="flex items-start gap-3">
                <span aria-hidden="true" className="mt-0.5 shrink-0">
                  <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden="true">
                    <path fill="#ef4444" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-4.5H8l4-7v4.5h2l-4 7z"/>
                  </svg>
                </span>
                <div>
                  <p className="text-sm font-bold text-red-800">Esta acción es irreversible</p>
                  <ul className="mt-1.5 space-y-1 text-sm text-red-700">
                    <li className="flex items-center gap-1.5">
                      <span aria-hidden="true" className="text-red-500">•</span>
                      Se perderán todos tus datos y mensajes
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span aria-hidden="true" className="text-red-500">•</span>
                      Se cerrará sesión en todos los dispositivos
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span aria-hidden="true" className="text-red-500">•</span>
                      No podrás recuperar tu cuenta
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Campo de confirmación */}
            <form onSubmit={handleDeleteConfirm} className="mt-5 space-y-4" noValidate>
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="delete-confirm-input"
                  className="text-sm font-medium text-slate-700"
                >
                  Escribe{" "}
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-sm font-bold text-slate-900">
                    Eliminar
                  </span>{" "}
                  para confirmar
                </label>
                <input
                  ref={deleteInputRef}
                  id="delete-confirm-input"
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => {
                    setDeleteConfirmText(e.target.value);
                    setDeleteError("");
                  }}
                  onKeyDown={handleDeleteKeyDown}
                  placeholder="Eliminar"
                  autoComplete="off"
                  aria-invalid={deleteError ? true : undefined}
                  aria-describedby={deleteError ? "delete-error" : undefined}
                  className={cn(
                    "h-11 w-full rounded-md border px-3 text-base text-slate-900",
                    "placeholder:text-slate-400",
                    "focus-visible:outline-none focus-visible:ring-2",
                    canDelete
                      ? "border-red-400 focus-visible:ring-red-500"
                      : "border-slate-300 focus-visible:ring-blue-500"
                  )}
                />
                {deleteError && (
                  <p id="delete-error" role="alert" className="text-sm font-medium text-red-700">
                    {deleteError}
                  </p>
                )}
              </div>

              {/* Botones del modal — cancelar (azul/primario) vs eliminar (rojo outline) */}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                {/* Cancelar = acción segura = destacada en azul */}
                <Button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  disabled={deleteLoading}
                  className="w-full sm:w-auto"
                >
                  Volver atrás
                </Button>

                {/* Eliminar = acción peligrosa = rojo outline, deshabilitado hasta confirmar */}
                <button
                  type="submit"
                  disabled={!canDelete || deleteLoading}
                  aria-disabled={!canDelete || deleteLoading}
                  className={cn(
                    "inline-flex w-full items-center justify-center gap-2 rounded-md border-2 px-4 py-[10px]",
                    "text-sm font-medium transition-colors sm:w-auto",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                    canDelete && !deleteLoading
                      ? "border-red-500 text-red-600 hover:bg-red-50 focus-visible:ring-red-500"
                      : "cursor-not-allowed border-slate-200 text-slate-400"
                  )}
                >
                  {deleteLoading && (
                    <span
                      aria-hidden="true"
                      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"
                    />
                  )}
                  {deleteLoading ? "Eliminando…" : "Eliminar cuenta"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
