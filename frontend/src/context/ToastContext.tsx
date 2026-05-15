import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ToastContext,
  type ToastContextValue,
  type ToastEntry,
  type ToastKind,
} from "@/context/toast-context";
import { cn } from "@/utils/cn";

const AUTO_DISMISS_MS = 4000;

// Provider de notificaciones efímeras. Renderiza una región aria-live
// donde los toasts son anunciados por lectores de pantalla.
// WCAG 4.1.3 Status Messages.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, kind, message }]);
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss]
  );

  const value = useMemo<ToastContextValue>(
    () => ({ toasts, show, dismiss }),
    [toasts, show, dismiss]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastRegion toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastRegion({
  toasts,
  onDismiss,
}: {
  toasts: ToastEntry[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === "error" ? "alert" : "status"}
          className={cn(
            "pointer-events-auto flex items-start justify-between gap-3 rounded-md border px-4 py-3 shadow-md",
            t.kind === "success" &&
              "border-green-200 bg-green-50 text-green-900",
            t.kind === "error" && "border-red-200 bg-red-50 text-red-900",
            t.kind === "info" && "border-slate-200 bg-white text-slate-900"
          )}
        >
          <p className="text-sm font-medium">{t.message}</p>
          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            aria-label="Descartar notificación"
            className="rounded-md p-1 hover:bg-black/5 focus-visible:ring-brand-600"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      ))}
    </div>
  );
}
