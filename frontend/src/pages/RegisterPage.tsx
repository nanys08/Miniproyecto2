import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import Card from "@/components/Card";
import Input from "@/components/Input";
import Button from "@/components/Button";
import GoogleButton from "@/components/GoogleButton";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import { api } from "@/services/api";

export default function RegisterPage() {
  const { register, loginWithGoogle, demoMode } = useAuth();
  const { show } = useToast();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
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
      if (!demoMode) {
        // Verifica disponibilidad de username contra el backend (solo si Firebase real)
        const { available } = await api.get<{ available: boolean }>(
          `/auth/check-username/${encodeURIComponent(username)}`
        );
        if (!available) {
          throw new Error("Ese nombre de usuario ya está en uso");
        }
      }
      await register(email, password, username);
      show("success", "Cuenta creada correctamente");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo crear la cuenta"
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
      show("success", "Cuenta creada con Google");
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
    <Card title="Crear cuenta" headingLevel={2}>
      {demoMode && (
        <p
          role="status"
          className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          Modo demo: la cuenta se guarda solo en este navegador.
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <Input
          label="Nombre de usuario"
          autoComplete="username"
          required
          hint="Debe ser único y será visible en las salas"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
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
          autoComplete="new-password"
          required
          hint="Mínimo 6 caracteres"
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
          Crear cuenta
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
        ¿Ya tienes cuenta?{" "}
        <Link
          to="/login"
          className="font-medium text-brand-700 underline underline-offset-2 hover:text-brand-900"
        >
          Inicia sesión
        </Link>
      </p>
    </Card>
  );
}
