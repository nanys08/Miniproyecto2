# C2 — Chat en tiempo real (US-10 Mensajería Instantánea)

> **Objetivo:** componente de chat funcional sobre WebSocket: enviar/recibir
> mensajes, validar contenido, identificar remitente, auto-scroll, reconexión e
> indicadores de envío.

## Mapa de tareas → implementación

| Tarea | Implementación (archivo · símbolo) |
|---|---|
| **1** Componente Chat (historial → input → botón) | `components/room/ChatPanel.tsx` (+ `MessageBubble`, `MessageInput`) |
| **2** Conectar `ws://…/ws/chat` | `hooks/useRoomChat.ts` + `services/chatService.ts` |
| **3** Escuchar mensajes → render inmediato | `useRoomChat.ts` (`receive_message` → `mergeMessages`) |
| **4** Enviar mensajes | `useRoomChat.ts` (`sendMessage`) + `MessageInput` |
| **5** Validar vacío → "No puedes enviar mensajes vacíos" | `MessageInput.tsx` + `useRoomChat.ts` |
| **6** Validar longitud 500 → bloquear | `useRoomChat.ts` (`MAX_CHAT_MESSAGE_LENGTH`) + `MessageInput` (contador) |
| **7** Mostrar remitente (`Juan: Hola`) | `components/room/MessageBubble.tsx` |
| **8** Scroll automático (`scrollToBottom`) | `ChatPanel.tsx` (scroll inteligente + badge) |
| **9** Reconexión ("Reconectando chat…" / "Conexión restablecida") | `useRoomChat.ts` + `ChatPanel.tsx` |
| **10** Indicadores ("Enviando mensaje…", botón off) | `MessageInput.tsx` |

---

## Arquitectura: una sola conexión

`useRoomChat` centraliza **en un único socket** la mensajería, la presencia y el
ciclo de vida de la sala. Esto es deliberado: dos sockets con el mismo username
chocarían con `USERNAME_ALREADY_CONNECTED`.

```
RoomPage
  └─ useRoomChat ──(socket.io)──▶ chat-service  /ws/chat  (puerto 8081)
       ├─ messages, sendMessage     (US-10)
       ├─ participants              (presencia)
       └─ status, sessionReplaced…  (ciclo de vida)
```

---

## Tarea 1 · Componente Chat

`ChatPanel` arma la estructura **historial → input → botón**:
- Lista de mensajes en un `<ol role="log" aria-live="polite">`.
- `MessageBubble` por cada mensaje.
- `MessageInput` (textarea + botón enviar) abajo.

## Tarea 2-4 · Conectar, recibir y enviar

```ts
// recibir (render inmediato, dedup + orden cronológico):
socket.on("receive_message", (m) => mergeMessages([m]));

// enviar (con ack):
socket.emit("send_message", { content: trimmed }, (ack) => { /* ok/error */ });
```
El mensaje se difunde a todos los presentes y aparece al instante (US-10 Esc1/2).

## Tarea 5-6 · Validaciones de mensaje

`useRoomChat.sendMessage` valida antes de emitir:
```ts
if (!trimmed) return { ok: false, error: "No puedes enviar mensajes vacíos" };      // T5
if (trimmed.length > MAX_CHAT_MESSAGE_LENGTH /* 500 */)
  return { ok: false, error: "El mensaje supera el límite permitido" };             // T6
```
`MessageInput` además muestra un **contador** que se pone rojo al acercarse/superar
los 500 y **bloquea** el botón de envío.

## Tarea 7 · Remitente

`MessageBubble` distingue:
- **Mensaje propio:** burbuja azul a la derecha, sin nombre.
- **Mensaje ajeno:** burbuja gris a la izquierda con **nombre del emisor** y avatar,
  y la hora `HH:MM`.

## Tarea 8 · Scroll inteligente

`ChatPanel` hace auto-scroll **solo si el usuario está al final**:
```ts
const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
// si llega un mensaje y NO está al final → badge "↓ N mensajes nuevos"
```
El badge es un botón que hace `scrollToBottom()`.

## Tarea 9 · Reconexión

`status` (de `useRoomChat`) refleja la conexión del chat-service:
- `disconnect` (no intencional) → `status = "reconnecting"` → `ChatPanel` muestra
  barra ámbar **"Reconectando chat…"** y bloquea el input.
- `connect` tras una caída → `reconnected = true` (4s) → barra verde
  **"Conexión restablecida"** + re-sincroniza el historial.

## Tarea 10 · Indicadores de envío

`MessageInput`: mientras `onSend` está pendiente, el textarea y el botón se
deshabilitan y se muestra **"Enviando mensaje…"** (`aria-live="polite"`).

---

## Accesibilidad del chat
- `role="log"` + `aria-live="polite"` → lectores anuncian mensajes nuevos.
- `textarea` con `aria-label="Campo de mensaje"`, botón con `aria-label="Enviar mensaje"`.
- Errores con `role="alert"`. Enter envía; Shift+Enter salta línea.

## Archivos involucrados
- `components/room/ChatPanel.tsx`, `MessageBubble.tsx`, `MessageInput.tsx`, `ConnectionBadge.tsx`
- `hooks/useRoomChat.ts`, `services/chatService.ts`, `services/messages.ts`
