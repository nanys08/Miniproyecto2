/**
 * @file VideoGrid — Cuadrícula responsive de participantes (C3, Tareas 1/3/4/7).
 *
 * Dos modos:
 *   - GRID equitativo: cuando nadie presenta, todos los tiles del mismo tamaño,
 *     adaptándose a desktop/tablet/móvil (en móvil nunca más de 2 columnas) y
 *     paginando a partir de 10 participantes (bloques de 9).
 *   - ESCENARIO (spotlight): cuando alguien presenta (comparte pantalla) o un
 *     usuario fija a alguien, ese tile se muestra GRANDE y el resto pasa a una
 *     tira de miniaturas. Las transiciones entre estados son suaves.
 *
 * Renderiza dinámicamente desde `tiles` (entradas/salidas reordenan sin
 * recargar), muestra el contador y permite fijar/quitar del escenario.
 */

import { useEffect, useState } from "react";
import ParticipantCard, {
  type ParticipantCardProps,
} from "@/components/room/ParticipantCard";

const PAGE_SIZE = 9;

export interface GridTile extends ParticipantCardProps {
  /** Clave estable (uid del participante). */
  uid: string;
}

interface VideoGridProps {
  tiles: GridTile[];
  /** uid destacado en el escenario (presentador o fijado). null → grid. */
  spotlightUid?: string | null;
  /** uid fijado manualmente (para resaltar el botón de fijar). */
  pinnedUid?: string | null;
  /** Fijar/quitar a un participante del escenario. */
  onPin?: (uid: string) => void;
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

export default function VideoGrid({
  tiles,
  spotlightUid,
  pinnedUid,
  onPin,
}: VideoGridProps) {
  const narrow = useNarrow();
  const [page, setPage] = useState(0);
  const count = tiles.length;

  // Paginación (10+). Calculamos y clampamos ANTES de cualquier return para
  // no romper las reglas de hooks.
  const paginated = count > PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  useEffect(() => {
    if (page > totalPages - 1) setPage(Math.max(0, totalPages - 1));
  }, [page, totalPages]);

  const spotlight = spotlightUid
    ? tiles.find((t) => t.uid === spotlightUid) ?? null
    : null;

  // ── Estado vacío (US-09) ──────────────────────────────────────────────
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

  const pinProps = (t: GridTile) => ({
    pinned: t.uid === pinnedUid,
    onSelect: onPin ? () => onPin(t.uid) : undefined,
  });

  // ── Modo ESCENARIO (alguien presenta o está fijado) ───────────────────
  if (spotlight) {
    const others = tiles.filter((t) => t.uid !== spotlight.uid);
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <Counter count={count} label={spotlight.presenting ? "Presentación" : "Escenario"} />
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          {/* Escenario: el tile destacado, grande. */}
          <ul className="min-h-0 flex-1">
            <ParticipantCard
              {...spotlight}
              compact={false}
              objectContain={!!spotlight.presenting}
              {...pinProps(spotlight)}
            />
          </ul>
          {/* Tira de miniaturas con el resto (scroll horizontal). */}
          {others.length > 0 && (
            <ul className="grid h-20 shrink-0 grid-flow-col gap-2 overflow-x-auto pb-1 auto-cols-[44%] sm:h-24 sm:auto-cols-[160px]">
              {others.map((t) => (
                <ParticipantCard key={t.uid} {...t} compact {...pinProps(t)} />
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  // ── Modo GRID equitativo ──────────────────────────────────────────────
  const visible = paginated
    ? tiles.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)
    : tiles;

  const shown = visible.length;
  const cols = columnsFor(shown, narrow);
  const rows = Math.max(1, Math.ceil(shown / cols));
  const compact = shown >= 5;

  const layoutLabel = paginated
    ? `Mostrando ${shown} de ${count}`
    : count === 4
    ? "2×2"
    : count >= 5
    ? "Grid adaptable"
    : `${cols}×${rows}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <Counter count={count} label={layoutLabel} />
      <ul
        className="grid h-full min-h-0 w-full flex-1 gap-1.5 transition-all duration-300 sm:gap-3"
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
            {...pinProps(t)}
            className={
              !narrow && shown === 3 && idx === 2 ? "col-span-2" : undefined
            }
          />
        ))}
      </ul>

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

/** Contador de participantes (Tarea 4) — se actualiza automáticamente. */
function Counter({ count, label }: { count: number; label: string }) {
  return (
    <div className="flex shrink-0 items-center justify-between px-0.5">
      <p
        aria-live="polite"
        className="text-xs font-semibold uppercase tracking-wide text-slate-400"
      >
        {count} participante{count !== 1 ? "s" : ""}
        <span className="mx-1.5 text-slate-600">—</span>
        <span className="text-slate-500">{label}</span>
      </p>
    </div>
  );
}
