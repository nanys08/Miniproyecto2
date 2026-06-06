# Sprint 3 — Frontend: documentación por entregable

Esta carpeta documenta **cómo se implementó en el código** cada entregable del
frontend del Sprint 3 (pantallas, hooks, servicios y decisiones de diseño).

## Documentos

| Documento | Contenido | Historias |
|---|---|---|
| [C1 — Salas: unirse y gestión](C1-salas-unirse-y-gestion.md) | Pantalla "Unirse a sala", validaciones, `POST /rooms/join`, conexión WebSocket, username duplicado, participantes, ⚙ Editar/Eliminar (anfitrión), `ROOM_DELETED` | US-07, US-08 |
| [C2 — Chat en tiempo real](C2-chat-tiempo-real.md) | Componente de chat, `/ws/chat`, recibir/enviar, validaciones (vacío/500), remitente, scroll inteligente, reconexión, indicadores | US-10 |
| [C3 — Historial de chat](C3-historial.md) | `GET /rooms/{id}/messages`, render con fecha/hora, estados (cargando/vacío/error+Reintentar), actualización en vivo, persistencia tras F5, scroll | US-11 |
| [C4 — UX, accesibilidad y responsive](C4-ux-accesibilidad-responsive.md) | Design system (tokens), estados visuales, accesibilidad WCAG 2.2, focus visible, teclado, alertas, responsive | — |

> **Nota sobre la numeración.** Aquí se numeran los 4 entregables del sprint en
> orden (C1–C4). En el enunciado las etiquetas aparecían así: el bloque de
> "Salas/Unirse" sin número, y luego **C1=Chat, C2=Historial, C3=UX**. El mapeo es:
> _Salas → C1_, _Chat → C2_, _Historial → C3_, _UX → C4_ en este documento.

## Cómo está organizado el frontend

```
src/
├── pages/         RoomPage, DashboardPage, MyRoomsPage, …
├── components/
│   ├── room/      ChatPanel, MessageBubble, MessageInput, ConnectionBadge
│   └── rooms/     JoinRoomModal, CreateRoomModal, RoomSettingsModal, RoomCard
├── hooks/         useRoomChat (chat-service), useChat (socket heredado), useAuth, useToast
├── services/      rooms, messages, chatService, api, apiErrors, firebase
└── layouts/       DashboardLayout (header navy + sidebar), RoomLayout, AuthLayout
```

Documentación complementaria:
- Estructura y componentes: [`../COMPONENTES.md`](../COMPONENTES.md)
- Manual de usuario: [`../MANUAL-USUARIO.md`](../MANUAL-USUARIO.md)
- Evidencias (capturas UI + responsive): [`../EVIDENCIAS.md`](../EVIDENCIAS.md)
