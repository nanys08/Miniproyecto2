// Skip link — WCAG 2.4.1 Bypass Blocks
// Permite a usuarios de teclado/lector saltar la navegación e ir al contenido.
export default function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only-focusable focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-brand-600 focus:text-white focus:px-4 focus:py-2 focus:rounded-md focus:font-medium"
    >
      Saltar al contenido principal
    </a>
  );
}
