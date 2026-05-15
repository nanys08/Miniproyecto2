import { forwardRef, useId, type InputHTMLAttributes } from "react";
import { cn } from "@/utils/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  // Label obligatorio — WCAG 3.3.2 Labels or Instructions
  label: string;
  // Texto de ayuda asociado vía aria-describedby
  hint?: string;
  // Mensaje de error asociado vía aria-describedby + aria-invalid
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, id, className, required, ...rest },
  ref
) {
  const autoId = useId();
  const inputId = id ?? `input-${autoId}`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy =
    [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={inputId}
        className="text-sm font-medium text-slate-800"
      >
        {label}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-red-600">
            *
          </span>
        )}
        {required && <span className="sr-only">requerido</span>}
      </label>

      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        aria-required={required || undefined}
        className={cn(
          "h-11 rounded-md border bg-white px-3 text-base text-slate-900",
          "placeholder:text-slate-400",
          "focus-visible:ring-brand-600",
          error
            ? "border-red-600"
            : "border-slate-300 hover:border-slate-400",
          "disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500",
          className
        )}
        {...rest}
      />

      {hint && !error && (
        <p id={hintId} className="text-sm text-slate-600">
          {hint}
        </p>
      )}
      {error && (
        <p
          id={errorId}
          role="alert"
          className="text-sm font-medium text-red-700"
        >
          {error}
        </p>
      )}
    </div>
  );
});

export default Input;
