import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import Logo from "@/components/Logo";

// Imágenes de Unsplash que rotan cada 6 segundos
const HERO_IMAGES = [
  "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800&q=80", // estudiantes colaborando
  "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&q=80", // laptop estudio
  "https://images.unsplash.com/photo-1513258496099-48168024aec0?w=800&q=80", // biblioteca
  "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=800&q=80", // estudiando
  "https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=800&q=80", // grupo estudio
];

export default function HomePage() {
  const [imgIndex, setImgIndex] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setImgIndex((i) => (i + 1) % HERO_IMAGES.length);
        setFade(true);
      }, 400);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Navbar */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Logo size="md" />
          <nav aria-label="Acceso" className="flex items-center gap-3">
            <Link
              to="/login"
              className="rounded-lg border border-slate-300 px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Iniciar sesión
            </Link>
            <Link
              to="/register"
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              Registrarse
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-16 md:grid-cols-2 md:py-24"
      >
        {/* Texto izquierda */}
        <div>
          <h1 className="text-5xl font-bold leading-tight text-slate-900 sm:text-6xl">
            Salas de estudio
            <br />
            colaborativas
            <br />
            en tiempo real
          </h1>
          <p className="mt-6 max-w-md text-lg text-slate-500">
            Estudia con tus compañeros, comparte pantalla, chat y
            videollamada todo en un solo lugar.
          </p>
          <div className="mt-10 flex items-center gap-4">
            <Link
              to="/login"
              className="rounded-xl border border-slate-300 px-8 py-4 text-base font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Iniciar sesión
            </Link>
            <Link
              to="/register"
              className="rounded-xl bg-blue-600 px-8 py-4 text-base font-semibold text-white hover:bg-blue-700 transition-colors"
            >
              Registrarse
            </Link>
          </div>
        </div>

        {/* Imagen derecha con fade */}
        <div
          aria-hidden="true"
          className="relative hidden md:block"
        >
          <div className="overflow-hidden rounded-3xl bg-white shadow-xl">
            <img
              key={imgIndex}
              src={HERO_IMAGES[imgIndex]}
              alt=""
              className="h-96 w-full object-cover transition-opacity duration-400"
              style={{ opacity: fade ? 1 : 0, transition: "opacity 0.4s ease" }}
            />
          </div>
          {/* Indicadores de imagen */}
          <div className="mt-3 flex justify-center gap-1.5">
            {HERO_IMAGES.map((_, i) => (
              <button
                key={i}
                onClick={() => { setFade(false); setTimeout(() => { setImgIndex(i); setFade(true); }, 400); }}
                className={`h-1.5 rounded-full transition-all ${
                  i === imgIndex ? "w-6 bg-blue-600" : "w-1.5 bg-slate-300"
                }`}
                aria-label={`Imagen ${i + 1}`}
              />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}