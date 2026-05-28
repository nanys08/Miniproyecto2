/**
 * @file Skeleton — Placeholders animados para estados de carga.
 *
 * El skeleton hereda `aria-hidden="true"` por defecto: NO debe ser leído
 * por lectores de pantalla, que deben recibir el anuncio "Cargando…" del
 * `<Loader />` o del `aria-busy` del contenedor padre. Si quieres que el
 * skeleton sea anunciado pásale `srLabel`.
 */

import { cn } from "@/utils/cn";

interface SkeletonProps {
  className?: string;
  /** Texto que SR anunciarán mientras carga. Omitir si ya hay un loader. */
  srLabel?: string;
}

export default function Skeleton({ className, srLabel }: SkeletonProps) {
  return (
    <div
      role={srLabel ? "status" : undefined}
      aria-live={srLabel ? "polite" : undefined}
      aria-hidden={srLabel ? undefined : true}
      className={cn(
        "animate-pulse rounded-md bg-slate-200/70",
        className
      )}
    >
      {srLabel && <span className="sr-only">{srLabel}</span>}
    </div>
  );
}

/**
 * Skeleton típico para una tarjeta de sala en el dashboard. Coincide en
 * altura con `RoomCard` para evitar layout shift al pasar a "ready".
 */
export function RoomCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex h-full flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <Skeleton className="h-4 w-2/3" />
      <div className="mt-auto flex items-center justify-between gap-3 pt-1">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-20 rounded-md" />
      </div>
    </div>
  );
}
