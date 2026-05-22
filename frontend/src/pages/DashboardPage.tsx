import { useState, type ReactNode } from "react";
import Button from "@/components/Button";
import Modal from "@/components/Modal";
import Input from "@/components/Input";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";

interface RecentRoom {
  id: string;
  title: string;
  category: string;
  members: number;
  status: "active" | "in-progress" | "finished";
}

// Salas placeholder hasta Sprint 1 (CRUD real)
const sampleRooms: RecentRoom[] = [
  {
    id: "demo-1",
    title: "Matemáticas Avanzadas",
    category: "Cálculo III",
    members: 8,
    status: "in-progress",
  },
  {
    id: "demo-2",
    title: "Historia Universal",
    category: "Historia",
    members: 5,
    status: "finished",
  },
  {
    id: "demo-3",
    title: "Inglés - Conversación",
    category: "Idiomas",
    members: 12,
    status: "active",
  },
];

const statusBadge: Record<RecentRoom["status"], { label: string; color: string }> = {
  active: { label: "Activa", color: "bg-green-100 text-green-800" },
  "in-progress": { label: "En curso", color: "bg-blue-100 text-blue-800" },
  finished: { label: "Finalizada", color: "bg-slate-100 text-slate-700" },
};

export default function DashboardPage() {
  const { user } = useAuth();
  const { show } = useToast();
  const [openCreate, setOpenCreate] = useState(false);
  const [roomName, setRoomName] = useState("");

  const displayName = user?.username ?? user?.displayName ?? user?.email?.split("@")[0] ?? "estudiante";

  function handleCreateRoom() {
    setOpenCreate(false);
    setRoomName("");
    show("info", "El CRUD de salas se habilita en el Sprint 1");
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Greeting + CTA */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            ¡Bienvenido de nuevo, @{displayName}!
          </h1>
          <p className="mt-1 text-slate-600">¿Qué vamos a estudiar hoy?</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Ver notificaciones"
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 focus-visible:ring-brand-600"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
              <path
                d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span
              aria-hidden="true"
              className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500"
            />
          </button>
          <Button onClick={() => setOpenCreate(true)}>+ Crear sala</Button>
        </div>
      </div>

      {/* Tres cards de acciones */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ActionCard
          onClick={() => setOpenCreate(true)}
          color="brand"
          icon={
            <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8">
              <path
                d="M12 5v14m-7-7h14"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          }
          title="Crear sala nueva"
          description="Invita a tus compañeros ahora"
        />
        <ActionCard
          onClick={() => show("info", "Disponible en Sprint 1")}
          color="amber"
          icon={
            <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8">
              <path
                d="M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="M9 10l-6 6 2 2 2-2 1 1 2-2 2 2"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          }
          title="Unirme a sala"
          description="Ingresa un código"
        />
        <ActionCard
          onClick={() => show("info", "Disponible en Sprint 1")}
          color="green"
          icon={
            <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8">
              <rect x="3" y="4" width="7" height="7" rx="1" fill="#22c55e" />
              <rect x="14" y="4" width="7" height="7" rx="1" fill="#a855f7" />
              <rect x="3" y="14" width="7" height="7" rx="1" fill="#3b82f6" />
              <rect x="14" y="14" width="7" height="7" rx="1" fill="#fb923c" />
            </svg>
          }
          title="Salas públicas"
          description="Explora temas del momento"
        />
      </div>

      {/* Salas recientes */}
      <section aria-labelledby="recientes-title">
        <h2 id="recientes-title" className="mb-4 text-xl font-bold text-slate-900">
          Salas recientes
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sampleRooms.map((room) => {
            const badge = statusBadge[room.status];
            return (
              <article
                key={room.id}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-base font-semibold text-slate-900">
                    {room.title}
                  </h3>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.color}`}
                  >
                    {badge.label}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-600">{room.category}</p>
                <div className="mt-4 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                      <path
                        d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6 0a4 4 0 100-8 4 4 0 000 8z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    {room.members} conectados
                  </span>
                  <Button
                    size="sm"
                    onClick={() => show("info", "El acceso a salas se habilita en Sprint 1")}
                  >
                    Unirme
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          (Salas de ejemplo. El CRUD real de salas llega en Sprint 1.)
        </p>
      </section>

      <Modal
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        title="Crear sala nueva"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleCreateRoom();
          }}
          className="flex flex-col gap-4"
        >
          <Input
            label="Nombre de la sala"
            placeholder="Ej. Cálculo III - Repaso parcial"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            required
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpenCreate(false)}>
              Cancelar
            </Button>
            <Button type="submit">Crear</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

interface ActionCardProps {
  onClick: () => void;
  color: "brand" | "amber" | "green";
  icon: ReactNode;
  title: string;
  description: string;
}

function ActionCard({ onClick, color, icon, title, description }: ActionCardProps) {
  const colorMap = {
    brand: "text-brand-600",
    amber: "text-amber-500",
    green: "text-green-600",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-start gap-3 rounded-xl border border-slate-200 bg-white p-6 text-left shadow-sm transition-all hover:border-brand-300 hover:shadow-md focus-visible:ring-brand-600 focus-visible:ring-offset-2"
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

