import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import Input from "@/components/Input";
import Button from "@/components/Button";
import GoogleButton from "@/components/GoogleButton";
import Logo from "@/components/Logo";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";

export default function LoginPage() {
  const { login, loginWithGoogle } = useAuth();
  const { show } = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showRegisterLink, setShowRegisterLink] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!email.trim() || !password.trim()) {
      setError("Completa todos los campos");
      setLoading(false);
      return;
    }

    try {
      await login(email, password);
      show("success", "Sesión iniciada");
      navigate("/dashboard", { replace: true });
    } catch {
      setError("Correo o contraseña incorrectos");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    setShowRegisterLink(false);
    setGoogleLoading(true);
    try {
      await loginWithGoogle();
      show("success", "Sesión iniciada con Google");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      if (err instanceof Error && err.message === "needs-username") {
        setError("Esta cuenta de Google no está registrada.");
        setShowRegisterLink(true);
      } else {
        setError("No se pudo iniciar sesión con Google");
      }
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <div className="rounded-2xl bg-white p-8 shadow-sm">
      <div className="flex flex-col items-center gap-2">
        <Logo size="lg" showText={false} />
        <span className="mt-1 text-2xl font-bold text-slate-900">EstudioColab</span>
      </div>

      <div className="mt-6 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Bienvenido de nuevo</h1>
        <p className="mt-1 text-sm text-slate-600">Inicia sesión para unirte a tus salas</p>
      </div>

      <div className="mt-6">
        <GoogleButton
          type="button"
          onClick={handleGoogle}
          isLoading={googleLoading}
          className="w-full !bg-white !border !border-slate-300 !text-slate-900 hover:!bg-slate-50"
        />
      </div>

      <div className="my-5 flex items-center gap-3" aria-hidden="true">
        <div className="h-px flex-1 bg-slate-200" />
        <span className="text-xs text-slate-500">o</span>
        <div className="h-px flex-1 bg-slate-200" />
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <Input
          label="Correo electrónico"
          type="email"
          placeholder="tu@email.com"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => { setEmail(e.target.value); setError(null); }}
          error={error !== null && !email.trim() ? " " : undefined}
        />
        <Input
          label="Contraseña"
          type="password"
          placeholder="••••••••"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(null); }}
          error={error !== null && !password.trim() ? " " : undefined}
        />

        <div className="-mt-2 text-right">
          <Link to="/login" className="text-sm font-medium text-brand-700 hover:text-brand-900 hover:underline">
            ¿Olvidaste tu contraseña?
          </Link>
        </div>

        {error && (
          <div role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
            <p>{error}</p>
            {showRegisterLink && (
              <Link to="/register" className="mt-1 block font-semibold text-blue-600 hover:underline">
                Ir a registrarse →
              </Link>
            )}
          </div>
        )}

        <Button type="submit" isLoading={loading} className="mt-1 w-full">
          Iniciar sesión
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-slate-600">
        ¿No tienes cuenta?{" "}
        <Link to="/register" className="font-medium text-brand-700 hover:text-brand-900 hover:underline">
          Regístrate gratis
        </Link>
      </p>
    </div>
  );
}