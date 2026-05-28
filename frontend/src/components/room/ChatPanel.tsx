/**
 * @file ChatPanel — Panel lateral de chat de la sala (la columna derecha
 * de las maquetas). Muestra:
 *  - Tabs Chat / Participantes (n).
 *  - Historial + mensajes en vivo.
 *  - Input para enviar mensajes con feedback de estado.
 *
 * Patrón de a11y:
 *  - El listado de mensajes es un `role="log"` con `aria-live="polite"`
 *    para que los lectores anuncien los mensajes nuevos sin interrumpir.
 *  - El tablist usa el patrón ARIA estándar (Tab atrapado dentro del grupo
 *    con flechas si se quisiera; aquí basta Tab por sencillez).
 *  - Estados deshabilitados anunciados con `aria-disabled`.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/utils/cn";
import MessageBubble from "@/components/room/MessageBubble";
import MessageInput from "@/components/room/MessageInput";
import type { Message } from "@/services/messages";
import type { ChatStatus } from "@/hooks/useChat";

interface Participant {
  uid: string;
  username: string;
  avatar?: string;
  isOwner?: boolean;
  isYou?: boolean;
  online?: boolean;
}

interface ChatPanelProps {
  /** UID del usuario actual — para alinear sus propias burbujas a la derecha. */
  currentUid: string;
  messages: Message[];
  participants: Participant[];
  status: ChatStatus;
  onSend: (content: string) => Promise<boolean>;
}

type Tab = "chat" | "members";

export default function ChatPanel({
  currentUid,
  messages,
  participants,
  status,
  onSend,
}: ChatPanelProps) {
  const [tab, setTab] = useState<Tab>("chat");
  const listRef = useRef<HTMLOListElement>(null);

  // Auto-scroll a fondo cuando llega un mensaje nuevo (solo si el usuario
  // ya estaba al final — si scrolleó hacia arriba para leer historial,
  // respetamos su posición).
  const lastCountRef = useRef(messages.length);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const wasAtBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (messages.length > lastCountRef.current && wasAtBottom) {
      el.scrollTop = el.scrollHeight;
    }
    lastCountRef.current = messages.length;
  }, [messages.length]);

  // Mapa uid → avatar para resolver el avatar del autor en cada burbuja.
  const avatarByUid = useMemo(() => {
    const map = new Map<string, string>();
    participants.forEach((p) => {
      if (p.avatar) map.set(p.uid, p.avatar);
    });
    return map;
  }, [participants]);

  const sendDisabled = status !== "connected";
  const hint =
    status === "reconnecting"
      ? "Reconectando, espera un momento…"
      : status === "offline"
      ? "Sin conexión a internet"
      : status === "error"
      ? "Error de conexión"
      : undefined;

  return (
    <section
      aria-labelledby="chat-panel-title"
      className="flex h-full min-h-0 flex-col rounded-2xl bg-white shadow-sm ring-1 ring-slate-200"
    >
      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Panel lateral de la sala"
        className="flex shrink-0 gap-1 border-b border-slate-200 px-3 pt-3"
      >
        <button
          role="tab"
          id="tab-chat"
          aria-selected={tab === "chat"}
          aria-controls="tabpanel-chat"
          tabIndex={tab === "chat" ? 0 : -1}
          onClick={() => setTab("chat")}
          className={cn(
            "rounded-t-md px-3 py-2 text-sm font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
            tab === "chat"
              ? "border-b-2 border-blue-600 text-blue-700"
              : "text-slate-600 hover:text-slate-900"
          )}
        >
          <span id="chat-panel-title">Chat</span>
        </button>
        <button
          role="tab"
          id="tab-members"
          aria-selected={tab === "members"}
          aria-controls="tabpanel-members"
          tabIndex={tab === "members" ? 0 : -1}
          onClick={() => setTab("members")}
          className={cn(
            "rounded-t-md px-3 py-2 text-sm font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
            tab === "members"
              ? "border-b-2 border-blue-600 text-blue-700"
              : "text-slate-600 hover:text-slate-900"
          )}
        >
          Participantes ({participants.length})
        </button>
      </div>

      {/* Tabpanel: Chat */}
      {tab === "chat" && (
        <div
          id="tabpanel-chat"
          role="tabpanel"
          aria-labelledby="tab-chat"
          className="flex min-h-0 flex-1 flex-col"
        >
          <ol
            ref={listRef}
            role="log"
            aria-live="polite"
            aria-relevant="additions"
            aria-label="Mensajes de la sala"
            className="flex-1 space-y-3 overflow-y-auto p-4"
          >
            {messages.length === 0 && (
              <li className="py-8 text-center text-sm text-slate-400">
                No hay mensajes aún. ¡Sé el primero en escribir!
              </li>
            )}
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                isOwn={m.senderUid === currentUid}
                senderAvatar={avatarByUid.get(m.senderUid)}
              />
            ))}
          </ol>
          <div className="shrink-0 border-t border-slate-100 p-3">
            <MessageInput
              onSend={onSend}
              disabled={sendDisabled}
              hint={hint}
            />
          </div>
        </div>
      )}

      {/* Tabpanel: Participantes */}
      {tab === "members" && (
        <div
          id="tabpanel-members"
          role="tabpanel"
          aria-labelledby="tab-members"
          className="flex-1 overflow-y-auto p-4"
        >
          <ul className="space-y-2">
            {participants.map((p) => (
              <li
                key={p.uid}
                className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-slate-50"
              >
                {p.avatar ? (
                  <img
                    src={p.avatar}
                    alt=""
                    aria-hidden="true"
                    className="h-9 w-9 rounded-full object-cover ring-1 ring-slate-200"
                  />
                ) : (
                  <div
                    aria-hidden="true"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-purple-400 to-blue-500 text-xs font-bold text-white"
                  >
                    {p.username.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-slate-900">
                    {p.username}
                    {p.isYou && (
                      <span className="ml-1.5 text-xs font-normal text-slate-500">
                        (tú)
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-slate-500">
                    {p.isOwner ? "Anfitrión" : "Participante"}
                    {p.online !== undefined && (
                      <>
                        {" • "}
                        <span
                          className={
                            p.online ? "text-emerald-600" : "text-slate-400"
                          }
                        >
                          {p.online ? "en línea" : "ausente"}
                        </span>
                      </>
                    )}
                  </span>
                </div>
              </li>
            ))}
            {participants.length === 0 && (
              <li className="py-8 text-center text-sm text-slate-400">
                Aún no hay participantes en la sala.
              </li>
            )}
          </ul>
        </div>
      )}
    </section>
  );
}
