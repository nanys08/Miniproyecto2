import { useState } from "react";
import Card from "@/components/Card";
import Button from "@/components/Button";
import Modal from "@/components/Modal";
import Input from "@/components/Input";

// Sprint 0: estructura visual. La gestión real de salas (CRUD + unirse)
// se implementa en Sprints siguientes.
export default function DashboardPage() {
  const [openCreate, setOpenCreate] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Mis salas</h1>
        <Button onClick={() => setOpenCreate(true)}>
          Crear sala nueva
        </Button>
      </div>

      <Card title="Aún no tienes salas" headingLevel={2}>
        <p className="text-slate-700">
          Crea una sala para invitar a tus compañeros y empezar a estudiar
          juntos.
        </p>
      </Card>

      <Modal
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        title="Crear sala"
      >
        <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
          <Input label="Nombre de la sala" required />
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
