import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  // Si se pasa título se usa <section aria-labelledby>; si no, queda como div.
  title?: ReactNode;
  // Nivel semántico del encabezado (h1–h6) para mantener jerarquía correcta.
  headingLevel?: 2 | 3 | 4;
}

// Card semántica. Cuando tiene título se envuelve en <section> con
// aria-labelledby apuntando al heading — WCAG 1.3.1 Info and Relationships.
export default function Card({
  title,
  headingLevel = 3,
  children,
  className,
  id,
  ...rest
}: CardProps) {
  const baseClasses = cn(
    "rounded-lg border border-slate-200 bg-white p-4 shadow-sm",
    className
  );

  if (!title) {
    return (
      <div id={id} className={baseClasses} {...rest}>
        {children}
      </div>
    );
  }

  const titleId = id ? `${id}-title` : undefined;
  const HeadingTag = `h${headingLevel}` as "h2" | "h3" | "h4";

  return (
    <section
      id={id}
      aria-labelledby={titleId}
      className={baseClasses}
      {...rest}
    >
      <HeadingTag
        id={titleId}
        className="mb-2 text-lg font-semibold text-slate-900"
      >
        {title}
      </HeadingTag>
      {children}
    </section>
  );
}
