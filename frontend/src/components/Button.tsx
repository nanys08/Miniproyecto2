import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/utils/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
  // Si el botón es solo ícono, exige aria-label para no romper 4.1.2
  iconOnly?: boolean;
}

const variantClasses: Record<Variant, string> = {
  // Contraste mínimo AA validado contra fondo blanco
  primary:
    "bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-900 disabled:bg-slate-400",
  secondary:
    "bg-slate-200 text-slate-900 hover:bg-slate-300 active:bg-slate-400 disabled:bg-slate-100 disabled:text-slate-400",
  ghost:
    "bg-transparent text-brand-700 hover:bg-brand-50 active:bg-brand-100 disabled:text-slate-400",
  danger:
    "bg-red-600 text-white hover:bg-red-700 active:bg-red-800 disabled:bg-slate-400",
};

const sizeClasses: Record<Size, string> = {
  // Tamaños cumplen 2.5.8 Target Size (Minimum) — mínimo 24×24 CSS px
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-base",
  lg: "h-12 px-5 text-base",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    isLoading = false,
    iconOnly = false,
    disabled,
    className,
    children,
    type = "button",
    ...rest
  },
  ref
) {
  // Validación a11y: botón solo-ícono requiere aria-label
  if (
    iconOnly &&
    !rest["aria-label"] &&
    !rest["aria-labelledby"] &&
    process.env.NODE_ENV !== "production"
  ) {
    console.warn(
      "<Button iconOnly /> requiere aria-label o aria-labelledby (WCAG 4.1.2)."
    );
  }

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium",
        "transition-colors focus-visible:ring-brand-600 focus-visible:ring-offset-2 focus-visible:ring-offset-white",
        "disabled:cursor-not-allowed",
        variantClasses[variant],
        sizeClasses[size],
        iconOnly && "aspect-square px-0",
        className
      )}
      {...rest}
    >
      {isLoading && (
        <span
          aria-hidden="true"
          className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"
        />
      )}
      {children}
    </button>
  );
});

export default Button;
