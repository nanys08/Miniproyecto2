/**
 * @file RoomLayout — Shell oscuro de pantalla completa para `/room/:id`.
 *
 * Lo único que aporta este layout es:
 *  - Fondo oscuro (`bg-slate-900`) con texto claro por defecto.
 *  - `min-h-screen` y `flex flex-col` para que el `RoomPage` controle el
 *    resto de la maqueta (header, grid de video, panel de chat).
 *
 * Decidimos sacar el header de la sala del layout y meterlo dentro de
 * `RoomPage` para que tenga acceso directo al estado de conexión del
 * socket (badge "Conectado / Reconectando / …") sin pasar por contexto.
 */

import { Outlet } from "react-router-dom";

export default function RoomLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-900 text-slate-100">
      <Outlet />
    </div>
  );
}
