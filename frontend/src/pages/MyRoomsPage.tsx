/**
 * MyRoomsPage — "Mis salas": SOLO las salas que el usuario creó (es anfitrión).
 *
 * Desde aquí puede **administrarlas**: editar el nombre o eliminarlas (vía
 * `RoomSettingsModal`). Las salas a las que solo se unió NO aparecen aquí
 * (esas se ven en el Dashboard como "Salas recientes").
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import Button from "@/components/Button";
import ErrorState from "@/components/ErrorState";
import { RoomCardSkeleton } from "@/components/Skeleton";
import RoomCard from "@/components/rooms/RoomCard";
import RoomSettingsModal from "@/components/rooms/RoomSettingsModal";
import CreateRoomModal from "@/components/rooms/CreateRoomModal";
import { listMyRooms, type Room } from "@/services/rooms";
import { friendlyError, type FriendlyError } from "@/services/apiErrors";

type LoadState = "loading" | "ready" | "error";

export default function MyRoomsPage() {
  const { user } = useAuth();
  const { show } = useToast();
  const navigate = useNavigate();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<FriendlyError | null>(null);
  const [settingsRoom, setSettingsRoom] = useState<Room | null>(null);
  const [openCreate, setOpenCreate] = useState(false);

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

  useEffect(() => {
    void fetchRooms();
    const onFocus = () => void fetchRooms();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchRooms]);

  // Solo mis salas (las que creé).
  const myRooms = rooms.filter((r) => !!user && r.ownerId === user.uid);

  function handleCreated(room: Room) {
    setOpenCreate(false);
    show("success", "La sala fue creada con éxito");
    navigate(`/room/${room.roomId}`);
  }

  function handleRoomUpdated() {
    setSettingsRoom(null);
    show("success", "Sala actualizada correctamente");
    void fetchRooms();
  }

  function handleRoomDeleted() {
    setSettingsRoom(null);
    show("success", "La sala fue eliminada correctamente");
    void fetchRooms();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Mis salas</h1>
          <p className="mt-1 text-slate-600">
            Las salas que creaste. Puedes editar su nombre o eliminarlas.
          </p>
        </div>
        <Button onClick={() => setOpenCreate(true)}>+ Crear sala</Button>
      </div>

      <section aria-label="Lista de mis salas">
        {loadState === "loading" && (
          <ul
            aria-busy="true"
            aria-label="Cargando mis salas"
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

        {loadState === "ready" && myRooms.length === 0 && <EmptyState />}

        {loadState === "ready" && myRooms.length > 0 && (
          <ul className="grid gap-4 sm:grid-cols-2">
            {myRooms.map((room) => (
              <li key={room.roomId}>
                <RoomCard
                  room={room}
                  onEnter={() => navigate(`/room/${room.roomId}`)}
                  onManage={() => setSettingsRoom(room)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {settingsRoom && (
        <RoomSettingsModal
          open
          room={settingsRoom}
          onClose={() => setSettingsRoom(null)}
          onUpdated={handleRoomUpdated}
          onDeleted={handleRoomDeleted}
        />
      )}
      <CreateRoomModal
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <span aria-hidden="true" className="text-4xl">🗂️</span>
      <p className="text-lg font-bold text-slate-900">
        Aún no has creado ninguna sala
      </p>
      <p className="max-w-md text-slate-600">
        Crea tu primera sala para administrarla desde aquí (editar el nombre o
        eliminarla).
      </p>
    </div>
  );
}
