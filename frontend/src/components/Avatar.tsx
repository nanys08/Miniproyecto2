import { cn } from "@/utils/cn";

interface AvatarProps {
  name?: string | null;
  email?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizeMap = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-16 w-16 text-lg",
  xl: "h-24 w-24 text-3xl",
};

function getInitials(name?: string | null, email?: string | null): string {
  const source = (name || email || "?").trim();
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * Paleta de avatares por inicial (design system). Fondo claro + texto oscuro
 * del mismo tono → contraste AA y color distintivo por persona.
 */
const AVATAR_PALETTE = [
  "bg-blue-100 text-blue-700", // #DBEAFE / #1d4ed8
  "bg-pink-100 text-pink-800", // #FCE7F3 / #9d174d
  "bg-emerald-100 text-emerald-800", // #D1FAE5 / #065f46
  "bg-violet-100 text-violet-800", // #EDE9FE / #5b21b6
  "bg-amber-100 text-amber-800",
  "bg-cyan-100 text-cyan-800",
];

/** Color estable derivado del nombre (mismo nombre → mismo color). */
function paletteFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

// Avatar circular con iniciales sobre un color sólido distintivo por persona.
// Si no hay nombre, extrae las iniciales del email. Por defecto es decorativo
// (aria-hidden), salvo que se le pase un nombre — entonces se anuncia como imagen.
export default function Avatar({
  name,
  email,
  size = "md",
  className,
}: AvatarProps) {
  const initials = getInitials(name, email);
  const label = name ?? email ?? null;

  return (
    <div
      role={label ? "img" : undefined}
      aria-label={label ? `Avatar de ${label}` : undefined}
      aria-hidden={label ? undefined : true}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-bold",
        paletteFor(label ?? initials),
        sizeMap[size],
        className
      )}
    >
      {initials}
    </div>
  );
}
