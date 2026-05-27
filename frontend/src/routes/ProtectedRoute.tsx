import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import Loader from "@/components/Loader";

// Rutas protegidas — redirige a /login si no hay sesión activa.
// Si el usuario está autenticado en Firebase pero no tiene perfil (sin username),
// lo redirige a /register para que complete el registro.
// Mientras se hidrata el estado de Firebase Auth muestra un loader
// con feedback accesible para lectores de pantalla.
export default function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <Loader label="Verificando sesión" fullscreen />;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Usuario autenticado en Firebase pero sin perfil en Firestore
  // (primer login con Google antes de completar el registro)
  if (!user.username) {
    return <Navigate to="/register" replace />;
  }

  return <Outlet />;
}
