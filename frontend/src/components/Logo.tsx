import { cn } from "@/utils/cn";

interface LogoProps {
  className?: string;
  showText?: boolean;
  size?: "sm" | "md" | "lg";
}

const sizeMap = {
  sm: { box: "h-8 w-8", text: "text-lg" },
  md: { box: "h-10 w-10", text: "text-xl" },
  lg: { box: "h-16 w-16", text: "text-2xl" },
};

// Logo de EstudioColab. Icono = libros apilados sobre fondo azul redondeado.
// El texto es opcional para mostrar solo el icono.
export default function Logo({
  className,
  showText = true,
  size = "md",
}: LogoProps) {
  const s = sizeMap[size];
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        aria-hidden="true"
        className={cn(
          "flex items-center justify-center rounded-xl bg-brand-600 shadow-sm",
          s.box
        )}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="h-3/5 w-3/5"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Libro 1 — verde, atrás */}
          <rect
            x="4"
            y="6"
            width="14"
            height="3.5"
            rx="0.5"
            fill="#22c55e"
          />
          {/* Libro 2 — morado, medio */}
          <rect
            x="3"
            y="11"
            width="16"
            height="3.5"
            rx="0.5"
            fill="#a855f7"
          />
          {/* Libro 3 — naranja, frente */}
          <rect
            x="5"
            y="16"
            width="13"
            height="3"
            rx="0.5"
            fill="#fb923c"
          />
        </svg>
      </div>
      {showText && (
        <span className={cn("font-bold text-slate-900", s.text)}>
          EstudioColab
        </span>
      )}
    </div>
  );
}
