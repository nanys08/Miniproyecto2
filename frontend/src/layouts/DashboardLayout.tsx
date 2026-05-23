import { useEffect, useId, useState, type ReactNode } from "react";
import { Outlet, NavLink, useLocation } from "react-router-dom";
import { cn } from "@/utils/cn";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import Logo from "@/components/Logo";
import Avatar from "@/components/Avatar";
import Button from "@/components/Button";

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
}

const navItems: NavItem[] = [
  {
    to: "/dashboard",
    label: "Inicio",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
        <path d="M3 12l9-9 9 9M5 10v10h14V10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    to: "/dashboard?action=create",
    label: "Crear sala nueva",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
        <path d="M12 5v14m-7-7h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    to: "/dashboard?tab=buscar",
    label: "Buscar salas",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2"/>
        <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    to: "/dashboard?tab=mis",
    label: "Mis salas",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
        <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="2"/>
        <path d="M3 9h18" stroke="currentColor" strokeWidth="2"/>
      </svg>
    ),
  },
  {
    to: "/dashboard?tab=comunidad",
    label: "Comunidad",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
        <path d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6 0a4 4 0 100-8 4 4 0 000 8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
];

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const { show } = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const location = useLocation();

  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [menuOpen]);

  async function handleLogout() {
    try {
      await logout();
      show("info", "Sesión cerrada");
    } catch {
      show("error", "No se pudo cerrar la sesión");
    }
  }

  const displayName = user?.email?.split("@")[0] ?? "Usuario";

  const SidebarContent = (
    <div className="flex h-full flex-col">
      <div className="px-6 py-5">
        <Logo size="md" />
      </div>

      <nav aria-label="Navegación principal" className="flex-1 px-3">
        <ul className="flex flex-col gap-1">
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === "/dashboard"}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    "focus-visible:ring-brand-600",
                    isActive ? "bg-brand-50 text-brand-700" : "text-slate-700 hover:bg-slate-100"
                  )
                }
              >
                {item.icon}
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="border-t border-slate-200 p-4">
        <NavLink
          to="/profile"
          className="flex items-center gap-3 rounded-md p-2 hover:bg-slate-100 focus-visible:ring-brand-600"
        >
          {user?.avatar ? (
            <img
              src={user.avatar}
              alt={displayName}
              className="h-9 w-9 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <Avatar name={displayName} email={user?.email} size="md" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{displayName}</p>
            <p className="text-xs text-slate-500">Estudiante</p>
          </div>
        </NavLink>
        <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => void handleLogout()}>
          Cerrar sesión
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <aside aria-label="Menú lateral" className="fixed inset-y-0 left-0 hidden w-64 border-r border-slate-200 bg-white md:block">
        {SidebarContent}
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
        <Logo size="sm" />
        <button
          type="button"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
          onClick={() => setMenuOpen((o) => !o)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 focus-visible:ring-brand-600"
        >
          <span aria-hidden="true" className="text-2xl leading-none">{menuOpen ? "×" : "☰"}</span>
        </button>
      </header>

      {menuOpen && (
        <div id={menuId} className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true">
          <button type="button" aria-label="Cerrar menú" tabIndex={-1} onClick={() => setMenuOpen(false)}
            className="absolute inset-0 bg-slate-900/40 cursor-default"/>
          <aside className="relative h-full w-64 border-r border-slate-200 bg-white shadow-xl">
            {SidebarContent}
          </aside>
        </div>
      )}

      <div className="md:pl-64">
        <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}