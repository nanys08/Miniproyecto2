# C3 — Historial de chat (US-11)

> **Objetivo:** mostrar correctamente el historial de mensajes al entrar a una
> sala, con estados de carga/vacío/error, actualización en vivo, persistencia
> tras recargar y scroll al último mensaje.

## Mapa de tareas → implementación

| Tarea | Implementación (archivo · símbolo) |
|---|---|
| **1** Consumir `GET /rooms/{id}/messages` al entrar | `services/messages.ts` (`getRoomHistory`) + `useRoomChat.ts` (`loadHistory`) |
| **2** Renderizar historial | `ChatPanel.tsx` (`renderTimeline`) + `MessageBubble` |
| **3** Fecha y hora | `ChatPanel.tsx` (separadores de fecha) + `MessageBubble` (hora) |
| **4** Estado cargando ("Cargando historial…") | `useRoomChat.ts` (`historyStatus`) + `ChatPanel.tsx` (`HistoryLoading`) |
| **5** Estado vacío ("Aún no hay mensajes en esta sala") | `ChatPanel.tsx` (`EmptyHistory`) |
| **6** Estado error + Reintentar | `useRoomChat.ts` (`retryHistory`) + `ChatPanel.tsx` (`HistoryError`) |
| **7** Actualización automática por WebSocket | `useRoomChat.ts` (`receive_message` → `mergeMessages`) |
| **8** Persistencia tras F5 | `useRoomChat.ts` (carga al montar) |
| **9** Scroll inteligente al último mensaje | `ChatPanel.tsx` |

---

## Tarea 1 · Cargar el historial

Al montar el hook se llama al backend principal (Repositorio 1):
```ts
// services/messages.ts
export async function getRoomHistory(roomId, limit?) {
  const res = await api.get<{ messages: Message[] }>(`/rooms/${roomId}/messages?limit=…`);
  return res.messages; // orden cronológico (más antiguo → más nuevo)
}
```

## Tarea 4-6 · Estados de la carga

`useRoomChat` expone `historyStatus: "loading" | "ready" | "error"` y `retryHistory()`:
```ts
const loadHistory = useCallback(async (rid, silent = false) => {
  if (!silent) setHistoryStatus("loading");
  try { mergeMessages(await getRoomHistory(rid, 50)); if (!silent) setHistoryStatus("ready"); }
  catch { if (!silent) setHistoryStatus("error"); }
}, [mergeMessages]);
```
`ChatPanel` renderiza según el estado:
- **loading** → `HistoryLoading` ("Cargando historial…" + skeletons, `aria-busy`).
- **error** → `HistoryError` (`role="alert"` "No fue posible cargar el historial" +
  botón **Reintentar** que recibe el foco).
- **ready & vacío** → `EmptyHistory` (`role="status"` "Aún no hay mensajes en esta sala").

> La re-sincronización tras reconexión usa `silent = true` para **no** parpadear
> "Cargando…" sobre un chat ya poblado.

## Tarea 2-3 · Render + fecha y hora

`renderTimeline` intercala **separadores de fecha** (`role="separator"`) cuando
cambia el día: **"Hoy" / "Ayer" / fecha larga**. Cada `MessageBubble` muestra la
**hora `HH:MM`**. Resultado: "Juan · 14:30 · Hola".

## Tarea 7 · Actualización automática

Los mensajes nuevos llegan por el mismo socket (`receive_message`) y se mezclan
con dedup por `id` y orden cronológico — **sin recargar la página**.

## Tarea 8 · Persistencia tras F5

Como el historial se carga en el `useEffect` de montaje del hook, al recargar
(F5) se vuelve a pedir `GET /rooms/{id}/messages` automáticamente. Los mensajes
se guardan en Firestore (chat-service → room-service), así que persisten.

## Tarea 9 · Scroll al último

Al cargar el historial, `ChatPanel` posiciona el scroll al final
(`el.scrollTop = el.scrollHeight`). Si el usuario sube a leer y llega un mensaje,
se muestra el badge "↓ N nuevos" en vez de forzar el salto.

## Archivos involucrados
- `services/messages.ts` (`getRoomHistory`, `messageTimestamp`)
- `hooks/useRoomChat.ts` (`historyStatus`, `loadHistory`, `retryHistory`)
- `components/room/ChatPanel.tsx` (`HistoryLoading`, `HistoryError`, `EmptyHistory`, `renderTimeline`)
- `components/room/MessageBubble.tsx`
