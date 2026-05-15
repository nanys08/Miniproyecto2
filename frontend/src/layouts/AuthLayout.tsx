import { Outlet } from "react-router-dom";

// Layout simple centrado para /login y /register.
// Usa <main id="main-content"> como destino del SkipLink.
export default function AuthLayout() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="px-4 py-4">
        <p className="text-sm font-semibold text-brand-700">
          Salón de Estudio Colaborativo
        </p>
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className="flex flex-1 items-center justify-center px-4 pb-12"
      >
        <div className="w-full max-w-md">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
