/**
 * @file ParticipantCard — Tarjeta de un participante en el grid (C3, Tarea 2).
 *
 * Capas (de fondo a frente):
 *   1. Video o avatar — el stream ocupa todo el tile; si la cámara está
 *      apagada o no hay video, se muestra el avatar sobre fondo oscuro.
 *   2. Barra inferior — degradado con nombre + íconos de mic/cámara + punto de
 *      estado de conexión (verde activo / ámbar reconectando / rojo desc.).
 *   3. Badges contextuales (esquina sup. derecha) — "Hablando" / "Reconectando"
 *      / "Desconectado", solo cuando el evento está activo.
 *
 * Estado "Hablando" (Tarea 6): borde verde con pulso, badge y ondas de audio.
 * Accesibilidad: role="region" + aria-label dinámico que resume nombre y
 * estado; íconos decorativos con aria-hidden.
 */

import { useEffect, useRef } from "react";
import { cn } from "@/utils/cn";
import Avatar from "@/components/Avatar";

export type ParticipantConnection = "active" | "reconnecting" | "disconnected";

export interface ParticipantCardProps {
  name: string;
  avatar?: string;
  isYou?: boolean;
  cameraOff?: boolean;
  micOff?: boolean;
  /** MediaStream de cámara/pantalla a renderizar (local o remoto). */
  stream?: MediaStream;
  /** Silenciar el `<video>` (siempre true para el tile propio: evita eco). */
  muted?: boolean;
  /** Espejar (cámara propia, no al compartir pantalla). */
  mirror?: boolean;
  /** El participante está hablando (detección de actividad de voz). */
  speaking?: boolean;
  /** Estado de la conexión P2P con este participante. */
  connection?: ParticipantConnection;
  /** Tile pequeño (grids de 5+ / tira de miniaturas) → badge abreviado. */
  compact?: boolean;
  /** Está presentando (compartiendo pantalla) → badge "Presentando". */
  presenting?: boolean;
  /** Este tile está fijado/destacado en el escenario (spotlight). */
  pinned?: boolean;
  /** Usar object-contain (pantallas compartidas: no recortar el contenido). */
  objectContain?: boolean;
  /** Fijar/Quitar del escenario. Si se pasa, aparece el botón de fijar. */
  onSelect?: () => void;
  /** Clases extra para el `<li>` (p. ej. col-span en layouts especiales). */
  className?: string;
}

export default function ParticipantCard({
  name,
  avatar,
  isYou,
  cameraOff,
  micOff,
  stream,
  muted,
  mirror,
  speaking,
  connection = "active",
  compact,
  presenting,
  pinned,
  objectContain,
  onSelect,
  className,
}: ParticipantCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const disconnected = connection === "disconnected";
  const reconnecting = connection === "reconnecting";
  const showVideo = !!stream && !cameraOff && !disconnected;

  // srcObject por ref + play() explícito (algunos navegadores bloquean el
  // autoplay con audio; sin esto no se vería ni escucharía al remoto).
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.srcObject !== (stream ?? null)) el.srcObject = stream ?? null;
    if (stream) {
      el.play().catch(() => undefined);
    }
  }, [stream]);

  // aria-label dinámico (US-09 accesibilidad): resume nombre + estado.
  const ariaLabel = [
    isYou ? `${name} (tú)` : name,
    speaking ? "hablando" : null,
    micOff ? "micrófono silenciado" : "micrófono activo",
    cameraOff ? "cámara apagada" : "cámara activa",
    disconnected ? "desconectado" : reconnecting ? "reconectando" : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <li
      role="region"
      aria-label={`Video de ${ariaLabel}`}
      className={cn(
        "group relative flex h-full w-full min-h-0 items-center justify-center overflow-hidden rounded-xl ring-1 transition-all duration-300 ease-out",
        // Fondo: azul muy oscuro sin video (≠ negro de cámara apagada).
        showVideo ? "bg-slate-950" : "bg-[#1a1a2e]",
        // Borde verde + pulso + leve zoom cuando habla (Tarea 6).
        speaking
          ? "ring-2 ring-green-400 speaking-pulse z-10 scale-[1.02]"
          : pinned
          ? "ring-2 ring-blue-400/80"
          : "ring-slate-700/80",
        disconnected && "opacity-60 grayscale",
        className
      )}
    >
      {/* Botón de fijar/quitar del escenario (aparece al pasar el cursor o
          enfocar). Permite a cada usuario destacar a quien quiera ver grande. */}
      {onSelect && (
        <button
          type="button"
          onClick={onSelect}
          aria-label={pinned ? `Quitar a ${name} del escenario` : `Fijar a ${name} en el escenario`}
          aria-pressed={pinned}
          className={cn(
            "absolute left-1.5 top-1.5 z-30 inline-flex h-7 w-7 items-center justify-center rounded-md text-white transition-opacity focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400",
            pinned
              ? "bg-blue-600/90 opacity-100"
              : "bg-slate-900/70 opacity-0 group-hover:opacity-100"
          )}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {pinned ? (
              <>
                <path d="m3 3 18 18" />
                <path d="M15 5l4 4M9 9l-4 8 8-4" />
              </>
            ) : (
              <>
                <path d="M9 4v6l-2 4h10l-2-4V4" />
                <path d="M12 14v6" />
              </>
            )}
          </svg>
        </button>
      )}
      {/* Badge "Presentando" (sup. derecha, encima del badge de estado). */}
      {presenting && !disconnected && (
        <span
          aria-live="polite"
          className={cn(
            "absolute z-20 inline-flex items-center gap-1 rounded-md bg-blue-600/90 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white",
            speaking || reconnecting ? "right-1.5 top-8" : "right-1.5 top-1.5"
          )}
        >
          {compact ? "Pres." : "🖥 Presentando"}
        </span>
      )}

      {/* ── Capa 3: badge contextual (sup. derecha) ── */}
      {(speaking || reconnecting || disconnected) && (
        <span
          aria-live="polite"
          className={cn(
            "absolute right-1.5 top-1.5 z-20 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white",
            disconnected
              ? "bg-red-600"
              : reconnecting
              ? "bg-amber-500"
              : "bg-green-600/90"
          )}
        >
          {disconnected
            ? "Desconectado"
            : reconnecting
            ? compact
              ? "Reconec."
              : "Reconectando"
            : compact
            ? "Hab."
            : "🎙 Hablando"}
        </span>
      )}

      {/* ── Capa 1: video (siempre montado para conservar la pista) ── */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className={cn(
          "absolute inset-0 h-full w-full bg-slate-950",
          objectContain ? "object-contain" : "object-cover",
          mirror && "scale-x-[-1]",
          showVideo ? "block" : "hidden"
        )}
      />

      {/* ── Capa 1 (alt): avatar cuando no hay video ── */}
      {!showVideo &&
        (avatar ? (
          <img
            src={avatar}
            alt=""
            aria-hidden="true"
            className={cn(
              "rounded-full object-cover ring-4 ring-slate-900/40",
              compact ? "h-12 w-12" : "h-20 w-20 sm:h-24 sm:w-24",
              (cameraOff || disconnected) && "opacity-60"
            )}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <Avatar name={name} size={compact ? "md" : "xl"} className="ring-4 ring-slate-900/40" />
        ))}

      {/* ── Capa 2: barra inferior con nombre + estado ── */}
      <div className="absolute inset-x-0 bottom-0 z-10 flex items-center gap-1.5 bg-gradient-to-t from-black/75 to-transparent px-2 pb-1.5 pt-5">
        {/* Punto de estado de conexión */}
        <span
          aria-hidden="true"
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            disconnected
              ? "bg-red-500"
              : reconnecting
              ? "bg-amber-400"
              : "bg-emerald-400"
          )}
        />
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[11px] font-medium text-white",
            disconnected && "text-slate-400"
          )}
        >
          {isYou ? `${name} · Tú` : name}
        </span>

        {/* Ondas de audio cuando habla (Tarea 6) */}
        {speaking && !micOff && (
          <span aria-hidden="true" className="flex items-end gap-0.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="audio-bar w-0.5 rounded-full bg-green-400"
                style={{ height: "10px", animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </span>
        )}

        {/* Ícono de micrófono (rojo si silenciado) */}
        <span
          aria-hidden="true"
          className={cn("shrink-0", micOff ? "text-red-400" : "text-white")}
        >
          {micOff ? (
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 2l20 20" />
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="2" width="6" height="13" rx="3" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" />
            </svg>
          )}
        </span>

        {/* Ícono de cámara tachada cuando está apagada (intencional) */}
        {cameraOff && !disconnected && (
          <span aria-hidden="true" className="shrink-0 text-slate-300">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34m1 3.66 5 3V7l-5 3M2 2l20 20" />
            </svg>
          </span>
        )}
      </div>
    </li>
  );
}
