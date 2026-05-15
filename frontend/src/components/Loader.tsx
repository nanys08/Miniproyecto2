import { cn } from "@/utils/cn";

export interface LoaderProps {
  label?: string;
  fullscreen?: boolean;
  className?: string;
}

// Loader con role="status" y aria-live="polite" para anunciar el estado.
// WCAG 4.1.3 Status Messages.
export default function Loader({
  label = "Cargando",
  fullscreen = false,
  className,
}: LoaderProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center justify-center gap-3",
        fullscreen && "fixed inset-0 z-40 bg-white/80",
        className
      )}
    >
      <span
        aria-hidden="true"
        className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-r-transparent"
      />
      <span className="sr-only">{label}…</span>
      {fullscreen && (
        <span className="text-base font-medium text-slate-700">{label}…</span>
      )}
    </div>
  );
}
