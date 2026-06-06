/**
 * JoinRoomModal — Modal para unirse a una sala mediante su código de acceso.
 *
 * Estados: idle | loading | error. En éxito redirige a la sala (onJoined).
 * El código no encontrado muestra un error contextual conservando el input.
 *
 * Accesibilidad: foco automático al input, focus trap (vía Modal), aria-live,
 * label asociado, iconografía además de color.
 */

import { useEffect, useRef, useState, type FormEvent } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/Button";
import { cn } from "@/utils/cn";
import { joinRoom, type Room } from "@/services/rooms";
import { ApiError } from "@/services/api";
import { friendlyError } from "@/services/apiErrors";

/** Longitud exacta del código de acceso (alfanumérico en mayúsculas). */
const ACCESS_CODE_LENGTH = 6;
/** Formato válido: 6 caracteres del alfabeto sin ambigüedades. */
const ACCESS_CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

type Status = "idle" | "loading" | "error";

interface JoinRoomModalProps {
  open: boolean;
  onClose: () => void;
  onJoined: (room: Room) => void;
}

export default function JoinRoomModal({ open, onClose, onJoined }: JoinRoomModalProps) {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setCode("");
    setStatus("idle");
    setError(null);
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open]);

  // Tarea 2: botón deshabilitado mientras el campo esté vacío.
  const canSubmit = code.trim().length > 0 && status !== "loading";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const value = code.trim().toUpperCase();

    if (!value) {
      setError("Ingresa un código de acceso");
      inputRef.current?.focus();
      return;
    }
    // Tarea 2: validación local de formato — "ABC" (incompleto/ inválido) no
    // se envía al backend; se avisa de inmediato con "Código inválido".
    if (value.length !== ACCESS_CODE_LENGTH || !ACCESS_CODE_RE.test(value)) {
      setStatus("error");
      setError("Código inválido");
      inputRef.current?.focus();
      return;
    }

    setError(null);
    setStatus("loading");
    try {
      // Tarea 3: consumir el backend principal — POST /rooms/join.
      const room = await joinRoom(value);
      onJoined(room);
    } catch (err) {
      setStatus("error");
      if (err instanceof ApiError && err.status === 404) {
        // US-08 Escenario 2: código inexistente.
        setError("El código ingresado no existe");
      } else if (err instanceof ApiError && err.message === "ROOM_CODE_INVALID") {
        setError("Código inválido");
      } else {
        setError(friendlyError(err).message);
      }
    }
  }

  function handleClose() {
    if (status === "loading") return;
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Unirme a una sala">
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="join-code" className="text-sm font-medium text-slate-800">
            Código de acceso
            <span aria-hidden="true" className="ml-0.5 text-red-600">*</span>
          </label>
          <input
            ref={inputRef}
            id="join-code"
            type="text"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              if (error) { setError(null); setStatus("idle"); }
            }}
            disabled={status === "loading"}
            placeholder="Ej. B6K3F2"
            autoComplete="off"
            maxLength={6}
            aria-required="true"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "join-code-error" : undefined}
            className={cn(
              "h-11 w-full rounded-md border px-3 text-center font-mono text-base font-semibold uppercase tracking-[0.14em] text-brand-700",
              "placeholder:font-sans placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-400",
              "focus-visible:outline-none focus-visible:ring-2 focus:bg-white",
              "disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500",
              error
                ? "border-red-500 bg-red-50 focus-visible:ring-red-500"
                : "border-brand-100 bg-brand-50 focus-visible:ring-brand-600"
            )}
          />
          {!error && (
            <p className="text-xs text-slate-500">
              Pídele el código al dueño de la sala.
            </p>
          )}
          {error && (
            <p
              id="join-code-error"
              role="alert"
              className="flex items-center gap-1.5 text-sm font-medium text-red-700"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0" aria-hidden="true">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd"/>
              </svg>
              {error}
            </p>
          )}
        </div>

        <div className="mt-1 flex justify-start gap-2">
          <Button type="submit" disabled={!canSubmit} isLoading={status === "loading"} className="min-w-[150px]">
            Validar y entrar →
          </Button>
          <Button type="button" variant="secondary" onClick={handleClose} disabled={status === "loading"}>
            Cancelar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
