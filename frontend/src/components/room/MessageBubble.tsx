/**
 * @file MessageBubble — Render de un mensaje individual del chat.
 *
 * Casos:
 *  - Mensaje del usuario actual (`isOwn`): burbuja azul alineada a la
 *    derecha, sin avatar (es obvio quién soy).
 *  - Mensaje de otro usuario: avatar + nombre encima de la burbuja gris.
 *  - Mensaje del sistema (`type === "system"`): texto centrado en gris
 *    (joins/leaves).
 *
 * El timestamp se muestra como `HH:MM` (hora local del lector).
 */

import { cn } from "@/utils/cn";
import { messageTimestamp, type Message } from "@/services/messages";

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  /** Avatar (URL) del autor, si el caller pudo resolverlo. */
  senderAvatar?: string;
}

function formatTime(ms: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MessageBubble({
  message,
  isOwn,
  senderAvatar,
}: MessageBubbleProps) {
  const ts = formatTime(messageTimestamp(message));

  if (message.type === "system") {
    return (
      <li className="my-1 flex justify-center">
        <span className="text-xs text-slate-500">{message.content}</span>
      </li>
    );
  }

  return (
    <li
      className={cn(
        "flex w-full gap-2",
        isOwn ? "justify-end" : "justify-start"
      )}
    >
      {!isOwn && (
        <div className="flex-shrink-0">
          {senderAvatar ? (
            <img
              src={senderAvatar}
              alt=""
              aria-hidden="true"
              className="mt-5 h-8 w-8 rounded-full object-cover ring-1 ring-slate-200"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div
              aria-hidden="true"
              className="mt-5 flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-purple-400 to-blue-500 text-xs font-bold text-white"
            >
              {message.senderUsername.slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>
      )}

      <div className={cn("flex max-w-[78%] flex-col", isOwn ? "items-end" : "items-start")}>
        {!isOwn && (
          <span className="mb-0.5 text-xs font-semibold text-slate-600">
            {message.senderUsername}
          </span>
        )}
        <div
          className={cn(
            "rounded-2xl px-3 py-2 text-sm shadow-sm",
            isOwn
              ? "rounded-br-sm bg-blue-600 text-white"
              : "rounded-bl-sm bg-slate-100 text-slate-900"
          )}
        >
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
        {ts && (
          <span
            className={cn(
              "mt-0.5 text-[10px] text-slate-400",
              isOwn ? "self-end" : "self-start"
            )}
          >
            {ts}
          </span>
        )}
      </div>
    </li>
  );
}
