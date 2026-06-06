/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Paleta con contraste AA mínimo sobre fondos claros (design system)
        brand: {
          50: "#eff6ff",
          100: "#dbeafe",
          500: "#2563eb",
          600: "#1d4ed8",
          700: "#1e40af",
          900: "#1e3a8a",
        },
        // Primario de navegación / header (alta fidelidad)
        navy: {
          DEFAULT: "#1e3a5f",
          900: "#1e3a5f",
          800: "#284b76",
        },
        // Fondos de superficie del design system
        surface: "#f9fafb", // sidenav y listas
        canvas: "#fafbfc", // área de contenido
      },
      fontFamily: {
        sans: [
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      // Aros de foco visibles — WCAG 2.4.7 Focus Visible
      ringWidth: {
        DEFAULT: "3px",
      },
    },
  },
  plugins: [],
};
