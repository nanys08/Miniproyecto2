import { Link } from "react-router-dom";
import Logo from "@/components/Logo";

// Landing page pública. Hero con dos CTAs hacia login/register.
export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <header className="border-b border-slate-200 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Logo size="md" />
          <nav aria-label="Acceso" className="flex items-center gap-2">
            <Link
              to="/login"
              className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:ring-brand-600"
            >
              Iniciar sesión
            </Link>
            <Link
              to="/register"
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
            >
              Registrarse
            </Link>
          </nav>
        </div>
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-12 md:grid-cols-2 md:py-20"
      >
        <div>
          <h1 className="text-4xl font-bold leading-tight text-slate-900 sm:text-5xl">
            Salas de estudio
            <br />
            colaborativas
            <br />
            <span className="text-brand-600">en tiempo real</span>
          </h1>
          <p className="mt-6 max-w-md text-lg text-slate-600">
            Estudia con tus compañeros, comparte pantalla, chat y
            videollamada todo en un solo lugar.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/login"
              className="rounded-lg bg-brand-600 px-6 py-3 text-base font-medium text-white shadow-sm hover:bg-brand-700 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
            >
              Iniciar sesión
            </Link>
            <Link
              to="/register"
              className="rounded-lg border border-brand-600 bg-white px-6 py-3 text-base font-medium text-brand-700 hover:bg-brand-50 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
            >
              Registrarse
            </Link>
          </div>
        </div>

        {/* Ilustración decorativa */}
        <div
          aria-hidden="true"
          className="relative hidden h-80 items-center justify-center md:flex"
        >
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-blue-100 via-purple-100 to-pink-100" />
          <div className="relative grid grid-cols-2 gap-4 p-8">
            <div className="flex h-32 w-32 items-center justify-center rounded-2xl bg-white shadow-lg">
              <svg viewBox="0 0 24 24" fill="none" className="h-12 w-12 text-brand-600">
                <path
                  d="M15 10l4.5-2.5v9L15 14M4 6h11v12H4z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div className="flex h-32 w-32 items-center justify-center rounded-2xl bg-white shadow-lg">
              <svg viewBox="0 0 24 24" fill="none" className="h-12 w-12 text-purple-500">
                <path
                  d="M8 12h8M8 8h8m-9 8.5L4 20V5a1 1 0 011-1h14a1 1 0 011 1v11a1 1 0 01-1 1H7z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div className="flex h-32 w-32 items-center justify-center rounded-2xl bg-white shadow-lg">
              <svg viewBox="0 0 24 24" fill="none" className="h-12 w-12 text-pink-500">
                <path
                  d="M16 11V7a4 4 0 00-8 0v4m-2 0h12a1 1 0 011 1v8a1 1 0 01-1 1H6a1 1 0 01-1-1v-8a1 1 0 011-1z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <div className="flex h-32 w-32 items-center justify-center rounded-2xl bg-white shadow-lg">
              <svg viewBox="0 0 24 24" fill="none" className="h-12 w-12 text-orange-500">
                <path
                  d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6 0a4 4 0 100-8 4 4 0 000 8z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
