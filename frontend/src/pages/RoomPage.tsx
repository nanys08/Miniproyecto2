/**
 * @file RoomPage — Interfaz completa de una Sala de Estudio Activa.
 *
 * Layout (basado en las maquetas):
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  Nombre sala  • Estado conexión        [Participantes][Invit]│  header
 *   │  Sala activa  Código: MATH-7GBK                              │
 *   ├──────────────────────────────────────┬───────────────────────┤
 *   │                                      │                       │
 *   │   ┌──────────┬──────────┐            │   [Chat][Participantes]│
 *   │   │  Tú      │  Sofía   │            │                       │
 *   │   │  avatar  │  avatar  │            │   ...mensajes...      │
 *   │   ├──────────┼──────────┤            │                       │
 *   │   │  Carlos  │  Diego   │            │   [escribe mensaje…]  │
 *   │   └──────────┴──────────┘            │                       │
 *   ├──────────────────────────────────────┴───────────────────────┤
 *   │  [🎤] [📷] [🖥] [⋯]                 [Salir de la sala 🔴]   │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * En vez de mostrar imágenes aleatorias de cámaras, cada tile renderiza
 * el avatar que el participante eligió (para el usuario actual sale de
 * `useAuth().user.avatar`).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { cn } from "@/utils/cn";
import { useAuth } from "@/hooks/useAuth";
import { useChat } from "@/hooks/useChat";
import { getRoom, type Room } from "@/services/rooms";
import { getPublicUser, type PublicUser } from "@/services/users";
import ChatPanel from "@/components/room/ChatPanel";
import ConnectionBadge from "@/components/room/ConnectionBadge";
import Avatar from "@/components/Avatar";

/** Cuántos tiles vacíos rellenamos para mantener el grid 2x2. */
const GRID_SLOTS = 4;

interface ToggleControl {
  label: string;
  icon: JSX.Element;
  active: boolean;
  onClick: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────────────────────

export default function RoomPage() {
  const { id: roomId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  // ── Cargar metadatos de la sala ─────────────────────────────────────────
  const [room, setRoom] = useState<Room | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!roomId) return;
    let alive = true;
    getRoom(roomId)
      .then((r) => {
        if (alive) setRoom(r);
      })
      .catch(() => {
        if (alive) setLoadError("No se pudo cargar la sala.");
      });
    return () => {
      alive = false;
    };
  }, [roomId]);

  // ── Suscribirse al chat ─────────────────────────────────────────────────
  const { status, statusLabel, messages, sendMessage, presentUsers } =
    useChat(roomId);

  // ── Cache de perfiles públicos (uid → PublicUser) ─────────────────────
  // Solo nos hace falta como fallback: el backend ya envía `avatar` dentro
  // de los payloads `members` (ack de join_room) y `user_joined`. Si por
  // alguna razón no viniera el avatar (e.g. backend antiguo), lo pedimos
  // a /api/users/:uid una sola vez por uid.
  const [profileCache, setProfileCache] = useState<Record<string, PublicUser>>(
    {}
  );
  const fetchingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    presentUsers.forEach((p) => {
      if (p.uid === user.uid) return;
      if (p.avatar) return; // ya tenemos avatar — no hace falta REST
      if (profileCache[p.uid]) return;
      if (fetchingRef.current.has(p.uid)) return;
      fetchingRef.current.add(p.uid);
      getPublicUser(p.uid)
        .then((profile) =>
          setProfileCache((prev) => ({ ...prev, [p.uid]: profile }))
        )
        .catch(() => undefined)
        .finally(() => fetchingRef.current.delete(p.uid));
    });
  }, [presentUsers, user, profileCache]);

  // ── Controles locales de micrófono / cámara / pantalla ─────────────────
  // (En este sprint son indicadores visuales; WebRTC viene en TS-03.)
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [screenOn, setScreenOn] = useState(false);

  // ── Participantes en pantalla ──────────────────────────────────────────
  // El grid muestra ÚNICAMENTE quienes están actualmente conectados:
  //   1. El propio usuario (siempre).
  //   2. `presentUsers` del socket (sembrados desde el ack de join_room +
  //      actualizados con user_joined / user_left).
  //
  // No usamos `room.participants` (membresía histórica de Firestore) como
  // fuente — eso haría que un usuario que ya salió siga apareciendo en el
  // grid de los demás, que es justo el bug que estamos arreglando.
  //
  // Si `presentUsers` no trae avatar (caso raro: backend antiguo), caemos
  // al `profileCache` que sí lo resuelve vía REST.
  const participants = useMemo(() => {
    const map = new Map<
      string,
      {
        uid: string;
        username: string;
        avatar?: string;
        isOwner?: boolean;
        isYou?: boolean;
        online?: boolean;
      }
    >();

    if (user) {
      map.set(user.uid, {
        uid: user.uid,
        username: user.username || user.displayName || "Tú",
        avatar: user.avatar,
        isOwner: room?.ownerId === user.uid,
        isYou: true,
        online: true,
      });
    }

    presentUsers.forEach((p) => {
      if (p.uid === user?.uid) return; // no duplicar al actual
      if (map.has(p.uid)) return;
      const cached = profileCache[p.uid];
      map.set(p.uid, {
        uid: p.uid,
        username: p.username || cached?.username || `Usuario ${p.uid.slice(0, 6)}`,
        avatar: p.avatar || cached?.avatar,
        isOwner: room?.ownerId === p.uid,
        online: true,
      });
    });

    return Array.from(map.values());
  }, [user, room, presentUsers, profileCache]);

  // ── Controles de la barra inferior ─────────────────────────────────────
  const controls: ToggleControl[] = [
    {
      label: micOn ? "Silenciar micrófono" : "Activar micrófono",
      active: micOn,
      onClick: () => setMicOn((v) => !v),
      icon: micOn ? (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3M8 22h8" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 2l20 20" />
          <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6" />
          <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
        </svg>
      ),
    },
    {
      label: camOn ? "Apagar cámara" : "Encender cámara",
      active: camOn,
      onClick: () => setCamOn((v) => !v),
      icon: camOn ? (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m23 7-7 5 7 5V7z" />
          <rect width="15" height="14" x="1" y="5" rx="2" ry="2" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34m1 3.66 5 3V7l-5 3M2 2l20 20" />
        </svg>
      ),
    },
    {
      label: screenOn ? "Dejar de compartir" : "Compartir pantalla",
      active: screenOn,
      onClick: () => setScreenOn((v) => !v),
      icon: (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      ),
    },
  ];

  const isReconnectingHeader =
    status === "reconnecting" || status === "offline" || status === "error";

  // ── Render ──────────────────────────────────────────────────────────────
  if (loadError) {
    return (
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto flex max-w-2xl flex-1 flex-col items-center justify-center p-8 text-center"
      >
        <h1 className="text-xl font-semibold">{loadError}</h1>
        <Link
          to="/dashboard"
          className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Volver al dashboard
        </Link>
      </main>
    );
  }

  return (
    <>
      {/* ── Header ───────────────────────────────────────────────────── */}
      <header
        className={cn(
          "border-b bg-slate-950 transition-colors",
          isReconnectingHeader ? "border-amber-500/30" : "border-slate-800"
        )}
      >
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="truncate text-lg font-semibold text-white sm:text-xl">
                {room?.name ?? "Cargando…"}
              </h1>
              <ConnectionBadge status={status} label={statusLabel} />
            </div>
            <p className="mt-0.5 text-xs text-slate-400">
              {room?.isActive !== false && (
                <span className="text-emerald-400">Sala activa</span>
              )}
              {room?.accessCode && (
                <>
                  <span className="mx-2 text-slate-600">·</span>
                  Código:{" "}
                  <span className="font-mono font-semibold tracking-wider text-slate-200">
                    {room.accessCode}
                  </span>
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-md bg-slate-800/60 px-2.5 py-1 text-xs text-slate-300 sm:inline-flex">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              {participants.length} participante{participants.length !== 1 ? "s" : ""}
            </span>
            <button
              type="button"
              onClick={() => {
                if (room?.accessCode) {
                  void navigator.clipboard
                    ?.writeText(room.accessCode)
                    .catch(() => undefined);
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="8.5" cy="7" r="4" />
                <line x1="20" y1="8" x2="20" y2="14" />
                <line x1="17" y1="11" x2="23" y2="11" />
              </svg>
              Invitar
            </button>
          </div>
        </div>
      </header>

      {/* ── Cuerpo: video + chat ────────────────────────────────────────── */}
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto grid w-full max-w-[1400px] flex-1 gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[1fr_360px]"
      >
        {/* Cuadrícula de video */}
        <section
          aria-labelledby="region-stage"
          className="flex min-h-[420px] flex-col rounded-2xl bg-slate-950/60 p-3 ring-1 ring-slate-800"
        >
          <h2 id="region-stage" className="sr-only">
            Área de video y compartición de pantalla
          </h2>
          <ul
            role="list"
            className="grid h-full flex-1 grid-cols-2 grid-rows-2 gap-3"
          >
            {Array.from({ length: GRID_SLOTS }).map((_, idx) => {
              const p = participants[idx];
              if (p) {
                return (
                  <VideoTile
                    key={p.uid}
                    name={p.isYou ? "Tú" : p.username}
                    avatar={p.avatar}
                    isYou={p.isYou}
                    cameraOff={p.isYou ? !camOn : false}
                    micOff={p.isYou ? !micOn : false}
                  />
                );
              }
              return <EmptyTile key={`empty-${idx}`} />;
            })}
          </ul>
        </section>

        {/* Panel chat */}
        <div className="flex min-h-[420px] flex-col lg:max-h-[calc(100vh-200px)]">
          <ChatPanel
            currentUid={user?.uid ?? ""}
            messages={messages}
            participants={participants}
            status={status}
            onSend={sendMessage}
          />
        </div>
      </main>

      {/* ── Barra de controles ─────────────────────────────────────────── */}
      <footer className="border-t border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Controles de la sala">
            {controls.map((c) => (
              <button
                key={c.label}
                type="button"
                onClick={c.onClick}
                aria-label={c.label}
                aria-pressed={c.active}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                  c.active
                    ? "border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700"
                    : "border-slate-700 bg-slate-900 text-slate-400 hover:bg-slate-800"
                )}
              >
                {c.icon}
                <span className="hidden sm:inline">{c.label.split(" ")[1] ?? c.label}</span>
              </button>
            ))}
            <button
              type="button"
              aria-label="Más opciones"
              className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm font-medium text-slate-300 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="1" />
                <circle cx="19" cy="12" r="1" />
                <circle cx="5" cy="12" r="1" />
              </svg>
              <span className="hidden sm:inline">Más</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className={cn(
              "inline-flex items-center gap-2 rounded-md border-2 border-red-500 px-4 py-1.5",
              "text-sm font-semibold text-red-400 transition-colors",
              "hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            )}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Salir de la sala
          </button>
        </div>
      </footer>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tiles del grid de video
// ─────────────────────────────────────────────────────────────────────────────

interface VideoTileProps {
  name: string;
  avatar?: string;
  isYou?: boolean;
  cameraOff?: boolean;
  micOff?: boolean;
}

function VideoTile({ name, avatar, isYou, cameraOff, micOff }: VideoTileProps) {
  return (
    <li
      aria-label={`Video de ${name}${cameraOff ? " (cámara apagada)" : ""}`}
      className={cn(
        "relative flex aspect-video items-center justify-center overflow-hidden rounded-xl",
        cameraOff
          ? "bg-slate-800 ring-1 ring-slate-700"
          : "bg-gradient-to-br from-slate-700 to-slate-900 ring-1 ring-slate-600"
      )}
    >
      {avatar ? (
        <img
          src={avatar}
          alt=""
          aria-hidden="true"
          className={cn(
            "h-24 w-24 rounded-full object-cover ring-4 ring-slate-900/40 sm:h-32 sm:w-32",
            cameraOff && "opacity-50 grayscale"
          )}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <Avatar name={name} size="xl" className="ring-4 ring-slate-900/40" />
      )}

      {/* Etiqueta nombre (top-left) */}
      <span className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-md bg-slate-950/70 px-2 py-0.5 text-xs font-medium text-slate-100 backdrop-blur">
        {isYou && (
          <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
        )}
        {name}
      </span>

      {/* Estado mic (bottom-right) */}
      <span
        className={cn(
          "absolute bottom-2 right-2 inline-flex h-7 w-7 items-center justify-center rounded-full",
          micOff ? "bg-red-500/90 text-white" : "bg-slate-900/70 text-slate-200"
        )}
        aria-hidden="true"
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
    </li>
  );
}

function EmptyTile() {
  return (
    <li
      aria-hidden="true"
      className="flex aspect-video items-center justify-center rounded-xl border-2 border-dashed border-slate-700 bg-slate-900/40 text-xs text-slate-500"
    >
      Espacio disponible
    </li>
  );
}
