/**
 * @file MessageInput — Caja de texto para enviar mensajes al chat.
 *
 * Comportamiento:
 *  - Enter envía; Shift+Enter inserta salto de línea.
 *  - El botón "Enviar" se desactiva cuando no hay socket activo (`disabled`)
 *    o cuando el campo está vacío.
 *  - Si el envío falla (`onSend` devuelve `false`) restauramos el texto
 *    para que el usuario pueda reintentar sin volver a escribirlo.
 *
 * Accesibilidad: textarea con label asociado, `aria-describedby` para el
 * mensaje de error y `aria-disabled` cuando está bloqueado por desconexión.
 */

import { useState, useRef, type KeyboardEvent, type FormEvent } from "react";
import { cn } from "@/utils/cn";

interface MessageInputProps {
  /** Envía el mensaje. Resuelve `true` si el server lo confirmó. */
  onSend: (content: string) => Promise<boolean>;
  /** Cuando es `true` se bloquea el envío (transporte caído, sin red, …). */
  disabled?: boolean;
  /** Mensaje informativo a mostrar bajo el input (ej. "Sin conexión"). */
  hint?: string;
}

export default function MessageInput({
  onSend,
  disabled = false,
  hint,
}: MessageInputProps) {
  const [value, setValue] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isEmpty = value.trim().length === 0;
  const blocked = disabled || sending || isEmpty;

  async function submit() {
    if (blocked) return;
    const draft = value;
    setErrorMsg(null);
    setSending(true);
    setValue("");
    const ok = await onSend(draft);
    setSending(false);
    if (!ok) {
      setValue(draft);
      setErrorMsg("No se pudo enviar. Reintenta cuando vuelva la conexión.");
      // Devolver foco al textarea para que el usuario pueda corregir.
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void submit();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-1">
      <label htmlFor="chat-message-input" className="sr-only">
        Escribe tu mensaje
      </label>
      <div
        className={cn(
          "flex items-end gap-2 rounded-xl border bg-white px-3 py-2",
          "focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500",
          disabled
            ? "border-slate-200 bg-slate-50 opacity-70"
            : "border-slate-300"
        )}
      >
        <textarea
          ref={textareaRef}
          id="chat-message-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? "Sin conexión" : "Escribe tu mensaje…"}
          rows={1}
          disabled={disabled}
          aria-disabled={disabled || undefined}
          aria-describedby={errorMsg ? "chat-input-error" : hint ? "chat-input-hint" : undefined}
          className={cn(
            "flex-1 resize-none bg-transparent text-sm text-slate-900 outline-none",
            "placeholder:text-slate-400",
            "max-h-32 min-h-[24px]",
            "disabled:cursor-not-allowed"
          )}
        />
        <button
          type="submit"
          disabled={blocked}
          aria-label="Enviar mensaje"
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
            blocked
              ? "bg-slate-200 text-slate-400 cursor-not-allowed"
              : "bg-blue-600 text-white hover:bg-blue-700"
          )}
        >
          {sending ? (
            <span
              aria-hidden="true"
              className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"
            />
          ) : (
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M22 2 11 13" />
              <path d="m22 2-7 20-4-9-9-4 20-7Z" />
            </svg>
          )}
        </button>
      </div>
      {errorMsg && (
        <p
          id="chat-input-error"
          role="alert"
          className="px-1 text-xs font-medium text-red-700"
        >
          {errorMsg}
        </p>
      )}
      {!errorMsg && hint && (
        <p id="chat-input-hint" className="px-1 text-xs text-slate-500">
          {hint}
        </p>
      )}
    </form>
  );
}
