import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import Input from "@/components/Input";
import Button from "@/components/Button";
import Checkbox from "@/components/Checkbox";
import GoogleButton from "@/components/GoogleButton";
import Logo from "@/components/Logo";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";

export default function RegisterPage() {
  const { register, loginWithGoogle, demoMode } = useAuth();
  const { show } = useToast();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!acceptedTerms) {
      setError("Debes aceptar los términos de servicio para continuar");
      return;
    }
    setLoading(true);
    try {
      // El backend usa "username" como handle único; mandamos el nombre completo.
      await register(email, password, fullName);
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
    <div className="rounded-2xl bg-white p-8 shadow-sm">
      <div className="flex flex-col items-center gap-2">
        <Logo size="lg" showText={false} />
        <span className="mt-1 text-2xl font-bold text-slate-900">
          EstudioColab
        </span>
      </div>

      <div className="mt-6 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Crea tu cuenta</h1>
        <p className="mt-1 text-sm text-slate-600">
          Únete y empieza a estudiar en equipo
        </p>
      </div>

      {demoMode && (
        <p
          role="status"
          className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          Modo demo: la cuenta se guarda solo en este navegador.
        </p>
      )}

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
          label="Nombre completo"
          placeholder="Juan Pérez"
          autoComplete="name"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
        <Input
          label="Correo electrónico"
          type="email"
          placeholder="tu@email.com"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          label="Contraseña"
          type="password"
          placeholder="Mínimo 6 caracteres"
          autoComplete="new-password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <Checkbox
          checked={acceptedTerms}
          onChange={(e) => setAcceptedTerms(e.target.checked)}
          label={
            <>
              Acepto los{" "}
              <span className="font-medium text-brand-700 underline">
                Términos de servicio
              </span>{" "}
              y la{" "}
              <span className="font-medium text-brand-700 underline">
                Política de privacidad
              </span>
            </>
          }
        />

        {error && (
          <p
            role="alert"
            className="rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-800"
          >
            {error}
          </p>
        )}

        <Button type="submit" isLoading={loading} className="mt-1 w-full">
          Crear cuenta
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-slate-600">
        ¿Ya tienes cuenta?{" "}
        <Link
          to="/login"
          className="font-medium text-brand-700 hover:text-brand-900 hover:underline"
        >
          Inicia sesión
        </Link>
      </p>
    </div>
  );
}
