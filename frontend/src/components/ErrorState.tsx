/**
 * @file ErrorState — Bloque visual reutilizable para mostrar errores.
 *
 * Usa los `FriendlyError` de `services/apiErrors.ts` o se construye con
 * `title`/`message` libres. Renderiza con `role="alert"` para que los
 * lectores de pantalla anuncien el error tan pronto se monte el componente.
 *
 * Se enfoca automáticamente al montarse si `autoFocus` (default `true`)
 * está activo — facilita continuar con el teclado tras un error.
 */

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/utils/cn";
import type { ApiErrorKind, FriendlyError } from "@/services/apiErrors";

interface ErrorStateProps {
  /** Categoría del error — determina ícono y color. */
  kind?: ApiErrorKind;
  title: string;
  message: string;
  /** Acción primaria (p. ej. "Reintentar"). */
  actionLabel?: string;
  onAction?: () => void;
  /** Acción secundaria (p. ej. "Volver al dashboard"). */
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** Inserta contenido custom debajo del mensaje. */
  children?: ReactNode;
  /** Compact (inline en una página) o block (pantalla completa). Default block. */
  variant?: "block" | "inline";
  /** Mover el foco al título cuando aparece (default `true`). */
  autoFocus?: boolean;
  className?: string;
}

const STYLES: Record<ApiErrorKind, { ring: string; bg: string; text: string; iconBg: string }> = {
  session:    { ring: "ring-amber-200",  bg: "bg-amber-50",  text: "text-amber-900",  iconBg: "bg-amber-100 text-amber-700" },
  forbidden:  { ring: "ring-red-200",    bg: "bg-red-50",    text: "text-red-900",    iconBg: "bg-red-100 text-red-700" },
  not_found:  { ring: "ring-slate-200",  bg: "bg-white",     text: "text-slate-900",  iconBg: "bg-slate-100 text-slate-700" },
  validation: { ring: "ring-amber-200",  bg: "bg-amber-50",  text: "text-amber-900",  iconBg: "bg-amber-100 text-amber-700" },
  network:    { ring: "ring-orange-200", bg: "bg-orange-50", text: "text-orange-900", iconBg: "bg-orange-100 text-orange-700" },
  server:     { ring: "ring-red-200",    bg: "bg-red-50",    text: "text-red-900",    iconBg: "bg-red-100 text-red-700" },
};

export default function ErrorState({
  kind = "server",
  title,
  message,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  children,
  variant = "block",
  autoFocus = true,
  className,
}: ErrorStateProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (autoFocus) titleRef.current?.focus();
  }, [autoFocus]);

  const styles = STYLES[kind];

  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      className={cn(
        "flex flex-col items-center gap-3 rounded-2xl ring-1 p-6 text-center",
        styles.ring,
        styles.bg,
        styles.text,
        variant === "block" && "min-h-[260px] justify-center",
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex h-12 w-12 items-center justify-center rounded-full",
          styles.iconBg
        )}
      >
        {kindIcon(kind)}
      </span>

      <h2
        ref={titleRef}
        tabIndex={-1}
        className="text-lg font-bold outline-none"
      >
        {title}
      </h2>
      <p className="max-w-md text-sm">{message}</p>

      {children}

      {(actionLabel || secondaryLabel) && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {actionLabel && onAction && (
            <button
              type="button"
              onClick={onAction}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
            >
              {actionLabel}
            </button>
          )}
          {secondaryLabel && onSecondary && (
            <button
              type="button"
              onClick={onSecondary}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
            >
              {secondaryLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Variante de fábrica desde un `FriendlyError`. */
export function ErrorStateFromFriendly({
  err,
  ...rest
}: Omit<ErrorStateProps, "kind" | "title" | "message"> & {
  err: FriendlyError;
}) {
  return (
    <ErrorState
      kind={err.kind}
      title={err.title}
      message={err.message}
      {...rest}
    />
  );
}

function kindIcon(kind: ApiErrorKind) {
  if (kind === "session") {
    return (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    );
  }
  if (kind === "forbidden") {
    return (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
      </svg>
    );
  }
  if (kind === "not_found") {
    return (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    );
  }
  if (kind === "network") {
    return (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="1" y1="1" x2="23" y2="23" />
        <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.58 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01" />
      </svg>
    );
  }
  // validation / server
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}
