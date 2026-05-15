import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4 text-center"
    >
      <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">
        Error 404
      </p>
      <h1 className="mt-2 text-3xl font-bold text-slate-900">
        Página no encontrada
      </h1>
      <p className="mt-2 max-w-md text-slate-700">
        La ruta a la que intentas acceder no existe o fue movida.
      </p>
      <Link
        to="/dashboard"
        className="mt-6 rounded-md bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700 focus-visible:ring-brand-600 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50"
      >
        Volver al inicio
      </Link>
    </main>
  );
}
