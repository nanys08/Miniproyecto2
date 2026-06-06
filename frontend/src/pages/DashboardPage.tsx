/**
 * DashboardPage — Panel principal de gestión de salas de EstudioColab.
 *
 * Contenido:
 *  - Saludo + botón "+ Crear sala" fijo arriba a la derecha.
 *  - Dos tarjetas de acción: "Crear sala nueva" y "Unirme a sala".
 *  - Sección "Salas recientes": loading / estado vacío con onboarding / lista.
 *
 * La lista se actualiza automáticamente al montar y cuando la ventana recupera
 * el foco (p. ej. al volver de una sala recién creada).
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { cn } from "@/utils/cn";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import Button from "@/components/Button";
import ErrorState from "@/components/ErrorState";
import { RoomCardSkeleton } from "@/components/Skeleton";
import CreateRoomModal from "@/components/rooms/CreateRoomModal";
import JoinRoomModal from "@/components/rooms/JoinRoomModal";
import { listMyRooms, type Room } from "@/services/rooms";
import { friendlyError, type FriendlyError } from "@/services/apiErrors";

type LoadState = "loading" | "ready" | "error";

export default function DashboardPage() {
  const { user } = useAuth();
  const { show } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<FriendlyError | null>(null);
  const [openCreate, setOpenCreate] = useState(false);
  const [openJoin, setOpenJoin] = useState(false);

  const displayName =
    user?.username ?? user?.displayName ?? user?.email?.split("@")[0] ?? "estudiante";

  const fetchRooms = useCallback(async () => {
    try {
      const list = await listMyRooms();
      setRooms(list);
      setLoadError(null);
      setLoadState("ready");
    } catch (err) {
      setLoadError(friendlyError(err));
      setLoadState("error");
    }
  }, []);

  // Carga inicial + recarga al recuperar foco (mantiene la lista fresca).
  useEffect(() => {
    void fetchRooms();
    const onFocus = () => void fetchRooms();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchRooms]);

  // Atajo desde el sidebar: /dashboard?action=create | ?action=join
  useEffect(() => {
    const action = searchParams.get("action");
    if (action !== "create" && action !== "join") return;
    if (action === "create") setOpenCreate(true);
    if (action === "join") setOpenJoin(true);
    const next = new URLSearchParams(searchParams);
    next.delete("action");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  function handleCreated(room: Room) {
    setOpenCreate(false);
    show("success", "La sala fue creada con éxito");
    navigate(`/room/${room.roomId}`);
  }

  function handleJoined(room: Room) {
    setOpenJoin(false);
    navigate(`/room/${room.roomId}`);
  }

  return (
    <div className="flex flex-col gap-8">
      {/* ── Saludo + CTA ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            ¡Bienvenido de nuevo, @{displayName}!
          </h1>
          <p className="mt-1 text-slate-600">¿Qué vamos a estudiar hoy?</p>
        </div>
        <Button onClick={() => setOpenCreate(true)}>+ Crear sala</Button>
      </div>

      {/* ── Dos tarjetas de acción ── */}
      <div className="grid gap-4 sm:grid-cols-2">
        <ActionCard
          onClick={() => setOpenCreate(true)}
          color="brand"
          icon={
            <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8">
              <path d="M12 5v14m-7-7h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          }
          title="Crear sala nueva"
          description="Invita a tus compañeros ahora"
        />
        <ActionCard
          onClick={() => setOpenJoin(true)}
          color="brand"
          highlighted
          icon={
            <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8">
              <path d="M15 7a3 3 0 11-6 0 3 3 0 016 0z" stroke="currentColor" strokeWidth="2" />
              <path d="M9 10l-6 6 2 2 2-2 1 1 2-2 2 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
          title="Unirme a sala"
          description="Ingresa un código"
        />
      </div>

      {/* ── Salas recientes ── */}
      <section aria-labelledby="recientes-title">
        <h2 id="recientes-title" className="mb-4 text-xl font-bold text-slate-900">
          Salas recientes
        </h2>

        {loadState === "loading" && (
          <ul
            aria-busy="true"
            aria-label="Cargando tus salas"
            className="grid gap-4 sm:grid-cols-2"
          >
            {[0, 1, 2, 3].map((i) => (
              <li key={i}>
                <RoomCardSkeleton />
              </li>
            ))}
          </ul>
        )}

        {loadState === "error" && loadError && (
          <ErrorState
            kind={loadError.kind}
            title={loadError.title}
            message={loadError.message}
            actionLabel={loadError.retriable ? "Reintentar" : undefined}
            onAction={
              loadError.retriable
                ? () => {
                    setLoadState("loading");
                    setLoadError(null);
                    void fetchRooms();
                  }
                : undefined
            }
            variant="inline"
          />
        )}

        {loadState === "ready" && rooms.length === 0 && <EmptyState />}

        {loadState === "ready" && rooms.length > 0 && (
          <ul className="grid gap-4 sm:grid-cols-2">
            {rooms.map((room) => (
              <li key={room.roomId}>
                <RoomCard room={room} onEnter={() => navigate(`/room/${room.roomId}`)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <CreateRoomModal
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        onCreated={handleCreated}
      />
      <JoinRoomModal
        open={openJoin}
        onClose={() => setOpenJoin(false)}
        onJoined={handleJoined}
      />
    </div>
  );
}

// ─── Estado vacío (onboarding) ───────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <span aria-hidden="true" className="text-4xl">📚</span>
      <p className="text-lg font-bold text-slate-900">
        ¡Aún no tienes salas activas!
      </p>
      <p className="max-w-md text-slate-600">
        Aquí es donde podrás ver tu historial de estudio colaborativo.
        ¡Crea tu primera sala de estudio o únete a una para empezar!
      </p>
    </div>
  );
}

// ─── Tarjeta de sala ─────────────────────────────────────────────────────────

interface RoomCardProps {
  room: Room;
  onEnter: () => void;
}

function RoomCard({ room, onEnter }: RoomCardProps) {
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

      <div className="mt-auto flex items-center justify-between gap-3 pt-1">
        <span className="inline-flex items-center gap-1.5 text-sm text-slate-600">
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
            <path d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6 0a4 4 0 100-8 4 4 0 000 8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {participantes} {participantes === 1 ? "participante" : "participantes"}
        </span>
        <Button size="sm" onClick={onEnter}>
          Entrar
        </Button>
      </div>
    </div>
  );
}

// ─── Tarjeta de acción ───────────────────────────────────────────────────────

interface ActionCardProps {
  onClick: () => void;
  color: "brand" | "amber";
  icon: ReactNode;
  title: string;
  description: string;
  /** Card recomendada — borde + fondo azul claro (design system). */
  highlighted?: boolean;
}

function ActionCard({
  onClick,
  color,
  icon,
  title,
  description,
  highlighted = false,
}: ActionCardProps) {
  const colorMap = {
    brand: "text-brand-600",
    amber: "text-amber-500",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex flex-col items-start gap-3 rounded-xl border p-6 text-left shadow-sm transition-all hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2",
        highlighted
          ? "border-brand-200 bg-brand-50 hover:border-brand-400"
          : "border-slate-200 bg-white hover:border-brand-300"
      )}
    >
      <span className={colorMap[color]} aria-hidden="true">
        {icon}
      </span>
      <div>
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <p className="mt-0.5 text-sm text-slate-600">{description}</p>
      </div>
    </button>
  );
}
