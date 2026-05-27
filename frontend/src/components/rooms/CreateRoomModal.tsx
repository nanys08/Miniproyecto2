/**
 * CreateRoomModal — Modal de creación de sala con estados visuales.
 *
 * Estados (saveStatus):
 *  - idle     : formulario con input nombre + código pre-generado
 *  - loading  : spinner central, botones deshabilitados (evita doble clic)
 *  - success  : check verde "La sala fué creada con éxito" + spinner, luego redirige
 *  - error    : mensaje "No fué posible crear la sala", conserva los datos
 *
 * Validación cliente: nombre obligatorio → borde rojo + mensaje bajo el campo,
 * botón "Crear" deshabilitado.
 *
 * Accesibilidad: foco automático al input, focus trap (vía Modal), aria-live
 * en mensajes de estado, label asociado, iconografía además de color.
 */

import { useEffect, useRef, useState, type FormEvent } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/Button";
import { cn } from "@/utils/cn";
import { createRoom, generateAccessCode, type Room } from "@/services/rooms";

type Status = "idle" | "loading" | "success" | "error";

interface CreateRoomModalProps {
  open: boolean;
  onClose: () => void;
  /** Se llama con la sala creada tras la confirmación de éxito. */
  onCreated: (room: Room) => void;
}

export default function CreateRoomModal({ open, onClose, onCreated }: CreateRoomModalProps) {
  const [name, setName] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [nameError, setNameError] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  // Al abrir: resetear estado, pre-generar código y enfocar el input.
  useEffect(() => {
    if (!open) return;
    setName("");
    setNameError(null);
    setGlobalError(null);
    setStatus("idle");
    setAccessCode(generateAccessCode());
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open]);

  const isBusy = status === "loading" || status === "success";
  const canSubmit = name.trim().length > 0 && status === "idle";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isBusy) return;

    // Validación cliente: nombre obligatorio
    if (!name.trim()) {
      setNameError("El nombre de la sala es obligatorio");
      setGlobalError(null);
      inputRef.current?.focus();
      return;
    }

    setNameError(null);
    setGlobalError(null);
    setStatus("loading");

    try {
      const room = await createRoom(name.trim(), accessCode);
      setStatus("success");
      // Confirmación breve antes de redirigir (evita parpadeo y da feedback).
      setTimeout(() => onCreated(room), 1000);
    } catch {
      // Error de conexión / Firebase → conservar datos del formulario.
      setStatus("error");
      setGlobalError("No fué posible crear la sala");
    }
  }

  // Durante loading/success bloqueamos el cierre para no interrumpir la operación.
  function handleClose() {
    if (isBusy) return;
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Crear nueva sala de estudio">
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {/* ── Campo nombre ── */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="room-name" className="text-sm font-medium text-slate-800">
            Nombre de la sala
            <span aria-hidden="true" className="ml-0.5 text-red-600">*</span>
          </label>
          <input
            ref={inputRef}
            id="room-name"
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (nameError) setNameError(null);
              if (globalError) { setGlobalError(null); setStatus("idle"); }
            }}
            disabled={isBusy}
            placeholder="Ej. Matemáticas Avanzadas"
            autoComplete="off"
            aria-required="true"
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? "room-name-error" : undefined}
            className={cn(
              "h-11 w-full rounded-md border px-3 text-base text-slate-900",
              "placeholder:text-slate-400",
              "focus-visible:outline-none focus-visible:ring-2",
              "disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500",
              nameError
                ? "border-red-500 focus-visible:ring-red-500"
                : "border-slate-300 focus-visible:ring-brand-600"
            )}
          />
          {nameError && (
            <p
              id="room-name-error"
              role="alert"
              className="flex items-center gap-1.5 text-sm font-medium text-red-700"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0" aria-hidden="true">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd"/>
              </svg>
              {nameError}
            </p>
          )}
        </div>

        {/* ── Código de acceso pre-generado ── */}
        <p className="text-sm text-slate-600">
          Código de acceso (pre-generado):{" "}
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-sm font-bold tracking-widest text-slate-900">
            {accessCode}
          </span>
        </p>

        {/* ── Mensaje de error global (conexión / Firebase) ── */}
        {globalError && (
          <p
            role="alert"
            className="flex items-center gap-1.5 text-sm font-medium text-red-700"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0" aria-hidden="true">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd"/>
            </svg>
            {globalError}
          </p>
        )}

        {/* ── Confirmación de éxito + spinner (estado transicional) ── */}
        {status === "success" && (
          <div
            role="status"
            aria-live="assertive"
            className="flex flex-col items-center gap-3 py-2"
          >
            <p className="flex items-center gap-2 rounded-full border border-green-300 bg-green-50 px-4 py-1.5 text-sm font-semibold text-green-800">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 shrink-0" aria-hidden="true">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd"/>
              </svg>
              La sala fué creada con éxito
            </p>
            <span
              aria-hidden="true"
              className="inline-block h-7 w-7 animate-spin rounded-full border-4 border-brand-600 border-r-transparent"
            />
          </div>
        )}

        {/* ── Spinner puro (loading sin éxito todavía) ── */}
        {status === "loading" && (
          <div role="status" aria-live="polite" className="flex flex-col items-center gap-2 py-2">
            <span
              aria-hidden="true"
              className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-r-transparent"
            />
            <span className="text-sm font-medium text-slate-600">Creando sala…</span>
          </div>
        )}

        {/* ── Botones de acción ── */}
        <div className="mt-1 flex justify-start gap-2">
          <Button
            type="submit"
            disabled={!canSubmit}
            isLoading={status === "loading"}
            className="min-w-[110px]"
          >
            Crear
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={handleClose}
            disabled={isBusy}
          >
            Cancelar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
