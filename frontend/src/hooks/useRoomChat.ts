/**
 * @file useRoomChat — Conexión única al chat-service (Repositorio 2) para
 * mensajería en tiempo real + presencia + ciclo de vida de la sala.
 *
 * Reúne en UNA sola conexión WebSocket (`/ws/chat`):
 *   - Mensajes (US-10): historial inicial (REST), `receive_message`,
 *     `send_message` con validación de vacío/longitud y reconexión.
 *   - Presencia (C1): lista de participantes conectados.
 *   - Ciclo de vida (C1): username duplicado y ROOM_DELETED.
 *
 * Usar una sola conexión es importante: dos sockets con el mismo username en
 * la misma sala chocarían con `USERNAME_ALREADY_CONNECTED`.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { connectChatService } from "@/services/chatService";
import { enterRoom } from "@/services/rooms";
import { getRoomHistory, messageTimestamp, type Message } from "@/services/messages";
import type { ChatStatus } from "@/hooks/useChat";

/** Límite de caracteres por mensaje (alineado con el backend). */
export const MAX_CHAT_MESSAGE_LENGTH = 500;

interface Options {
  roomId?: string;
  username?: string;
  uid?: string;
  /** Avatar del usuario actual — se publica para el grid de video. */
  avatar?: string;
  /** Se invoca cuando el anfitrión elimina la sala (ROOM_DELETED). */
  onRoomDeleted?: () => void;
}

/** Participante conectado con datos para el grid (username + uid + avatar). */
export interface PresentMember {
  username: string;
  uid?: string;
  avatar?: string;
}

export interface SendResult {
  ok: boolean;
  error?: string;
}

/** Estado de la carga del historial (US-11). */
export type HistoryStatus = "loading" | "ready" | "error";

interface Result {
  /** Estado de la conexión del chat (para indicadores y bloqueo del input). */
  status: ChatStatus;
  /** Usernames conectados ahora mismo (p. ej. ["Juan", "Ana"]). */
  participants: string[];
  /** Participantes conectados con uid + avatar (para el grid de video). */
  presentMembers: PresentMember[];
  /** `true` si el username ya estaba conectado (USERNAME_ALREADY_CONNECTED). */
  duplicateUsername: boolean;
  /** Mensajes ordenados cronológicamente (historial + en vivo). */
  messages: Message[];
  /** Envía un mensaje. Valida vacío/longitud y resuelve { ok, error }. */
  sendMessage: (content: string) => Promise<SendResult>;
  /** `true` brevemente tras una reconexión exitosa ("Conexión restablecida"). */
  reconnected: boolean;
  /** Estado de la carga inicial del historial (US-11). */
  historyStatus: HistoryStatus;
  /** Reintenta la carga del historial tras un error (US-11 Esc3). */
  retryHistory: () => void;
  /** `true` si esta sesión fue reemplazada por otra pestaña/dispositivo. */
  sessionReplaced: boolean;
}

export function useRoomChat({
  roomId,
  username,
  uid,
  avatar,
  onRoomDeleted,
}: Options): Result {
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [participants, setParticipants] = useState<string[]>([]);
  const [presentMembers, setPresentMembers] = useState<PresentMember[]>([]);
  const [duplicateUsername, setDuplicateUsername] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reconnected, setReconnected] = useState(false);
  const [historyStatus, setHistoryStatus] = useState<HistoryStatus>("loading");
  const [sessionReplaced, setSessionReplaced] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const replacedRef = useRef(false);
  const onDeletedRef = useRef(onRoomDeleted);
  onDeletedRef.current = onRoomDeleted;
  const wasConnectedRef = useRef(false);

  // Merge dedup por id + orden cronológico (US-10 Esc2: orden mantenido).
  const mergeMessages = useCallback((incoming: Message[]) => {
    setMessages((prev) => {
      const map = new Map<string, Message>();
      [...prev, ...incoming].forEach((m) => {
        if (m && m.id) map.set(m.id, m);
      });
      return Array.from(map.values()).sort(
        (a, b) => messageTimestamp(a) - messageTimestamp(b)
      );
    });
  }, []);

  /**
   * Carga el historial desde el backend (US-11). `silent` evita tocar el
   * estado de carga: se usa en la re-sincronización tras una reconexión, para
   * no parpadear "Cargando…" sobre un chat que ya tiene mensajes.
   */
  const loadHistory = useCallback(
    async (rid: string, silent = false) => {
      if (!silent) setHistoryStatus("loading");
      try {
        const history = await getRoomHistory(rid, 50);
        mergeMessages(history);
        if (!silent) setHistoryStatus("ready");
      } catch {
        // US-11 Esc3: el fallo se muestra; el chat en vivo sigue funcionando.
        if (!silent) setHistoryStatus("error");
      }
    },
    [mergeMessages]
  );

  const retryHistory = useCallback(() => {
    if (roomId) void loadHistory(roomId);
  }, [roomId, loadHistory]);

  useEffect(() => {
    if (!roomId || !username) return;
    let cancelled = false;
    let socket: Socket | null = null;

    setStatus("connecting");
    setDuplicateUsername(false);
    setParticipants([]);
    setPresentMembers([]);
    setMessages([]);
    setHistoryStatus("loading");
    setSessionReplaced(false);
    wasConnectedRef.current = false;
    replacedRef.current = false;

    (async () => {
      // Validar sala + obtener ticket (best-effort: dev devuelve null).
      let ticket: string | null = null;
      let effectiveUsername = username;
      try {
        const info = await enterRoom(roomId);
        ticket = info.chatTicket ?? null;
        if (info.username) effectiveUsername = info.username;
      } catch {
        // Si /enter falla, intentamos el handshake directo (dev).
      }
      if (cancelled || !roomId) return;

      void loadHistory(roomId);

      socket = connectChatService({
        roomId,
        username: effectiveUsername,
        uid,
        avatar,
        ticket,
      });
      socketRef.current = socket;

      socket.on("connect", () => {
        console.log("[chat-service] conectado", {
          roomId,
          username: effectiveUsername,
        });
        setStatus("connected");
        if (wasConnectedRef.current) {
          // US-10 Esc5: reconexión exitosa → "Conexión restablecida" + sync.
          setReconnected(true);
          window.setTimeout(() => setReconnected(false), 4000);
          void loadHistory(roomId, true);
        }
        wasConnectedRef.current = true;
      });

      socket.on("connect_error", (err: Error) => {
        const code = err.message;
        console.warn("[chat-service] connect_error:", code);
        if (code === "USERNAME_ALREADY_CONNECTED") {
          setDuplicateUsername(true);
          setStatus("error");
          socket?.disconnect();
        } else if (code === "ROOM_CLOSED") {
          onDeletedRef.current?.();
        } else {
          setStatus(wasConnectedRef.current ? "reconnecting" : "error");
        }
      });

      // La sesión fue tomada por otra pestaña/dispositivo del mismo usuario:
      // el servidor nos expulsa. Mostramos un aviso claro en vez de quedarnos
      // "Reconectando…" indefinidamente.
      socket.on("session_replaced", () => {
        console.warn("[chat-service] sesión reemplazada por otra pestaña");
        replacedRef.current = true;
        setSessionReplaced(true);
        setStatus("error");
      });

      socket.on("disconnect", (reason: string) => {
        if (reason === "io client disconnect") return;
        // Si nos reemplazó otra pestaña, NO intentamos reconectar en bucle.
        if (replacedRef.current) {
          setStatus("error");
          return;
        }
        // US-10 Esc4: desconexión temporal → "Reconectando chat…".
        setStatus("reconnecting");
      });

      socket.on(
        "participants",
        (payload: {
          roomId: string;
          participants: string[];
          members?: PresentMember[];
        }) => {
          setParticipants(payload.participants ?? []);
          // `members` (con uid + avatar) es lo que alimenta el grid de video.
          // Si un backend antiguo no lo envía, derivamos una lista mínima
          // desde los usernames para no dejar el grid vacío.
          if (Array.isArray(payload.members)) {
            setPresentMembers(payload.members);
          } else {
            setPresentMembers(
              (payload.participants ?? []).map((name) => ({ username: name }))
            );
          }
        }
      );

      // US-10 Esc2: render inmediato del mensaje recibido.
      socket.on("receive_message", (m: Message) => {
        mergeMessages([m]);
      });

      const handleDeleted = () => {
        console.log("[chat-service] ROOM_DELETED");
        onDeletedRef.current?.();
      };
      socket.on("room_closed", handleDeleted);
      socket.on("ROOM_DELETED", handleDeleted);
    })();

    return () => {
      cancelled = true;
      socket?.removeAllListeners();
      socket?.disconnect();
      socketRef.current = null;
      setStatus("idle");
      setParticipants([]);
      setPresentMembers([]);
      setMessages([]);
    };
  }, [roomId, username, uid, avatar, mergeMessages, loadHistory]);

  const sendMessage = useCallback(
    async (content: string): Promise<SendResult> => {
      const trimmed = content.trim();
      // T5: mensaje vacío.
      if (!trimmed) {
        return { ok: false, error: "No puedes enviar mensajes vacíos" };
      }
      // T6: longitud máxima.
      if (trimmed.length > MAX_CHAT_MESSAGE_LENGTH) {
        return { ok: false, error: "El mensaje supera el límite permitido" };
      }
      const socket = socketRef.current;
      if (!socket || !socket.connected) {
        return { ok: false, error: "Error de conexión con el chat" };
      }
      return new Promise<SendResult>((resolve) => {
        const timer = window.setTimeout(
          () => resolve({ ok: false, error: "No fue posible enviar el mensaje" }),
          7000
        );
        socket.emit(
          "send_message",
          { content: trimmed },
          (ack: { ok: boolean; error?: string }) => {
            window.clearTimeout(timer);
            if (ack && ack.ok) {
              resolve({ ok: true });
            } else if (ack?.error === "MESSAGE_TOO_LONG") {
              resolve({ ok: false, error: "El mensaje supera el límite permitido" });
            } else if (ack?.error === "EMPTY_MESSAGE") {
              resolve({ ok: false, error: "No puedes enviar mensajes vacíos" });
            } else {
              resolve({ ok: false, error: "No fue posible enviar el mensaje" });
            }
          }
        );
      });
    },
    []
  );

  return {
    status,
    participants,
    presentMembers,
    duplicateUsername,
    messages,
    sendMessage,
    reconnected,
    historyStatus,
    retryHistory,
    sessionReplaced,
  };
}
