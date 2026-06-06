/**
 * @file RoomLayout — Shell oscuro de pantalla completa para `/room/:id`.
 *
 * Lo único que aporta este layout es:
 *  - Fondo oscuro (`bg-slate-900`) con texto claro por defecto.
 *  - `h-screen` + `overflow-hidden` + `flex flex-col` para que la sala ocupe
 *    EXACTAMENTE la ventana y el `RoomPage` reparta esa altura entre header,
 *    grid de video y panel de chat (que hace scroll interno, no la página).
 *
 * Decidimos sacar el header de la sala del layout y meterlo dentro de
 * `RoomPage` para que tenga acceso directo al estado de conexión del
 * socket (badge "Conectado / Reconectando / …") sin pasar por contexto.
 */

import { Outlet } from "react-router-dom";

export default function RoomLayout() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-900 text-slate-100">
      <Outlet />
    </div>
  );
}
