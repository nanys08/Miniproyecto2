import { useEffect, useState } from "react";
import { Outlet, Link, useParams } from "react-router-dom";
import Button from "@/components/Button";
import { getRoom } from "@/services/rooms";

// Layout para una sala de estudio. Carga el nombre real de la sala desde el
// backend a partir del :id de la URL; mientras tanto muestra un placeholder.
export default function RoomLayout() {
  const { id } = useParams();
  const [roomName, setRoomName] = useState<string | null>(null);
  const [accessCode, setAccessCode] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    getRoom(id)
      .then((room) => {
        if (!active) return;
        setRoomName(room.name);
        setAccessCode(room.accessCode);
      })
      .catch(() => {
        if (active) setRoomName(null);
      });
    return () => { active = false; };
  }, [id]);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      <header className="border-b border-slate-800 bg-slate-950">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Sala
            </p>
            <h1 className="text-lg font-semibold">{roomName ?? "Cargando…"}</h1>
            {accessCode && (
              <p className="mt-0.5 text-xs text-slate-400">
                Código:{" "}
                <span className="font-mono font-bold tracking-widest text-slate-200">
                  {accessCode}
                </span>
              </p>
            )}
          </div>
          <Link to="/dashboard">
            <Button variant="ghost" size="sm" className="text-slate-100 hover:bg-slate-800">
              Salir de la sala
            </Button>
          </Link>
        </div>
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto grid w-full max-w-7xl flex-1 gap-4 px-4 py-4 lg:grid-cols-[1fr_320px]"
      >
        <Outlet />
      </main>
    </div>
  );
}
