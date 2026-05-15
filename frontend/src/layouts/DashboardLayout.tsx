import { useEffect, useId, useState } from "react";
import { Outlet, NavLink, useLocation } from "react-router-dom";
import { cn } from "@/utils/cn";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import Button from "@/components/Button";

// Layout para vistas autenticadas: dashboard y perfil.
// Header con navegación principal; en mobile colapsa en un menú hamburguesa.
export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const { show } = useToast();

  async function handleLogout() {
    try {
      await logout();
      show("info", "Sesión cerrada");
    } catch {
      show("error", "No se pudo cerrar la sesión");
    }
  }
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const location = useLocation();

  // Cierra el menú al navegar entre rutas
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Cierra el menú con Escape
  useEffect(() => {
    if (!menuOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [menuOpen]);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "rounded-md px-3 py-2 text-sm font-medium transition-colors",
      "focus-visible:ring-brand-600",
      isActive
        ? "bg-brand-50 text-brand-700"
        : "text-slate-700 hover:bg-slate-100"
    );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <p className="text-base font-semibold text-brand-700">
            Salón de Estudio
          </p>

          {/* Navegación desktop */}
          <nav aria-label="Navegación principal" className="hidden md:block">
            <ul className="flex items-center gap-1">
              <li>
                <NavLink to="/dashboard" className={linkClass}>
                  Salas
                </NavLink>
              </li>
              <li>
                <NavLink to="/profile" className={linkClass}>
                  Perfil
                </NavLink>
              </li>
            </ul>
          </nav>

          {/* Controles desktop */}
          <div className="hidden items-center gap-3 md:flex">
            <span className="text-sm text-slate-600">{user?.email ?? ""}</span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleLogout()}
            >
              Cerrar sesión
            </Button>
          </div>

          {/* Hamburguesa mobile */}
          <button
            type="button"
            className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 focus-visible:ring-brand-600"
            aria-expanded={menuOpen}
            aria-controls={menuId}
            aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <span aria-hidden="true" className="text-2xl leading-none">
              {menuOpen ? "×" : "☰"}
            </span>
          </button>
        </div>

        {/* Menú desplegable mobile */}
        {menuOpen && (
          <nav
            id={menuId}
            aria-label="Navegación principal"
            className="border-t border-slate-200 bg-white md:hidden"
          >
            <ul className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3">
              <li>
                <NavLink to="/dashboard" className={linkClass}>
                  Salas
                </NavLink>
              </li>
              <li>
                <NavLink to="/profile" className={linkClass}>
                  Perfil
                </NavLink>
              </li>
              <li className="mt-2 border-t border-slate-200 pt-3">
                <p className="px-3 text-xs text-slate-500">
                  {user?.email ?? ""}
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-2 w-full"
                  onClick={() => void handleLogout()}
                >
                  Cerrar sesión
                </Button>
              </li>
            </ul>
          </nav>
        )}
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl flex-1 px-4 py-6"
      >
        <Outlet />
      </main>
    </div>
  );
}
