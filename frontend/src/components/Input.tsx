import { forwardRef, useId, useState, type InputHTMLAttributes } from "react";
import { cn } from "@/utils/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, id, className, required, type, ...rest },
  ref
) {
  const autoId = useId();
  const inputId = id ?? `input-${autoId}`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const isPassword = type === "password";
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-sm font-medium text-slate-800">
        {label}
        {required && <span aria-hidden="true" className="ml-0.5 text-red-600">*</span>}
        {required && <span className="sr-only">requerido</span>}
      </label>

      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          type={isPassword ? (showPassword ? "text" : "password") : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          aria-required={required || undefined}
          className={cn(
            "h-11 w-full rounded-md border bg-white px-3 text-base text-slate-900",
            "placeholder:text-slate-400",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600",
            error ? "border-red-600" : "border-slate-300 hover:border-slate-400",
            "disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500",
            isPassword ? "pr-10" : "",
            className
          )}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            tabIndex={-1}
          >
            {showPassword ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 4.411m0 0L21 21" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            )}
          </button>
        )}
      </div>

      {hint && !error && <p id={hintId} className="text-sm text-slate-600">{hint}</p>}
      {error && <p id={errorId} role="alert" className="text-sm font-medium text-red-700">{error}</p>}
    </div>
  );
});

export default Input;