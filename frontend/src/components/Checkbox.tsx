import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/utils/cn";

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "children"> {
  label: ReactNode;
  error?: string;
}

const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, error, id, className, ...rest },
  ref
) {
  const autoId = useId();
  const inputId = id ?? `cb-${autoId}`;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={inputId}
        className="flex items-start gap-2 text-sm text-slate-700"
      >
        <input
          ref={ref}
          id={inputId}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          className={cn(
            "mt-0.5 h-4 w-4 cursor-pointer rounded border-slate-300 text-brand-600",
            "focus-visible:ring-brand-600 focus-visible:ring-offset-2",
            error && "border-red-600",
            className
          )}
          {...rest}
        />
        <span>{label}</span>
      </label>
      {error && (
        <p
          id={errorId}
          role="alert"
          className="ml-6 text-sm font-medium text-red-700"
        >
          {error}
        </p>
      )}
    </div>
  );
});

export default Checkbox;
