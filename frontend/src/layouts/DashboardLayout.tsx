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
  end?: boolean;
}

const navItems: NavItem[] = [
  {
    to: "/dashboard",
    label: "Inicio",
    end: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
        <path d="M3 12l9-9 9 9M5 10v10h14V10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    to: "/dashboard?action=create",
    label: "Crear sala",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
        <path d="M12 5v14m-7-7h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: "/dashboard?action=join",
    label: "Buscar salas",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
        <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: "/mis-salas",
    label: "Mis salas",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
        <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
        <path d="M3 9h18" stroke="currentColor" strokeWidth="2" />
      </svg>
    ),
  },
];

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600",
    isActive
      ? "bg-brand-50 font-semibold text-brand-700"
      : "text-slate-600 hover:bg-slate-200/60 hover:text-slate-900"
  );

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const { show } = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const location = useLocation();

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname, location.search]);

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

  const displayName =
    user?.username ?? user?.displayName ?? user?.email?.split("@")[0] ?? "Usuario";

  // ── Contenido del sidebar (reutilizado en desktop y en el drawer móvil) ──
  const SidebarContent = (
    <div className="flex h-full flex-col">
      <nav aria-label="Menú principal" className="flex-1 px-3 py-4">
        <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Menú
        </p>
        <ul className="flex flex-col gap-1">
          {navItems.map((item) => (
            <li key={item.label}>
              <NavLink to={item.to} end={item.end} className={navLinkClass}>
                <span aria-hidden="true">{item.icon}</span>
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="border-t border-slate-200 p-3">
        <NavLink
          to="/profile"
          className="flex items-center gap-3 rounded-md p-2 hover:bg-slate-200/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
        >
          {user?.avatar ? (
            <img
              src={user.avatar}
              alt=""
              aria-hidden="true"
              className="h-9 w-9 shrink-0 rounded-full object-cover"
            />
          ) : (
            <Avatar name={displayName} email={user?.email} size="md" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{displayName}</p>
            <p className="text-xs text-slate-500">Estudiante</p>
          </div>
        </NavLink>
        <Button variant="ghost" size="sm" className="mt-2 w-full justify-start text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => void handleLogout()}>
          Cerrar sesión
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      {/* ── Header navy full-width (alta fidelidad) ───────────────────── */}
      <header className="sticky top-0 z-40 bg-navy text-white">
        <div className="flex h-14 items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-expanded={menuOpen}
              aria-controls={menuId}
              aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
              onClick={() => setMenuOpen((o) => !o)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-white/90 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white md:hidden"
            >
              <span aria-hidden="true" className="text-xl leading-none">
                {menuOpen ? "×" : "☰"}
              </span>
            </button>
            <Logo size="sm" textClassName="text-white" />
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <NavLink
              to="/profile"
              className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 text-sm text-white/90 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <Avatar name={displayName} email={user?.email} size="sm" />
              <span className="hidden font-medium sm:inline">@{displayName}</span>
            </NavLink>
          </div>
        </div>
      </header>

      {/* ── Cuerpo: sidebar + contenido ───────────────────────────────── */}
      <div className="flex flex-1">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-64 shrink-0 border-r border-slate-200 bg-surface md:block">
          {SidebarContent}
        </aside>

        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 md:px-8 md:py-8"
        >
          <Outlet />
        </main>
      </div>

      {/* ── Drawer móvil ──────────────────────────────────────────────── */}
      {menuOpen && (
        <div id={menuId} className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menú">
          <button
            type="button"
            aria-label="Cerrar menú"
            tabIndex={-1}
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 cursor-default bg-slate-900/40"
          />
          <aside className="relative h-full w-64 border-r border-slate-200 bg-surface shadow-xl">
            {SidebarContent}
          </aside>
        </div>
      )}
    </div>
  );
}
