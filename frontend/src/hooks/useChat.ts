/**
 * @file useChat — Hook que gestiona el chat de una sala en tiempo real.
 *
 * Responsabilidades:
 *  - Establecer la conexión Socket.IO (vía `connectSocket`).
 *  - Enviar `join_room` al conectar (y en cada reconexión, para volver a
 *    estar dentro de la "room" del servidor — el server pierde esa
 *    membresía cuando el socket se cae).
 *  - Mantener `status` como reflejo del transporte:
 *      idle → connecting → connected → reconnecting → connected
 *                                                  ↘ error / offline
 *  - Mantener la lista de mensajes deduplicada y ordenada cronológicamente.
 *  - Exponer `sendMessage(content)` con feedback de éxito/fracaso por ack.
 *
 * Diseño en dos efectos (importante):
 *   Efecto A → `connectSocket()` y guarda el socket en state local.
 *   Efecto B → cuando el socket existe, suscribe listeners y emite join.
 *
 * Hacerlo en un solo `useEffect` con `connectSocket().then(...)` no permite
 * que React limpie los listeners correctamente: el `return cleanup` del
 * `.then` se descarta porque no es el valor devuelto por el useEffect.
 * Eso provoca listener stacking entre montajes (sobre todo en React strict
 * mode) y eventos como `user_left` que parecen "no llegar" cuando en
 * realidad llegan a un handler obsoleto.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { connectSocket } from "@/services/socket";
import {
  getRoomHistory,
  messageTimestamp,
  type Message,
} from "@/services/messages";

/** Estado agregado de la conexión y el ingreso a la sala. */
export type ChatStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "offline"
  | "error";

export interface PresenceEvent {
  uid: string;
  username: string;
  /** Avatar del usuario (lo incluye el backend desde el sprint actual). */
  avatar?: string;
  roomId: string;
}

/** Usuarios actualmente conectados a la sala según user_joined/user_left. */
export interface PresentUser {
  uid: string;
  username: string;
  avatar?: string;
}

interface UseChatResult {
  status: ChatStatus;
  statusLabel: string;
  error: string | null;
  messages: Message[];
  presentUsers: PresentUser[];
  sendMessage: (content: string) => Promise<boolean>;
  /**
   * Emite `leave_room` y espera el ack del servidor (con timeout corto).
   * Llamar antes de navegar fuera de la sala — garantiza que el resto de
   * los participantes reciban `user_left` antes de que el componente se
   * desmonte. La limpieza de useEffect emite de nuevo como red de
   * seguridad, pero esta llamada hace que el resultado sea determinista.
   */
  leaveRoom: () => Promise<void>;
}

const STATUS_LABELS: Record<ChatStatus, string> = {
  idle: "Preparando…",
  connecting: "Conectando…",
  connected: "Conectado al servidor",
  reconnecting: "Reconectando…",
  offline: "Sin conexión",
  error: "Error de conexión",
};

type SocketAck<T> =
  | { ok: true; data?: T }
  | { ok: false; error: string; message?: string };

const SEND_TIMEOUT_MS = 7000;

export function useChat(roomId: string | undefined): UseChatResult {
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [presentUsers, setPresentUsers] = useState<PresentUser[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);
  const everJoinedRef = useRef(false);

  // ── Helper: dedup + sort cronológico ────────────────────────────────────
  const mergeMessages = useCallback((incoming: Message[]) => {
    setMessages((prev) => {
      const map = new Map<string, Message>();
      [...prev, ...incoming].forEach((m) => map.set(m.id, m));
      return Array.from(map.values()).sort(
        (a, b) => messageTimestamp(a) - messageTimestamp(b)
      );
    });
  }, []);

  // ── Helper: emitir join_room con ack ────────────────────────────────────
  const emitJoin = useCallback(
    (s: Socket, rid: string) => {
      s.emit(
        "join_room",
        { roomId: rid, limit: 50 },
        (
          ack: SocketAck<{
            messages: Message[];
            members: PresentUser[];
          }>
        ) => {
          if (!ack || ack.ok === false) {
            const code = ack && ack.ok === false ? ack.error : "UNKNOWN";
            setError(code);
            setStatus("error");
            return;
          }
          everJoinedRef.current = true;
          setError(null);
          setStatus("connected");
          if (ack.data?.messages?.length) {
            mergeMessages(ack.data.messages);
          }
          // Sembrar presentes con quienes YA estaban en la sala.
          setPresentUsers(ack.data?.members ?? []);
        }
      );
    },
    [mergeMessages]
  );

  // ── Cargar historial REST en paralelo (degradación graceful) ────────────
  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    getRoomHistory(roomId, 50)
      .then((history) => {
        if (!cancelled) mergeMessages(history);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [roomId, mergeMessages]);

  // ── Efecto A: conectar el socket y guardar la referencia en state ──────
  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    setStatus("connecting");
    connectSocket()
      .then((s) => {
        if (cancelled) return;
        setSocket(s);
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : "UNKNOWN");
      });
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  // ── Efecto B: suscribir listeners y emitir join (cleanup REAL) ─────────
  useEffect(() => {
    if (!socket || !roomId) return;

    const onConnect = () => emitJoin(socket, roomId);
    const onDisconnect = (reason: string) => {
      if (reason === "io client disconnect") return;
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setStatus("offline");
      } else {
        setStatus("reconnecting");
      }
    };
    const onConnectError = () => {
      setStatus(everJoinedRef.current ? "reconnecting" : "error");
    };
    const onReconnectAttempt = () => setStatus("reconnecting");
    const onReceiveMessage = (msg: Message) => mergeMessages([msg]);
    const onUserJoined = (evt: PresenceEvent) => {
      setPresentUsers((prev) =>
        prev.some((u) => u.uid === evt.uid)
          ? prev
          : [
              ...prev,
              { uid: evt.uid, username: evt.username, avatar: evt.avatar },
            ]
      );
    };
    const onUserLeft = (evt: PresenceEvent) => {
      setPresentUsers((prev) => prev.filter((u) => u.uid !== evt.uid));
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    socket.io.on("reconnect_attempt", onReconnectAttempt);
    socket.on("receive_message", onReceiveMessage);
    socket.on("user_joined", onUserJoined);
    socket.on("user_left", onUserLeft);

    // Si el socket ya está conectado al montar (reuso), unirnos ya mismo.
    if (socket.connected) {
      emitJoin(socket, roomId);
    }

    // Listeners de red y de cierre de ventana.
    const onOnline = () => setStatus((s) => (s === "offline" ? "reconnecting" : s));
    const onOffline = () => setStatus("offline");
    const onBeforeUnload = () => {
      // Emitimos sincrónicamente antes de que se corte el transporte.
      socket.emit("leave_room", { roomId });
    };
    if (typeof window !== "undefined") {
      window.addEventListener("online", onOnline);
      window.addEventListener("offline", onOffline);
      window.addEventListener("beforeunload", onBeforeUnload);
      window.addEventListener("pagehide", onBeforeUnload);
    }

    return () => {
      // CRÍTICO: desuscribimos listeners y avisamos al servidor.
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.io.off("reconnect_attempt", onReconnectAttempt);
      socket.off("receive_message", onReceiveMessage);
      socket.off("user_joined", onUserJoined);
      socket.off("user_left", onUserLeft);

      if (socket.connected) {
        socket.emit("leave_room", { roomId });
      }
      setPresentUsers([]);

      if (typeof window !== "undefined") {
        window.removeEventListener("online", onOnline);
        window.removeEventListener("offline", onOffline);
        window.removeEventListener("beforeunload", onBeforeUnload);
        window.removeEventListener("pagehide", onBeforeUnload);
      }
    };
  }, [socket, roomId, emitJoin, mergeMessages]);

  // ── leaveRoom explícito (para llamar antes de navegar) ─────────────────
  const leaveRoom = useCallback((): Promise<void> => {
    return new Promise<void>((resolve) => {
      if (!socket || !roomId) {
        resolve();
        return;
      }
      // Timeout corto: si el servidor no responde, no bloqueamos la UI.
      const timer = setTimeout(() => resolve(), 1500);
      socket.emit("leave_room", { roomId }, () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }, [socket, roomId]);

  // ── sendMessage con ack y timeout ───────────────────────────────────────
  const sendMessage = useCallback(
    async (content: string): Promise<boolean> => {
      const trimmed = content.trim();
      if (!trimmed || !roomId) return false;
      if (!socket || !socket.connected) return false;

      return new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), SEND_TIMEOUT_MS);
        socket.emit(
          "send_message",
          { roomId, content: trimmed },
          (ack: SocketAck<Message>) => {
            clearTimeout(timer);
            resolve(Boolean(ack && ack.ok === true));
          }
        );
      });
    },
    [roomId, socket]
  );

  return {
    status,
    statusLabel: STATUS_LABELS[status],
    error,
    messages,
    presentUsers,
    sendMessage,
    leaveRoom,
  };
}
