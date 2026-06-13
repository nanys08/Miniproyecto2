/**
 * @file VideoGrid — Cuadrícula responsive de participantes (C3, Tareas 1/3/4/7).
 *
 * Distribuye los `ParticipantCard` según cuántos haya, adaptándose a desktop /
 * tablet / móvil (regla: en móvil nunca más de 2 columnas). Renderiza la lista
 * dinámicamente (entradas/salidas reordenan el grid sin recargar) y muestra el
 * contador. A partir de 10 participantes pagina en bloques de 9 (3×3) y sube
 * automáticamente a la primera página a quien está hablando.
 *
 * El estado vacío ("Aún no hay participantes conectados") y el layout especial
 * de 3 (dos arriba + uno a lo ancho) se manejan aquí.
 */

import { useEffect, useMemo, useState } from "react";
import ParticipantCard, {
  type ParticipantCardProps,
} from "@/components/room/ParticipantCard";

const PAGE_SIZE = 9;

export interface GridTile extends ParticipantCardProps {
  /** Clave estable (uid del participante). */
  uid: string;
}

/** `true` en viewports estrechos (< 640px) → como máximo 2 columnas. */
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 639px)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return narrow;
}

/** Nº de columnas según cantidad de tiles y ancho de pantalla. */
function columnsFor(n: number, narrow: boolean): number {
  if (narrow) return n <= 2 ? 1 : 2; // 1-2 apilados; 3+ en 2 columnas
  if (n <= 1) return 1;
  if (n <= 4) return 2; // 2, 3 y 4 → 2 columnas
  return 3; // 5-9 (y páginas de 10+) → 3 columnas
}

export default function VideoGrid({ tiles }: { tiles: GridTile[] }) {
  const narrow = useNarrow();
  const [page, setPage] = useState(0);
  const count = tiles.length;
  const paginated = count > PAGE_SIZE;

  // En modo paginado, quien habla sube al frente (primera página visible).
  const ordered = useMemo(() => {
    if (!paginated) return tiles;
    return [...tiles].sort(
      (a, b) => Number(Boolean(b.speaking)) - Number(Boolean(a.speaking))
    );
  }, [tiles, paginated]);

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  useEffect(() => {
    if (page > totalPages - 1) setPage(Math.max(0, totalPages - 1));
  }, [page, totalPages]);

  const visible = paginated
    ? ordered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)
    : ordered;

  // Estado vacío (US-09).
  if (count === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <span aria-hidden="true" className="text-4xl">👥</span>
        <p className="text-sm font-medium text-slate-400">
          Aún no hay participantes conectados
        </p>
      </div>
    );
  }

  const shown = visible.length;
  const cols = columnsFor(shown, narrow);
  const rows = Math.max(1, Math.ceil(shown / cols));
  const compact = shown >= 5;

  // Etiqueta del layout para el contador (estilo mockups).
  const layoutLabel = paginated
    ? `Mostrando ${shown} de ${count}`
    : count === 4
    ? "2×2"
    : count >= 5
    ? "Grid adaptable"
    : `${cols}×${rows}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {/* Contador (Tarea 4) — se actualiza automáticamente. */}
      <div className="flex shrink-0 items-center justify-between px-0.5">
        <p
          aria-live="polite"
          className="text-xs font-semibold uppercase tracking-wide text-slate-400"
        >
          {count} participante{count !== 1 ? "s" : ""}
          <span className="mx-1.5 text-slate-600">—</span>
          <span className="text-slate-500">{layoutLabel}</span>
        </p>
      </div>

      <ul
        className="grid h-full min-h-0 w-full flex-1 gap-1.5 sm:gap-3"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
        }}
      >
        {visible.map((t, idx) => (
          <ParticipantCard
            key={t.uid}
            {...t}
            compact={compact}
            // Layout de 3 en desktop: el tercero ocupa el ancho completo.
            className={
              !narrow && shown === 3 && idx === 2 ? "col-span-2" : undefined
            }
          />
        ))}
      </ul>

      {/* Paginación (10+ participantes). */}
      {paginated && (
        <nav
          aria-label="Páginas de participantes"
          className="flex shrink-0 items-center justify-center gap-2 py-1"
        >
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={safePage === 0}
            aria-label="Página anterior"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40"
          >
            ‹
          </button>
          <span className="text-xs font-medium text-slate-400">
            {safePage + 1} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={safePage >= totalPages - 1}
            aria-label="Página siguiente"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40"
          >
            ›
          </button>
        </nav>
      )}
    </div>
  );
}
