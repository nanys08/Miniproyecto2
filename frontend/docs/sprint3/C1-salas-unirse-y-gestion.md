# C1 — Pantallas funcionales de Salas (Unirse, gestión y ciclo de vida)

> **Objetivo:** convertir los diseños y endpoints en pantallas funcionales para
> unirse a una sala, conectarse al servicio de tiempo real, ver participantes,
> editar/eliminar salas (anfitrión) y manejar la eliminación de sala.
> Cubre **US-07 (Editar y Eliminar Salas)** y **US-08 (Unirse a Sala)**.

## Mapa de tareas → implementación

| Tarea | Implementación (archivo · símbolo) |
|---|---|
| **1** Pantalla Unirse a Sala (input + botón + mensajes) | `components/rooms/JoinRoomModal.tsx` |
| **2** Validaciones locales (vacío → botón off; "ABC" → "Código inválido") | `JoinRoomModal.tsx` (`canSubmit`, `ACCESS_CODE_RE`) |
| **3** Consumir `POST /rooms/join` (éxito → entrar; error → alerta) | `services/rooms.ts` (`joinRoom`) + `JoinRoomModal` |
| **4** Conectar WebSocket tras el join (`/ws/chat`, `{roomId, username}`) | `hooks/useRoomChat.ts` + `services/chatService.ts` |
| **5** Username duplicado → "Ya estás conectado" | `useRoomChat.ts` (`duplicateUsername`) + `pages/RoomPage.tsx` (banner) |
| **6** Mostrar participantes (`participants`) | `useRoomChat.ts` (`participants`) + `RoomPage.tsx` (barra "Conectados") |
| **7** Pantalla Editar Sala (⚙, solo anfitrión) | `RoomPage.tsx` (botón ⚙) + `components/rooms/RoomSettingsModal.tsx` |
| **8** Ocultar opciones a invitados | `RoomPage.tsx` (`isHost = room.ownerId === user.uid`) |
| **9** Evento `ROOM_DELETED` → salir + Dashboard + toast | `useRoomChat.ts` (`onRoomDeleted`) + `RoomPage.tsx` |

---

## Tarea 1-3 · Unirse a una sala

**Pantalla:** `JoinRoomModal` es un modal accesible (sobre `components/Modal.tsx`,
con focus-trap y cierre con Esc). Contiene:
- `input` de código (monospace, azul claro, centrado, `maxLength=6`),
- botón **"Validar y entrar →"**,
- zona de mensajes (`role="alert"`).

**Validación local (T2):**
```ts
const canSubmit = code.trim().length > 0 && status !== "loading"; // botón off si vacío
const ACCESS_CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
// en submit: si no cumple el formato → setError("Código inválido") sin llamar al backend
```

**Consumo del backend (T3):** `services/rooms.ts`
```ts
export async function joinRoom(code: string): Promise<Room> {
  const res = await api.post<{ room: Room }>("/rooms/join", { code });
  return res.room;
}
```
- **Éxito:** `onJoined(room)` → el Dashboard hace `navigate('/room/:roomId')`.
- **Error 404:** mensaje "El código ingresado no existe" (US-08 Esc2).
- **Error `ROOM_CODE_INVALID`:** "Código inválido".

> **Evidencia:** captura del modal + pestaña **Network** mostrando `POST /api/rooms/join`.

---

## Tarea 4 · Conectar WebSocket tras el join

Al entrar a `/room/:id`, el hook **`useRoomChat`** abre **una sola** conexión al
chat-service (Repositorio 2):

1. Llama `POST /api/rooms/:id/enter` (`services/rooms.ts` → `enterRoom`) para
   validar la sala y obtener un **ticket** firmado (en dev es `null`).
2. Conecta con `services/chatService.ts`:
   ```ts
   io(CHAT_URL, {
     path: "/ws/chat",
     auth: { roomId, username, uid, ticket },
   });
   ```
   El handshake envía `{ roomId, username }` (Tarea 4).

> **Evidencia:** **Consola del navegador** con `"[chat-service] conectado { roomId, username }"`.

---

## Tarea 5 · Username duplicado

En `useRoomChat`, el handshake puede fallar:
```ts
socket.on("connect_error", (err) => {
  if (err.message === "USERNAME_ALREADY_CONNECTED") {
    setDuplicateUsername(true); setStatus("error"); socket.disconnect();
  }
});
```
`RoomPage` muestra el banner **"Ya estás conectado…"** (`role="alert"`).

> Matiz: si es el **mismo usuario** (mismo `uid`) en otra pestaña, el servidor hace
> *reemplazo de sesión* (`session_replaced`) y la pestaña vieja muestra
> "Abriste esta sala en otra pestaña… [Reconectar aquí]".

---

## Tarea 6 · Mostrar participantes

El chat-service emite el evento `participants` al entrar/salir alguien:
```ts
socket.on("participants", ({ participants }) => setParticipants(participants));
```
`RoomPage` renderiza la barra **"Conectados: Juan · Ana · Carlos"** bajo el header.

> **Evidencia:** captura de la barra de conectados con dos o más usuarios.

---

## Tarea 7-8 · Editar sala (anfitrión) / ocultar a invitados

```ts
const isHost = !!user && !!room && room.ownerId === user.uid;
// El botón ⚙ Configuración solo se renderiza si isHost:
{isHost && <button onClick={() => setSettingsOpen(true)}>⚙ Configuración</button>}
```
- **Anfitrión:** ve ⚙ → abre `RoomSettingsModal` (menú → Editar / Copiar código /
  Ver participantes / Eliminar).
- **Invitado:** `isHost === false` → no se renderiza el ⚙ ni el modal (US-07 Esc3).

La edición/eliminación detallada (modales, type-to-confirm, descripción) se
documenta junto a US-07; el backend usa `PUT /api/rooms/:id` y `DELETE /api/rooms/:id`.

> **Evidencia:** captura del header con ⚙ (anfitrión) y otra **sin** ⚙ (invitado).

---

## Tarea 9 · Evento `ROOM_DELETED`

Cuando el anfitrión elimina la sala, el room-service avisa al chat-service, que
emite `room_closed` / `ROOM_DELETED` a todos los sockets de la sala:
```ts
const handleDeleted = () => onDeletedRef.current?.();
socket.on("room_closed", handleDeleted);
socket.on("ROOM_DELETED", handleDeleted);
```
`RoomPage` reacciona:
```ts
const handleRoomDeleted = useCallback(() => {
  show("info", "La sala fue eliminada");
  navigate("/dashboard");
}, [show, navigate]);
```
→ **sale de la sala, vuelve al Dashboard y muestra un toast** (Tarea 9).

---

## Archivos involucrados
- `components/rooms/JoinRoomModal.tsx`, `RoomSettingsModal.tsx`, `RoomCard.tsx`
- `pages/RoomPage.tsx`, `pages/DashboardPage.tsx`, `pages/MyRoomsPage.tsx`
- `hooks/useRoomChat.ts`
- `services/rooms.ts` (`joinRoom`, `enterRoom`, `updateRoom`, `deleteRoom`), `services/chatService.ts`
