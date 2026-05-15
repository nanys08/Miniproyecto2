import Card from "@/components/Card";
import { useAuth } from "@/hooks/useAuth";

// Sprint 0: vista de perfil de solo lectura. Edición/eliminación llega en Sprint 1.
export default function ProfilePage() {
  const { user } = useAuth();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-slate-900">Mi perfil</h1>

      <Card title="Datos de la cuenta" headingLevel={2}>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr]">
          <dt className="text-sm font-medium text-slate-600">UID</dt>
          <dd className="text-sm text-slate-900 break-all">
            {user?.uid ?? "—"}
          </dd>

          <dt className="text-sm font-medium text-slate-600">Email</dt>
          <dd className="text-sm text-slate-900">{user?.email ?? "—"}</dd>
        </dl>
      </Card>
    </div>
  );
}
