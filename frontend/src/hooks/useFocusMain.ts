import { useEffect } from "react";
import { useLocation } from "react-router-dom";

// Mueve el foco al <main id="main-content"> en cada cambio de ruta.
// Mejora la experiencia con lector de pantalla — el usuario "escucha" la nueva
// página en vez de quedarse leyendo desde el header.
// WCAG 2.4.3 Focus Order, 2.4.1 Bypass Blocks.
export function useFocusMain(): void {
  const { pathname } = useLocation();

  useEffect(() => {
    const main = document.getElementById("main-content");
    if (main) {
      main.focus({ preventScroll: false });
    }
  }, [pathname]);
}
