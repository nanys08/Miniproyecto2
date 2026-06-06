/**
 * RoomCard — Tarjeta de una sala (reutilizada en Dashboard y "Mis salas").
 *
 * Muestra nombre + punto/badge de estado, código de acceso, nº de
 * participantes y acciones. Si se pasa `onManage`, añade el botón
 * "⚙ Configurar" (editar/eliminar) — se usa solo en las salas propias.
 */

import { cn } from "@/utils/cn";
import Button from "@/components/Button";
import type { Room } from "@/services/rooms";

interface RoomCardProps {
  room: Room;
  onEnter: () => void;
  /** Si se provee, muestra "⚙ Configurar" (editar nombre / eliminar). */
  onManage?: () => void;
}

export default function RoomCard({ room, onEnter, onManage }: RoomCardProps) {
  const participantes = room.participants?.length ?? 0;
  return (
    <div className="flex h-full flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          {/* Punto de estado — redundancia con el badge para no depender del color */}
          <span
            aria-hidden="true"
            className={cn(
              "inline-block h-2.5 w-2.5 shrink-0 rounded-full",
              room.isActive ? "bg-emerald-500" : "bg-slate-400"
            )}
          />
          {room.name}
        </h3>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold",
            room.isActive
              ? "bg-emerald-50 text-emerald-800"
              : "bg-slate-100 text-slate-500"
          )}
        >
          {room.isActive ? "Activa" : "Inactiva"}
        </span>
      </div>

      <p className="text-sm text-slate-500">
        Código:{" "}
        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-bold tracking-widest text-slate-800">
          {room.accessCode}
        </span>
      </p>

      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <span className="inline-flex items-center gap-1.5 text-sm text-slate-600">
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
            <path d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6 0a4 4 0 100-8 4 4 0 000 8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {participantes} {participantes === 1 ? "participante" : "participantes"}
        </span>
        <div className="flex items-center gap-2">
          {onManage && (
            <Button
              size="sm"
              variant="secondary"
              onClick={onManage}
              aria-label={`Configurar la sala ${room.name} (editar o eliminar)`}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              <span className="hidden sm:inline">Configurar</span>
            </Button>
          )}
          <Button size="sm" onClick={onEnter}>
            Entrar
          </Button>
        </div>
      </div>
    </div>
  );
}
