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

// Avatar circular con iniciales sobre gradiente. Si no hay nombre,
// extrae las iniciales del email. Por defecto es decorativo (aria-hidden),
// salvo que se le pase un nombre — entonces se anuncia como imagen.
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
        "flex shrink-0 items-center justify-center rounded-full font-bold text-white",
        "bg-gradient-to-br from-purple-500 via-pink-500 to-blue-500",
        sizeMap[size],
        className
      )}
    >
      {initials}
    </div>
  );
}
