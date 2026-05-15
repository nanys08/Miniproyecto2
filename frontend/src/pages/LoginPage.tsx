import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import Card from "@/components/Card";
import Input from "@/components/Input";
import Button from "@/components/Button";
import GoogleButton from "@/components/GoogleButton";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";

export default function LoginPage() {
  const { login, loginWithGoogle, demoMode } = useAuth();
  const { show } = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      show("success", "Sesión iniciada");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo iniciar sesión"
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    setGoogleLoading(true);
    try {
      await loginWithGoogle();
      show("success", "Sesión iniciada con Google");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo iniciar sesión con Google"
      );
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <Card title="Iniciar sesión" headingLevel={2}>
      {demoMode && (
        <p
          role="status"
          className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          Modo demo: cualquier credencial es aceptada. Configura Firebase en{" "}
          <code>frontend/.env</code> para autenticación real.
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <Input
          label="Correo electrónico"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          label="Contraseña"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && (
          <p
            role="alert"
            className="rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-800"
          >
            {error}
          </p>
        )}

        <Button type="submit" isLoading={loading}>
          Entrar
        </Button>
      </form>

      <div className="my-4 flex items-center gap-3" aria-hidden="true">
        <div className="h-px flex-1 bg-slate-200" />
        <span className="text-xs uppercase text-slate-500">o</span>
        <div className="h-px flex-1 bg-slate-200" />
      </div>

      <GoogleButton
        type="button"
        onClick={handleGoogle}
        isLoading={googleLoading}
        className="w-full"
      />

      <p className="mt-4 text-sm text-slate-600">
        ¿No tienes cuenta?{" "}
        <Link
          to="/register"
          className="font-medium text-brand-700 underline underline-offset-2 hover:text-brand-900"
        >
          Regístrate
        </Link>
      </p>
    </Card>
  );
}
