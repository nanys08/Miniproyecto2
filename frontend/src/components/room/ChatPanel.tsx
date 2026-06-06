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

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/utils/cn";
import MessageBubble from "@/components/room/MessageBubble";
import MessageInput from "@/components/room/MessageInput";
import { messageTimestamp, type Message } from "@/services/messages";
import type { ChatStatus } from "@/hooks/useChat";
import type { SendResult, HistoryStatus } from "@/hooks/useRoomChat";

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
  /** `true` brevemente tras una reconexión exitosa (banner "Conexión restablecida"). */
  reconnected?: boolean;
  /** Estado de la carga del historial (US-11). */
  historyStatus?: HistoryStatus;
  /** Reintenta la carga del historial tras un error. */
  onRetryHistory?: () => void;
  onSend: (content: string) => Promise<SendResult>;
}

type Tab = "chat" | "members";

export default function ChatPanel({
  currentUid,
  messages,
  participants,
  status,
  reconnected = false,
  historyStatus = "ready",
  onRetryHistory,
  onSend,
}: ChatPanelProps) {
  const [tab, setTab] = useState<Tab>("chat");
  const listRef = useRef<HTMLOListElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);

  // US-11 Esc3: al aparecer el error, el foco salta a "Reintentar" (teclado).
  useEffect(() => {
    if (historyStatus === "error") retryRef.current?.focus();
  }, [historyStatus]);

  // Scroll inteligente (T8): auto-scroll solo si el usuario está al final.
  // Si está leyendo historial y llegan mensajes, mostramos un badge
  // "↓ N nuevo(s)" en vez de forzar el scroll.
  const lastCountRef = useRef(messages.length);
  const atBottomRef = useRef(true);
  const [unread, setUnread] = useState(0);

  const scrollToBottom = () => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    atBottomRef.current = true;
    setUnread(0);
  };

  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    // scrollTop + clientHeight ≥ scrollHeight - 50px  → consideramos "al final".
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    atBottomRef.current = atBottom;
    if (atBottom) setUnread(0);
  };

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const delta = messages.length - lastCountRef.current;
    if (delta > 0) {
      if (atBottomRef.current) {
        el.scrollTop = el.scrollHeight; // T8: scrollToBottom()
      } else {
        setUnread((n) => n + delta);
      }
    }
    lastCountRef.current = messages.length;
  }, [messages.length]);

  // Saltar al último mensaje al (re)abrir la pestaña de chat o cuando termina
  // de cargar el historial. La lista se desmonta al pasar a "Participantes",
  // por lo que sin esto volvería al tope (arriba) al regresar.
  useEffect(() => {
    if (tab !== "chat" || historyStatus !== "ready") return;
    requestAnimationFrame(() => {
      const el = listRef.current;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
      atBottomRef.current = true;
      setUnread(0);
    });
  }, [tab, historyStatus]);

  // Mapa uid → avatar para resolver el avatar del autor en cada burbuja.
  const avatarByUid = useMemo(() => {
    const map = new Map<string, string>();
    participants.forEach((p) => {
      if (p.avatar) map.set(p.uid, p.avatar);
    });
    return map;
  }, [participants]);

  // T9: el envío se bloquea mientras no haya conexión establecida.
  const sendDisabled = status !== "connected";
  const hint =
    status === "offline"
      ? "Sin conexión a internet"
      : status === "error"
      ? "Error de conexión con el chat"
      : undefined;

  // US-11: el input se bloquea mientras el historial carga o falla.
  const historyReady = historyStatus === "ready";
  const inputDisabled = sendDisabled || !historyReady;
  const inputPlaceholder =
    status !== "connected"
      ? "Sin conexión"
      : historyStatus === "loading"
      ? "Cargando historial…"
      : historyStatus === "error"
      ? "Historial no disponible"
      : messages.length === 0
      ? "Escribe el primer mensaje…"
      : "Escribe tu mensaje…";

  return (
    <section
      aria-labelledby="chat-panel-title"
      className="flex h-full min-h-0 min-w-0 flex-col rounded-2xl bg-white shadow-sm ring-1 ring-slate-200"
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
          <div className="relative flex min-h-0 flex-1 flex-col">
            <ol
              ref={listRef}
              onScroll={handleScroll}
              role="log"
              aria-live="polite"
              aria-relevant="additions"
              aria-busy={historyStatus === "loading"}
              aria-label={
                historyStatus === "loading"
                  ? "Cargando mensajes"
                  : "Mensajes de la sala"
              }
              className="min-w-0 flex-1 space-y-3 overflow-x-hidden overflow-y-auto p-4"
            >
              {/* T4: estado cargando historial. */}
              {historyStatus === "loading" && <HistoryLoading />}

              {/* T6: estado error con botón Reintentar. */}
              {historyStatus === "error" && (
                <HistoryError retryRef={retryRef} onRetry={onRetryHistory} />
              )}

              {/* T5: estado vacío (neutral, role="status"). */}
              {historyStatus === "ready" && messages.length === 0 && (
                <EmptyHistory />
              )}

              {/* T2/T3: historial con separadores de fecha. El historial
                  parcial se sigue mostrando aunque la carga haya fallado. */}
              {renderTimeline(messages, currentUid, avatarByUid)}
            </ol>

            {/* T8: badge de mensajes nuevos cuando el usuario lee historial. */}
            {unread > 0 && (
              <button
                type="button"
                onClick={scrollToBottom}
                className="absolute bottom-2 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-blue-600 px-3 py-1 text-xs font-medium text-white shadow-md hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
              >
                <span aria-hidden="true">↓</span>
                {unread} mensaje{unread !== 1 ? "s" : ""} nuevo{unread !== 1 ? "s" : ""}
              </button>
            )}
          </div>

          {/* T9: estado de la conexión del chat. */}
          {status === "reconnecting" && (
            <div
              role="status"
              aria-live="polite"
              className="flex items-center gap-2 border-t border-amber-200 bg-amber-50 px-4 py-1.5 text-xs font-medium text-amber-800"
            >
              <span
                aria-hidden="true"
                className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-amber-500 border-r-transparent"
              />
              Reconectando chat…
            </div>
          )}
          {reconnected && status === "connected" && (
            <div
              role="status"
              aria-live="polite"
              className="border-t border-emerald-200 bg-emerald-50 px-4 py-1.5 text-xs font-medium text-emerald-800"
            >
              Conexión restablecida
            </div>
          )}

          <div className="shrink-0 border-t border-slate-100 p-3">
            <MessageInput
              onSend={onSend}
              disabled={inputDisabled}
              placeholder={inputPlaceholder}
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

// ─────────────────────────────────────────────────────────────────────────────
// Historial: estados y separadores de fecha (US-11)
// ─────────────────────────────────────────────────────────────────────────────

/** Clave única por día (para detectar cambios de fecha). */
function dayKey(ms: number): string {
  return new Date(ms).toDateString();
}

/** Etiqueta legible de la fecha: "Hoy", "Ayer" o fecha larga. */
function dayLabel(ms: number): string {
  const d = new Date(ms);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(ms) === today.toDateString()) return "Hoy";
  if (dayKey(ms) === yesterday.toDateString()) return "Ayer";
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/**
 * Renderiza los mensajes intercalando un separador de fecha (T3) cada vez que
 * cambia el día. Los separadores usan `role="separator"` (se omiten del orden
 * de navegación).
 */
function renderTimeline(
  messages: Message[],
  currentUid: string,
  avatarByUid: Map<string, string>
): ReactNode[] {
  const items: ReactNode[] = [];
  let lastDay = "";
  for (const m of messages) {
    const ms = messageTimestamp(m);
    if (ms) {
      const key = dayKey(ms);
      if (key !== lastDay) {
        lastDay = key;
        items.push(
          <li
            key={`sep-${key}`}
            role="separator"
            className="my-2 flex items-center gap-3 text-center"
          >
            <span className="h-px flex-1 bg-slate-200" aria-hidden="true" />
            <span className="text-xs font-medium capitalize text-slate-500">
              {dayLabel(ms)}
            </span>
            <span className="h-px flex-1 bg-slate-200" aria-hidden="true" />
          </li>
        );
      }
    }
    items.push(
      <MessageBubble
        key={m.id}
        message={m}
        isOwn={m.senderUid === currentUid}
        senderAvatar={avatarByUid.get(m.senderUid)}
      />
    );
  }
  return items;
}

/** T4 — estado cargando: texto + skeletons (decorativos). */
function HistoryLoading() {
  return (
    <li>
      <p className="flex items-center justify-center gap-2 py-2 text-sm text-slate-500">
        <span
          aria-hidden="true"
          className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-r-transparent"
        />
        Cargando historial…
      </p>
      <div aria-hidden="true" className="mt-2 space-y-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={cn("flex", i % 2 === 0 ? "justify-start" : "justify-end")}
          >
            <div
              className={cn(
                "h-10 animate-pulse rounded-2xl bg-slate-100",
                i % 2 === 0 ? "w-2/3" : "w-1/2"
              )}
            />
          </div>
        ))}
      </div>
    </li>
  );
}

/** T6 — estado error: anuncio inmediato + botón Reintentar enfocable. */
function HistoryError({
  retryRef,
  onRetry,
}: {
  retryRef: React.RefObject<HTMLButtonElement>;
  onRetry?: () => void;
}) {
  return (
    <li>
      <div
        role="alert"
        className="flex flex-col items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-center"
      >
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-6 w-6 text-red-600"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.515 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
            clipRule="evenodd"
          />
        </svg>
        <p className="text-sm font-medium text-red-800">
          No fue posible cargar el historial
        </p>
        <button
          ref={retryRef}
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
        >
          Reintentar
        </button>
      </div>
    </li>
  );
}

/** T5 — estado vacío: información neutral (no es un error → role="status"). */
function EmptyHistory() {
  return (
    <li>
      <div
        role="status"
        className="flex flex-col items-center gap-2 px-4 py-10 text-center"
      >
        <span aria-hidden="true" className="text-3xl">
          💬
        </span>
        <p className="text-sm font-medium text-slate-600">
          Aún no hay mensajes en esta sala
        </p>
        <p className="text-xs text-slate-400">
          Escribe el primer mensaje para iniciar la conversación.
        </p>
      </div>
    </li>
  );
}
