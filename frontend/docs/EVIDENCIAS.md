# Evidencias visuales — UI y Responsive

Plantilla para el **Documento Único de Evidencias** del frontend. Las capturas
de pantalla **deben generarse ejecutando la aplicación** (ver §1) y guardarse en
`frontend/docs/img/`; luego se enlazan en las tablas de §2 (UI) y §3 (responsive).

> Las imágenes no se pueden generar automáticamente desde el código: requieren la
> app corriendo con Firebase configurado y los dos backends activos. Aquí queda
> la guía exacta de **qué** capturar y **dónde** pegarlo.

---

## 1. Cómo levantar la app para capturar

```bash
# Backend principal (room-service)
cd backend && npm install && npm run dev          # http://localhost:3000

# Backend de tiempo real (chat-service)
cd chat-service && npm install && npm run dev      # http://localhost:8081

# Frontend
cd frontend && npm install
cp .env.example .env        # completar credenciales VITE_FIREBASE_* + URLs
npm run dev                 # http://localhost:5173
```

Inicia sesión y crea/entra a una sala para reproducir cada pantalla.

**Captura por DevTools (responsive):** abre las herramientas de desarrollo
(`F12`) → *Toggle device toolbar* (`Ctrl+Shift+M`) y elige el tamaño indicado en
§3.

---

## 2. Evidencias de UI (Tarea 4)

Guarda cada captura en `frontend/docs/img/` con el nombre sugerido y verifica que
muestre lo descrito.

### 2.1 Dashboard
Debe mostrar: header navy con logo + avatar + "+ Crear sala", sidebar "MENÚ",
tarjetas "Crear sala" / "Unirme a sala" (destacada) y "Salas recientes" con badge
de estado.

![Dashboard](img/dashboard.png)

### 2.2 Sala
Debe mostrar: encabezado de sala (nombre, estado de conexión, código, ⚙ si eres
anfitrión), cuadrícula de participantes, barra de "Conectados" y panel de chat.

![Sala](img/sala.png)

### 2.3 Chat
Debe mostrar: burbujas enviadas (azul, derecha) y recibidas (gris, con nombre),
caja de mensaje con contador, y algún estado (enviando / reconectando).

![Chat](img/chat.png)

### 2.4 Historial
Debe mostrar: mensajes en orden cronológico con **separadores de fecha** y hora;
opcionalmente el estado **vacío** ("Aún no hay mensajes…") o **error**
("No fue posible cargar el historial" + Reintentar).

![Historial](img/historial.png)

| Pantalla | Archivo | ✔ |
|---|---|---|
| Dashboard | `img/dashboard.png` | ☐ |
| Sala | `img/sala.png` | ☐ |
| Chat | `img/chat.png` | ☐ |
| Historial | `img/historial.png` | ☐ |

---

## 3. Evidencias de Responsive (Tarea 5)

Captura la **misma pantalla** (recomendado: Dashboard y Sala) en tres anchos.
Breakpoints del proyecto (Tailwind): `md` = 768px.

| Dispositivo | Ancho sugerido | Qué debe verse |
|---|---|---|
| **Desktop** | ≥ 1280px | Sidebar fijo a la izquierda + contenido en 2 columnas. |
| **Tablet** | 768–1024px | Sidebar visible, grids que se reacomodan a 1–2 columnas. |
| **Mobile** | 375–414px | Sidebar oculto → **menú hamburguesa**; columnas apiladas. |

### 3.1 Desktop
![Desktop](img/responsive-desktop.png)

### 3.2 Tablet
![Tablet](img/responsive-tablet.png)

### 3.3 Mobile
![Mobile](img/responsive-mobile.png)

| Vista | Archivo | ✔ |
|---|---|---|
| Desktop | `img/responsive-desktop.png` | ☐ |
| Tablet | `img/responsive-tablet.png` | ☐ |
| Mobile | `img/responsive-mobile.png` | ☐ |

---

## 4. Comportamiento responsive implementado (referencia)

- **Header navy:** full-width en todos los tamaños; en móvil incluye el botón
  hamburguesa.
- **Sidebar:** fijo (`md:block`) en desktop/tablet; en móvil se abre como
  *drawer* superpuesto y se cierra con Esc o tocando fuera.
- **Dashboard:** tarjetas de acción y lista de salas en grid `sm:grid-cols-2`
  que colapsa a 1 columna en móvil.
- **Sala:** layout `lg:grid-cols-[1fr_360px]` (video + chat) que se apila en
  pantallas pequeñas.
- **Chat:** el panel ocupa el ancho disponible y el historial tiene scroll
  interno independiente.
