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
 * El hook NO renderiza nada — solo expone estado para que la UI lo pinte.
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
  /** Estado agregado para mostrar la badge "Conectado / Reconectando / …". */
  status: ChatStatus;
  /** Mensaje legible asociado al estado (texto de la badge). */
  statusLabel: string;
  /** Código del último error fatal (`ROOM_NOT_FOUND`, etc.) si lo hubo. */
  error: string | null;
  /** Historial + mensajes en vivo, ordenados de más antiguo a más nuevo. */
  messages: Message[];
  /** Usuarios presentes en la sala con su avatar/username si está disponible. */
  presentUsers: PresentUser[];
  /**
   * Envía un mensaje. Devuelve `true` si el server lo confirmó (ack ok),
   * `false` en caso de validación/error de transporte. No lanza.
   */
  sendMessage: (content: string) => Promise<boolean>;
}

const STATUS_LABELS: Record<ChatStatus, string> = {
  idle: "Preparando…",
  connecting: "Conectando…",
  connected: "Conectado al servidor",
  reconnecting: "Reconectando…",
  offline: "Sin conexión",
  error: "Error de conexión",
};

// Acks de Socket.IO (contrato definido por el backend en socketManager.ts)
type SocketAck<T> =
  | { ok: true; data?: T }
  | { ok: false; error: string; message?: string };

const SEND_TIMEOUT_MS = 7000;

export function useChat(roomId: string | undefined): UseChatResult {
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [presentUsers, setPresentUsers] = useState<PresentUser[]>([]);
  const socketRef = useRef<Socket | null>(null);
  // Guardamos si ya entramos al menos una vez para distinguir el primer
  // connecting de un reconnecting subsiguiente.
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
    (socket: Socket, rid: string) => {
      socket.emit(
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
          // Sembrar la lista de presentes con los que YA estaban en la
          // sala cuando entramos. Sin esto, solo aprenderíamos quién está
          // en la sala a partir de user_joined eventos posteriores —
          // perderíamos a todos los que entraron antes que nosotros.
          if (ack.data?.members) {
            setPresentUsers(ack.data.members);
          } else {
            // Reconexión sin members → al menos reseteamos para que la UI
            // no quede con presencia vieja antes de que llegue user_joined.
            setPresentUsers([]);
          }
        }
      );
    },
    [mergeMessages]
  );

  // ── Cargar historial REST en paralelo al socket (degradación graceful) ──
  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    getRoomHistory(roomId, 50)
      .then((history) => {
        if (!cancelled) mergeMessages(history);
      })
      .catch(() => {
        // No bloqueamos el chat si el REST falla — el socket también
        // entregará el historial en el ack de join_room.
      });
    return () => {
      cancelled = true;
    };
  }, [roomId, mergeMessages]);

  // ── Conexión Socket.IO + listeners ──────────────────────────────────────
  useEffect(() => {
    if (!roomId) return;

    let active = true;
    let socket: Socket | null = null;
    setStatus("connecting");

    connectSocket()
      .then((s) => {
        if (!active) return;
        socket = s;
        socketRef.current = s;

        // Listeners de transporte
        const onConnect = () => {
          // En cada conexión (inicial o reintento exitoso) volvemos a
          // entrar a la sala. El server no recuerda la membresía tras un
          // disconnect — esto es lo que hace que la "reconexión" sea
          // transparente para el usuario.
          emitJoin(s, roomId);
        };
        const onDisconnect = (reason: string) => {
          // `io client disconnect` = nosotros llamamos a .disconnect()
          // (p. ej. al desmontar) — no marquemos error en ese caso.
          if (reason === "io client disconnect") return;
          if (typeof navigator !== "undefined" && !navigator.onLine) {
            setStatus("offline");
          } else {
            setStatus("reconnecting");
          }
        };
        const onConnectError = () => {
          // El cliente reintentará solo (reconnection: true en socket.ts).
          // Solo cambiamos el label.
          if (everJoinedRef.current) {
            setStatus("reconnecting");
          } else {
            setStatus("error");
          }
        };
        const onReconnectAttempt = () => setStatus("reconnecting");

        // Listeners de aplicación
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

        s.on("connect", onConnect);
        s.on("disconnect", onDisconnect);
        s.on("connect_error", onConnectError);
        s.io.on("reconnect_attempt", onReconnectAttempt);
        s.on("receive_message", onReceiveMessage);
        s.on("user_joined", onUserJoined);
        s.on("user_left", onUserLeft);

        // Si la conexión ya estaba activa (socket reusado), emitimos join ahora.
        if (s.connected) {
          emitJoin(s, roomId);
        }

        return () => {
          s.off("connect", onConnect);
          s.off("disconnect", onDisconnect);
          s.off("connect_error", onConnectError);
          s.io.off("reconnect_attempt", onReconnectAttempt);
          s.off("receive_message", onReceiveMessage);
          s.off("user_joined", onUserJoined);
          s.off("user_left", onUserLeft);
        };
      })
      .catch((err) => {
        if (!active) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : "UNKNOWN");
      });

    // Listeners de red del navegador para reflejar offline → reconnecting
    const onOnline = () => {
      if (status === "offline") setStatus("reconnecting");
    };
    const onOffline = () => setStatus("offline");
    // Si el usuario cierra/recarga la ventana, emitimos leave_room antes
    // de que se corte el transporte. El handler `disconnect` del backend
    // también dispara user_left como red de seguridad, pero hacerlo aquí
    // libera al resto de la sala antes del ping-timeout (20 s).
    const onBeforeUnload = () => {
      const s = socketRef.current;
      if (s && roomId) {
        s.emit("leave_room", { roomId });
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("online", onOnline);
      window.addEventListener("offline", onOffline);
      window.addEventListener("beforeunload", onBeforeUnload);
      window.addEventListener("pagehide", onBeforeUnload);
    }

    return () => {
      active = false;
      const s = socketRef.current;
      if (s && roomId) {
        // Avisar al servidor para que limpie presencia. No desconectamos
        // el socket (puede reutilizarse en otra sala).
        s.emit("leave_room", { roomId });
      }
      // Limpiamos cualquier presencia local para que si el usuario vuelve
      // a la sala más tarde no quede gente "ghost" del tab anterior.
      setPresentUsers([]);
      if (typeof window !== "undefined") {
        window.removeEventListener("online", onOnline);
        window.removeEventListener("offline", onOffline);
        window.removeEventListener("beforeunload", onBeforeUnload);
        window.removeEventListener("pagehide", onBeforeUnload);
      }
    };
    // status fuera de deps a propósito — solo lo leemos en handlers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, emitJoin, mergeMessages]);

  // ── sendMessage con ack y timeout ───────────────────────────────────────
  const sendMessage = useCallback(
    async (content: string): Promise<boolean> => {
      const trimmed = content.trim();
      if (!trimmed || !roomId) return false;
      const socket = socketRef.current;
      if (!socket || !socket.connected) return false;

      return new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), SEND_TIMEOUT_MS);
        socket.emit(
          "send_message",
          { roomId, content: trimmed },
          (ack: SocketAck<Message>) => {
            clearTimeout(timer);
            if (ack && ack.ok === true) {
              // No mergeMessages aquí: el broadcast receive_message ya
              // llegará a este socket también y lo añadirá deduplicado.
              resolve(true);
            } else {
              resolve(false);
            }
          }
        );
      });
    },
    [roomId]
  );

  return {
    status,
    statusLabel: STATUS_LABELS[status],
    error,
    messages,
    presentUsers,
    sendMessage,
  };
}
