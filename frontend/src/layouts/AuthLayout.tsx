import { Outlet } from "react-router-dom";

// Layout para /login y /register. Card centrada con fondo claro.
export default function AuthLayout() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <main
        id="main-content"
        tabIndex={-1}
        className="flex flex-1 items-center justify-center px-4 py-8"
      >
        <div className="w-full max-w-md">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
