/**
 * @file MessageInput — Caja de texto para enviar mensajes al chat (US-10).
 *
 * Comportamiento:
 *  - Enter envía; Shift+Enter inserta salto de línea.
 *  - T5: enviar vacío muestra "No puedes enviar mensajes vacíos" (no se envía).
 *  - T6: más de 500 caracteres bloquea el envío con
 *    "El mensaje supera el límite permitido" + contador en rojo.
 *  - T10: mientras envía, el campo y el botón se deshabilitan y se muestra
 *    "Enviando mensaje…".
 *  - Si el envío falla, se conserva el texto para reintentar.
 *
 * Accesibilidad: textarea con `aria-label`, `aria-describedby` para error/hint,
 * error con `role="alert"`, contador decorativo (`aria-hidden`).
 */

import { useState, useRef, type KeyboardEvent, type FormEvent } from "react";
import { cn } from "@/utils/cn";
import { MAX_CHAT_MESSAGE_LENGTH, type SendResult } from "@/hooks/useRoomChat";

interface MessageInputProps {
  /** Envía el mensaje. Resuelve `{ ok, error? }`. */
  onSend: (content: string) => Promise<SendResult>;
  /** Cuando es `true` se bloquea el envío (transporte caído, sin red, …). */
  disabled?: boolean;
  /** Texto guía del campo (lo decide el panel según el contexto). */
  placeholder?: string;
  /** Mensaje informativo a mostrar bajo el input (ej. "Reconectando chat…"). */
  hint?: string;
}

export default function MessageInput({
  onSend,
  disabled = false,
  placeholder = "Escribe tu mensaje…",
  hint,
}: MessageInputProps) {
  const [value, setValue] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const trimmedLength = value.trim().length;
  const overLimit = trimmedLength > MAX_CHAT_MESSAGE_LENGTH;
  // El botón NO se bloquea por vacío: así un submit vacío muestra el aviso (T5).
  const blocked = disabled || sending || overLimit;

  async function submit() {
    if (disabled || sending) return;
    const draft = value;

    // T5: mensaje vacío.
    if (!draft.trim()) {
      setErrorMsg("No puedes enviar mensajes vacíos");
      textareaRef.current?.focus();
      return;
    }
    // T6: longitud máxima.
    if (draft.trim().length > MAX_CHAT_MESSAGE_LENGTH) {
      setErrorMsg("El mensaje supera el límite permitido");
      return;
    }

    setErrorMsg(null);
    setSending(true);
    const res = await onSend(draft);
    setSending(false);
    if (res.ok) {
      setValue("");
    } else {
      // Conservamos el texto para reintentar (estado de error de US-10).
      setErrorMsg(res.error ?? "No fue posible enviar el mensaje");
    }
    requestAnimationFrame(() => textareaRef.current?.focus());
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

  const showCounter = trimmedLength >= MAX_CHAT_MESSAGE_LENGTH - 100;
  const describedBy = errorMsg
    ? "chat-input-error"
    : sending
    ? "chat-input-sending"
    : hint
    ? "chat-input-hint"
    : undefined;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-1">
      <label htmlFor="chat-message-input" className="sr-only">
        Campo de mensaje
      </label>
      <div
        className={cn(
          "flex items-end gap-2 rounded-xl border bg-white px-3 py-2",
          "focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500",
          disabled ? "border-slate-200 bg-slate-50 opacity-70" : "border-slate-300",
          overLimit && "border-red-400 focus-within:ring-red-500"
        )}
      >
        <textarea
          ref={textareaRef}
          id="chat-message-input"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (errorMsg) setErrorMsg(null);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          disabled={disabled || sending}
          aria-label="Campo de mensaje"
          aria-invalid={overLimit || undefined}
          aria-describedby={describedBy}
          className={cn(
            "flex-1 resize-none bg-transparent text-sm text-slate-900 outline-none",
            "placeholder:text-slate-400 max-h-32 min-h-[24px]",
            "disabled:cursor-not-allowed"
          )}
        />
        {showCounter && (
          <span
            aria-hidden="true"
            className={cn(
              "select-none self-end pb-0.5 text-[11px] tabular-nums",
              overLimit ? "font-semibold text-red-600" : "text-slate-400"
            )}
          >
            {trimmedLength}/{MAX_CHAT_MESSAGE_LENGTH}
          </span>
        )}
        <button
          type="submit"
          disabled={blocked}
          aria-label="Enviar mensaje"
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
            blocked
              ? "cursor-not-allowed bg-slate-200 text-slate-400"
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
      {!errorMsg && sending && (
        <p
          id="chat-input-sending"
          aria-live="polite"
          className="px-1 text-xs text-slate-500"
        >
          Enviando mensaje…
        </p>
      )}
      {!errorMsg && !sending && hint && (
        <p id="chat-input-hint" className="px-1 text-xs text-slate-500">
          {hint}
        </p>
      )}
    </form>
  );
}
