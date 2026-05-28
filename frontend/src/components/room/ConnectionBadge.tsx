/**
 * @file ConnectionBadge — Indicador del estado del socket.
 *
 * Replica el patrón "punto + texto" de las maquetas:
 *  - Conectado     → punto verde + "Conectado"
 *  - Reconectando  → punto ámbar pulsante + "Reconectando…"
 *  - Sin conexión  → ícono ❌ + "Sin conexión"
 *  - Error         → ícono ⚠ + "Error de conexión"
 *  - Connecting    → spinner + "Conectando…"
 *
 * Accesibilidad: `role="status"` con `aria-live="polite"` para que los
 * lectores de pantalla anuncien el cambio sin interrumpir lo que el
 * usuario esté leyendo.
 */

import { cn } from "@/utils/cn";
import type { ChatStatus } from "@/hooks/useChat";

interface ConnectionBadgeProps {
  status: ChatStatus;
  label: string;
  className?: string;
}

const STYLE_MAP: Record<
  ChatStatus,
  { dot: string; text: string; ring: string }
> = {
  idle:        { dot: "bg-slate-400",  text: "text-slate-300",  ring: "" },
  connecting:  { dot: "bg-slate-400",  text: "text-slate-300",  ring: "" },
  connected:   { dot: "bg-emerald-500", text: "text-emerald-400", ring: "" },
  reconnecting:{ dot: "bg-amber-400",  text: "text-amber-400",  ring: "ring-2 ring-amber-300/40 animate-pulse" },
  offline:     { dot: "bg-red-500",    text: "text-red-400",    ring: "" },
  error:       { dot: "bg-red-500",    text: "text-red-400",    ring: "" },
};

export default function ConnectionBadge({
  status,
  label,
  className,
}: ConnectionBadgeProps) {
  const styles = STYLE_MAP[status];
  const showSpinner =
    status === "connecting" || status === "reconnecting";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={cn(
        "inline-flex items-center gap-2 text-sm font-medium",
        styles.text,
        className
      )}
    >
      {showSpinner ? (
        <span
          aria-hidden="true"
          className={cn(
            "inline-block h-3 w-3 rounded-full border-2 border-current border-r-transparent animate-spin"
          )}
        />
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            "inline-block h-2.5 w-2.5 rounded-full",
            styles.dot,
            styles.ring
          )}
        />
      )}
      <span>{label}</span>
    </div>
  );
}
