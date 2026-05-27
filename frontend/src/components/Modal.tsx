import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { cn } from "@/utils/cn";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  // El elemento al que devolver el foco al cerrar (WCAG 2.4.3 Focus Order)
  returnFocusRef?: RefObject<HTMLElement>;
}

// Modal accesible:
// - role="dialog" + aria-modal + aria-labelledby
// - cierre con Escape
// - focus trap básico (Tab cíclico)
// - devuelve el foco al elemento que la abrió
// - backdrop es un <button> real para no romper jsx-a11y/click-events-have-key-events
// WCAG 2.1.1 Keyboard, 2.1.2 No Keyboard Trap, 2.4.3 Focus Order, 4.1.2 Name/Role/Value.
export default function Modal({
  open,
  onClose,
  title,
  children,
  returnFocusRef,
}: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Guardamos onClose en un ref para que el efecto de foco/teclado NO dependa
  // de su identidad. Si dependiera de onClose, cada render del padre (p. ej.
  // al escribir en un input del modal recrea la función inline) re-ejecutaría
  // el efecto y robaría el foco devolviéndolo al primer elemento (la X).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    // Capturar ref en variable local para uso seguro en cleanup
    const externalReturnTarget = returnFocusRef?.current ?? null;
    previouslyFocused.current = document.activeElement as HTMLElement;

    // Mover el foco al primer elemento enfocable del diálogo
    const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    focusables?.[0]?.focus();

    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key === "Tab" && focusables && focusables.length > 0) {
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
      const target = externalReturnTarget ?? previouslyFocused.current;
      target?.focus();
    };
  }, [open, returnFocusRef]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop como <button> para mantener semántica accesible
          (Escape también cierra el diálogo). */}
      <button
        type="button"
        aria-label="Cerrar diálogo"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/60 cursor-default"
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "relative w-full max-w-md rounded-lg bg-white p-6 shadow-xl",
          "focus:outline-none"
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-xl font-semibold text-slate-900">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar diálogo"
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-brand-600"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
