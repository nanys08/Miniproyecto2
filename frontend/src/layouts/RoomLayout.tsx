import { Outlet, Link, useParams } from "react-router-dom";
import Button from "@/components/Button";

// Layout para una sala de estudio. Sprint 0: solo estructura visual.
// Las regiones (video, chat, controles) se llenan en Sprints posteriores.
export default function RoomLayout() {
  const { id } = useParams();

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      <header className="border-b border-slate-800 bg-slate-950">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Sala
            </p>
            <h1 className="text-lg font-semibold">{id ?? "—"}</h1>
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
