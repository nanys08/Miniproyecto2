/**
 * @file RoomPage — Interfaz completa de una Sala de Estudio Activa.
 *
 * Layout (basado en las maquetas):
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  Nombre sala  • Estado conexión        [Participantes][Invit]│  header
 *   │  Sala activa  Código: MATH-7GBK                              │
 *   ├──────────────────────────────────────┬───────────────────────┤
 *   │                                      │                       │
 *   │   ┌──────────┬──────────┐            │   [Chat][Participantes]│
 *   │   │  Tú      │  Sofía   │            │                       │
 *   │   │  avatar  │  avatar  │            │   ...mensajes...      │
 *   │   ├──────────┼──────────┤            │                       │
 *   │   │  Carlos  │  Diego   │            │   [escribe mensaje…]  │
 *   │   └──────────┴──────────┘            │                       │
 *   ├──────────────────────────────────────┴───────────────────────┤
 *   │  [🎤] [📷] [🖥] [⋯]                 [Salir de la sala 🔴]   │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * En vez de mostrar imágenes aleatorias de cámaras, cada tile renderiza
 * el avatar que el participante eligió (para el usuario actual sale de
 * `useAuth().user.avatar`).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { cn } from "@/utils/cn";
import { useAuth } from "@/hooks/useAuth";
import { useChat } from "@/hooks/useChat";
import { useWebRTC, type MediaErrorKind } from "@/hooks/useWebRTC";
import { useToast } from "@/hooks/useToast";
import { useRoomChat } from "@/hooks/useRoomChat";
import { getRoom, type Room } from "@/services/rooms";
import { getPublicUser, type PublicUser } from "@/services/users";
import { friendlyError, type FriendlyError } from "@/services/apiErrors";
import ChatPanel from "@/components/room/ChatPanel";
import RoomSettingsModal from "@/components/rooms/RoomSettingsModal";
import DeviceSettingsModal from "@/components/rooms/DeviceSettingsModal";
import ErrorState from "@/components/ErrorState";
import Loader from "@/components/Loader";
import Avatar from "@/components/Avatar";
import Button from "@/components/Button";

interface ToggleControl {
  label: string;
  icon: JSX.Element;
  active: boolean;
  /**
   * `true` si el botón refleja un estado que se puede "apagar" (mic, cam,
   * pantalla). Cuando `active === false` y `isToggle === true`, el botón
   * se pinta en rojo para hacer visible que ese periférico está silenciado.
   */
  isToggle: boolean;
  onClick: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────────────────────

export default function RoomPage() {
  const { id: roomId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  // ── Cargar metadatos de la sala ─────────────────────────────────────────
  const [room, setRoom] = useState<Room | null>(null);
  const [loadError, setLoadError] = useState<FriendlyError | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!roomId) return;
    let alive = true;
    setLoadError(null);
    setRoom(null);
    getRoom(roomId)
      .then((r) => {
        if (alive) setRoom(r);
      })
      .catch((err) => {
        if (alive) setLoadError(friendlyError(err));
      });
    return () => {
      alive = false;
    };
  }, [roomId, reloadKey]);

  // ── Suscribirse al chat ─────────────────────────────────────────────────
  // Socket heredado (puerto 3000): presencia del grid de video + media (US-09).
  // Su estado de conexión NO se muestra en el header: el indicador refleja el
  // chat-service (lo relevante para el usuario).
  const {
    presentUsers,
    leaveRoom,
    mediaStates,
    publishMediaState,
  } = useChat(roomId);

  // Botón "Salir de la sala": esperamos el ack del `leave_room` ANTES de
  // navegar. Sin esto, React podría desmontar el componente antes de que
  // el emit llegue al servidor, y el resto de la sala no se enteraría.
  const handleLeave = async () => {
    await leaveRoom();
    navigate("/dashboard");
  };

  // ── Presencia y ciclo de vida vía chat-service (Repo 2) ────────────────
  const { show } = useToast();
  const isHost = !!user && !!room && room.ownerId === user.uid;
  const isHostRef = useRef(isHost);
  isHostRef.current = isHost;

  // Tarea 9: salir de la sala cuando el anfitrión la elimina (ROOM_DELETED).
  // Guard para no disparar dos veces (el host también recibe el evento).
  // En vez de navegar de inmediato, mostramos una pantalla "La sesión
  // finalizó" para que el participante entienda por qué fue desconectado.
  const deletedRef = useRef(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  // El anfitrión que elimina maneja su propio flujo (toast + navegación) y NO
  // debe ver la pantalla de "sesión finalizó" (ver isHostRef arriba).
  const handleRoomDeleted = useCallback(() => {
    if (deletedRef.current || isHostRef.current) return;
    deletedRef.current = true;
    setSessionEnded(true);
  }, []);

  // Chat-service (puerto 8081, /ws/chat): mensajería en tiempo real (US-10),
  // presencia de conectados, username duplicado y ROOM_DELETED.
  const {
    participants: livePresence,
    presentMembers,
    duplicateUsername,
    messages: chatMessages,
    sendMessage: sendChatMessage,
    status: chatStatus,
    reconnected: chatReconnected,
    historyStatus,
    retryHistory,
    sessionReplaced,
  } = useRoomChat({
    roomId,
    username: user?.username,
    uid: user?.uid,
    avatar: user?.avatar,
    onRoomDeleted: handleRoomDeleted,
  });

  // ── Mostrar / ocultar el panel de chat ─────────────────────────────────
  // En móvil arranca OCULTO: el video ocupa toda la pantalla (estilo Discord)
  // y el chat se abre como overlay a pantalla completa. En desktop (lg+) sí
  // arranca visible como columna lateral.
  const [chatVisible, setChatVisible] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 1024px)").matches
  );

  // ── Configuración de sala (solo anfitrión) ─────────────────────────────
  // La configuración se abre desde el menú "Más" de la barra inferior.
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Config individual de dispositivos (mic/cámara) — disponible para todos.
  const [deviceSettingsOpen, setDeviceSettingsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // Cierre del menú "Más" con clic fuera o Escape (navegación por teclado).
  useEffect(() => {
    if (!moreOpen) return;
    function onPointer(e: MouseEvent) {
      if (!moreMenuRef.current?.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMoreOpen(false);
        moreBtnRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);

  const handleRoomUpdated = (updated: Room) => {
    setRoom(updated);
    setSettingsOpen(false);
    show("success", "Sala actualizada correctamente");
  };

  const handleRoomDeletedByHost = () => {
    deletedRef.current = true; // evita el doble aviso del evento WS
    setSettingsOpen(false);
    show("success", "La sala fue eliminada correctamente");
    navigate("/dashboard");
  };

  // ── Cache de perfiles públicos (uid → PublicUser) ─────────────────────
  // Solo nos hace falta como fallback: el backend ya envía `avatar` dentro
  // de los payloads `members` (ack de join_room) y `user_joined`. Si por
  // alguna razón no viniera el avatar (e.g. backend antiguo), lo pedimos
  // a /api/users/:uid una sola vez por uid.
  const [profileCache, setProfileCache] = useState<Record<string, PublicUser>>(
    {}
  );
  const fetchingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    presentMembers.forEach((m) => {
      if (!m.uid || m.uid === user.uid) return;
      if (m.avatar) return; // ya tenemos avatar — no hace falta REST
      if (profileCache[m.uid]) return;
      if (fetchingRef.current.has(m.uid)) return;
      fetchingRef.current.add(m.uid);
      getPublicUser(m.uid)
        .then((profile) =>
          setProfileCache((prev) => ({ ...prev, [m.uid!]: profile }))
        )
        .catch(() => undefined)
        .finally(() => fetchingRef.current.delete(m.uid!));
    });
  }, [presentMembers, user, profileCache]);

  // ── WebRTC: cámara/micrófono reales, mesh P2P y compartir pantalla ─────
  // El hook abre su PROPIO socket contra el Signaling Server (Repo 3,
  // VITE_WEBRTC_URL) y gestiona las RTCPeerConnection con cada peer. La
  // presencia/descubrimiento la hace ese servidor (evento `introduction`),
  // no el socket del chat. Al alternar mic/cam publicamos además el estado
  // por el socket del room-service para que el resto vea los iconos.
  const {
    localStream,
    screenStream,
    remoteStreams,
    remoteMedia,
    micOn,
    camOn,
    screenSharing,
    toggleMic,
    toggleCam,
    toggleScreenShare,
    mediaError,
    mediaErrorKind,
    supported: webrtcSupported,
    mediaStatus,
    signalingStatus,
    peerConnecting,
    peerState,
    retryMedia,
    audioDevices,
    videoDevices,
    selectedMicId,
    selectedCamId,
    switchAudioDevice,
    switchVideoDevice,
  } = useWebRTC({
    roomId,
    identity: user
      ? { uid: user.uid, username: user.username, avatar: user.avatar }
      : null,
    enabled: !!roomId && !!user,
    onLocalMediaChange: publishMediaState,
    // Notificaciones (toasts) de la videollamada.
    onSignalingConnected: () => show("success", "Conexión establecida"),
    onPeerJoined: (name) => show("success", `${name} se unió a la sala`),
    onPeerLeft: (name) => show("info", `${name} salió de la sala`),
  });

  // ── Participantes en pantalla ──────────────────────────────────────────
  // El grid muestra ÚNICAMENTE quienes están actualmente conectados:
  //   1. El propio usuario (siempre).
  //   2. `presentUsers` del socket (sembrados desde el ack de join_room +
  //      actualizados con user_joined / user_left).
  //
  // No usamos `room.participants` (membresía histórica de Firestore) como
  // fuente — eso haría que un usuario que ya salió siga apareciendo en el
  // grid de los demás, que es justo el bug que estamos arreglando.
  //
  // Si `presentUsers` no trae avatar (caso raro: backend antiguo), caemos
  // al `profileCache` que sí lo resuelve vía REST.
  const participants = useMemo(() => {
    const map = new Map<
      string,
      {
        uid: string;
        username: string;
        avatar?: string;
        isOwner?: boolean;
        isYou?: boolean;
        online?: boolean;
      }
    >();

    if (user) {
      map.set(user.uid, {
        uid: user.uid,
        username: user.username || user.displayName || "Tú",
        avatar: user.avatar,
        isOwner: room?.ownerId === user.uid,
        isYou: true,
        online: true,
      });
    }

    // La presencia del chat-service (`presentMembers`) es la fuente principal:
    // es la conexión que realmente refleja quién está conectado. El socket
    // heredado (`presentUsers`) se usa solo para enriquecer avatar/mic/cam por
    // uid cuando está disponible.
    const legacyByUid = new Map(presentUsers.map((p) => [p.uid, p]));
    const myName = user?.username || user?.displayName;

    presentMembers.forEach((m) => {
      // No duplicar al usuario actual (puede venir por uid o por username).
      if (m.uid && m.uid === user?.uid) return;
      if (!m.uid && myName && m.username === myName) return;

      const key = m.uid || `name:${m.username}`;
      if (map.has(key)) return;

      const legacy = m.uid ? legacyByUid.get(m.uid) : undefined;
      const cached = m.uid ? profileCache[m.uid] : undefined;
      map.set(key, {
        uid: m.uid || key,
        username:
          m.username || cached?.username || `Usuario ${(m.uid ?? "").slice(0, 6)}`,
        avatar: m.avatar || legacy?.avatar || cached?.avatar,
        isOwner: !!m.uid && room?.ownerId === m.uid,
        online: true,
      });
    });

    return Array.from(map.values());
  }, [user, room, presentMembers, presentUsers, profileCache]);

  // ── Controles de la barra inferior ─────────────────────────────────────
  const controls: ToggleControl[] = [
    {
      label: micOn ? "Silenciar micrófono" : "Activar micrófono",
      active: micOn,
      isToggle: true,
      onClick: toggleMic,
      icon: micOn ? (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3M8 22h8" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 2l20 20" />
          <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6" />
          <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
        </svg>
      ),
    },
    {
      label: camOn ? "Apagar cámara" : "Encender cámara",
      active: camOn,
      isToggle: true,
      onClick: toggleCam,
      icon: camOn ? (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m23 7-7 5 7 5V7z" />
          <rect width="15" height="14" x="1" y="5" rx="2" ry="2" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34m1 3.66 5 3V7l-5 3M2 2l20 20" />
        </svg>
      ),
    },
    {
      label: screenSharing ? "Dejar de compartir" : "Compartir pantalla",
      active: screenSharing,
      isToggle: false,
      onClick: () => {
        void toggleScreenShare();
      },
      icon: (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      ),
    },
  ];

  // El borde del header se tiñe de ámbar si el chat-service está reconectando.
  const isReconnectingHeader =
    chatStatus === "reconnecting" ||
    chatStatus === "offline" ||
    chatStatus === "error";

  // ── Estado de la videollamada (badge del header + overlays) ─────────────
  // Pantallas de permisos / conexión basadas en el hook useWebRTC.
  const reconnectingCall = signalingStatus === "reconnecting";
  const connectingPeers =
    signalingStatus === "connected" && peerConnecting;
  const callStatus: { tone: "green" | "amber" | "red"; label: string; spin: boolean } =
    !webrtcSupported
      ? { tone: "red", label: "Sin soporte", spin: false }
      : mediaStatus === "requesting"
      ? { tone: "amber", label: "Iniciando dispositivos", spin: true }
      : mediaStatus === "denied"
      ? {
          tone: "red",
          label: mediaErrorKind === "busy" ? "Error AV" : "Sin permisos",
          spin: false,
        }
      : reconnectingCall
      ? { tone: "amber", label: "Reconectando…", spin: true }
      : connectingPeers
      ? { tone: "amber", label: "Conectando…", spin: true }
      : signalingStatus === "connected"
      ? {
          tone: "green",
          label:
            participants.length > 1
              ? `Conectado · ${participants.length} participantes`
              : "Conectado",
          spin: false,
        }
      : { tone: "amber", label: "Conectando…", spin: true };
  // Sin cámara/micrófono no se pueden usar los controles de media.
  const mediaBlocked =
    mediaStatus === "requesting" ||
    mediaStatus === "denied" ||
    mediaStatus === "unsupported";

  // ── Cuadrícula adaptativa (estilo Discord) ──────────────────────────────
  // El grid se ajusta al número REAL de participantes en lugar de un 2x2 fijo
  // con casillas vacías. Así cada cámara ocupa el máximo espacio disponible:
  //   1 → pantalla completa · 2 → apilados en móvil / lado a lado en desktop
  //   3-4 → cuadrícula 2x2. Cada tile rellena su celda (sin huecos).
  const tileCount = participants.length;
  const gridClass =
    tileCount <= 1
      ? "grid-cols-1 grid-rows-1"
      : tileCount === 2
      ? "grid-cols-1 grid-rows-2 sm:grid-cols-2 sm:grid-rows-1"
      : tileCount === 3
      ? "grid-cols-1 grid-rows-3 sm:grid-cols-2 sm:grid-rows-2"
      : "grid-cols-2 grid-rows-2";

  // ── Render ──────────────────────────────────────────────────────────────
  // El anfitrión eliminó la sala: pantalla de cierre de sesión (Tarea 9).
  if (sessionEnded) {
    return (
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center p-6"
      >
        <div
          role="alert"
          className="flex w-full flex-col items-center gap-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-8 text-center"
        >
          <span
            aria-hidden="true"
            className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/15 text-red-400"
          >
            <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18.36 6.64A9 9 0 1 1 5.64 6.64" />
              <line x1="12" y1="2" x2="12" y2="12" />
            </svg>
          </span>
          <div>
            <h1 className="text-xl font-bold text-white">La sesión finalizó</h1>
            <p className="mt-1 text-sm text-slate-400">
              El anfitrión eliminó esta sala. Has sido desconectado.
            </p>
          </div>
          <Button onClick={() => navigate("/dashboard")}>
            Volver al dashboard
          </Button>
        </div>
      </main>
    );
  }

  if (loadError) {
    return (
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center p-6"
      >
        <ErrorState
          kind={loadError.kind}
          title={loadError.title}
          message={loadError.message}
          actionLabel={loadError.retriable ? "Reintentar" : undefined}
          onAction={
            loadError.retriable ? () => setReloadKey((k) => k + 1) : undefined
          }
          secondaryLabel="Volver al dashboard"
          onSecondary={() => navigate("/dashboard")}
        />
      </main>
    );
  }

  // Mientras carga la sala antes de mostrar el grid + chat.
  if (!room) {
    return (
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center p-6"
      >
        <Loader label="Cargando sala" />
      </main>
    );
  }

  return (
    <>
      {/* ── Header ───────────────────────────────────────────────────── */}
      <header
        className={cn(
          "shrink-0 border-b bg-slate-950 transition-colors",
          isReconnectingHeader ? "border-amber-500/30" : "border-slate-800"
        )}
      >
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-2 px-3 py-2 sm:gap-3 sm:px-6 sm:py-3">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <h1 className="min-w-0 truncate text-base font-semibold text-white sm:text-xl">
                {room?.name ?? "Cargando…"}
              </h1>
              {/* Badge único de estado (permisos / conexión / reconexión). */}
              <span className="shrink-0">
                <CallBadge
                  tone={callStatus.tone}
                  label={callStatus.label}
                  spin={callStatus.spin}
                />
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-400">
              {room?.isActive !== false && (
                <span className="text-emerald-400">Sala activa</span>
              )}
              {room?.accessCode && (
                <>
                  <span className="mx-2 text-slate-600">·</span>
                  Código:{" "}
                  <span className="font-mono font-semibold tracking-wider text-slate-200">
                    {room.accessCode}
                  </span>
                </>
              )}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-md bg-slate-800/60 px-2.5 py-1 text-xs text-slate-300 sm:inline-flex">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              {participants.length} participante{participants.length !== 1 ? "s" : ""}
            </span>
            <button
              type="button"
              onClick={() => {
                if (room?.accessCode) {
                  void navigator.clipboard
                    ?.writeText(room.accessCode)
                    .catch(() => undefined);
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="8.5" cy="7" r="4" />
                <line x1="20" y1="8" x2="20" y2="14" />
                <line x1="17" y1="11" x2="23" y2="11" />
              </svg>
              Invitar
            </button>
          </div>
        </div>
      </header>

      {/* Caso "solo audio": la cámara fue denegada pero el micrófono sí.
          Los casos "denegado"/"sin soporte" se muestran como pantalla en el
          área de video (PermissionDeniedPanel), no como banner. */}
      {mediaStatus === "audio-only" && mediaError && (
        <div
          role="alert"
          className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-sm font-medium text-amber-200 sm:px-6"
        >
          {mediaError}
        </div>
      )}

      {/* Tarea 5: aviso de username duplicado (USERNAME_ALREADY_CONNECTED). */}
      {duplicateUsername && (
        <div
          role="alert"
          className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-sm font-medium text-amber-200 sm:px-6"
        >
          Ya estás conectado a esta sala desde otra pestaña o dispositivo.
        </div>
      )}

      {/* Aviso: esta sesión fue reemplazada al abrir la sala en otra pestaña. */}
      {sessionReplaced && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-amber-500/40 bg-amber-500/15 px-4 py-2 text-center text-sm font-medium text-amber-100 sm:px-6"
        >
          <span>
            Abriste esta sala en otra pestaña. Esta sesión del chat se desconectó.
          </span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md bg-amber-400/20 px-3 py-1 font-semibold text-amber-50 underline-offset-2 hover:bg-amber-400/30 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
          >
            Reconectar aquí
          </button>
        </div>
      )}

      {/* ── Tarea 6: participantes conectados (chat-service) ─────────────── */}
      {livePresence.length > 0 && (
        <div className="hidden shrink-0 border-b border-slate-800 bg-slate-950/60 sm:block">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-2 px-4 py-2 sm:px-6">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Conectados:
            </span>
            <ul className="flex flex-wrap items-center gap-1.5">
              {livePresence.map((nombre) => (
                <li
                  key={nombre}
                  className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-100"
                >
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  {nombre}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* ── Cuerpo: video + chat ────────────────────────────────────────── */}
      {/* En móvil es una columna flex que reparte el alto disponible SIN scroll
          de página (todo queda fijo). En desktop pasa a grid de 2 columnas.
          `min-h-0` permite que el chat haga scroll interno en lugar de crecer. */}
      <main
        id="main-content"
        tabIndex={-1}
        className={cn(
          "relative mx-auto flex w-full max-w-[1400px] min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2 sm:gap-4 sm:px-6 sm:py-4",
          "lg:grid lg:grid-rows-1",
          chatVisible ? "lg:grid-cols-[1fr_360px]" : "lg:grid-cols-1"
        )}
      >
        {/* Cuadrícula de video */}
        <section
          aria-labelledby="region-stage"
          className="flex min-h-0 flex-1 flex-col rounded-xl bg-slate-950/60 p-1.5 ring-1 ring-slate-800 sm:rounded-2xl sm:p-3"
        >
          <h2 id="region-stage" className="sr-only">
            Área de video y compartición de pantalla
          </h2>
          {mediaStatus === "requesting" ? (
            <PermissionRequestPanel roomName={room?.name} />
          ) : mediaStatus === "denied" || mediaStatus === "unsupported" ? (
            <PermissionDeniedPanel
              kind={mediaStatus === "unsupported" ? "unsupported" : mediaErrorKind ?? "permission"}
              message={mediaError}
              onRetry={retryMedia}
              onLeave={handleLeave}
            />
          ) : (
          <div className="relative flex min-h-0 flex-1 flex-col">
          <ul className={cn("grid h-full w-full flex-1 gap-1.5 sm:gap-3", gridClass)}>
            {participants.map((p) => {
              // Para el propio usuario usamos el estado local
              // (el toggle inmediato no espera al broadcast). Para los
              // demás, leemos el estado replicado por el socket
              // (default true si aún no llegó nada para ese uid).
              // Estado mic/cam remoto: preferimos el del signaling server
              // (remoteMedia) y caemos al del room-service (mediaStates).
              const remote = remoteMedia[p.uid] ?? mediaStates[p.uid];
                // Stream a pintar: el propio (cámara o pantalla si comparte),
                // o el stream remoto resuelto por socketId.
                const stream = p.isYou
                  ? screenSharing
                    ? screenStream
                    : localStream
                  : remoteStreams[p.uid] ?? null;
                // Al compartir pantalla mostramos siempre el video propio,
                // ignorando el estado de la cámara.
                const tileCameraOff = p.isYou
                  ? !screenSharing && !camOn
                  : remote
                  ? !remote.camOn
                  : false;
                const tileMicOff = p.isYou
                  ? !micOn
                  : remote
                  ? !remote.micOn
                  : false;
                return (
                  <VideoTile
                    key={p.uid}
                    name={p.isYou ? "Tú" : p.username}
                    avatar={p.avatar}
                    isYou={p.isYou}
                    cameraOff={tileCameraOff}
                    micOff={tileMicOff}
                    stream={stream ?? undefined}
                    // El tile propio va silenciado para evitar eco/acople.
                    muted={p.isYou}
                    mirror={p.isYou && !screenSharing}
                    disconnected={
                      !p.isYou &&
                      (peerState[p.uid] === "disconnected" ||
                        peerState[p.uid] === "failed")
                    }
                  />
              );
            })}
          </ul>
          {/* Overlay de conexión / reconexión sobre la cuadrícula. */}
          {(reconnectingCall || connectingPeers) && (
            <CallOverlay reconnecting={reconnectingCall} />
          )}
          </div>
          )}
        </section>

        {/* Panel chat — se abre/cierra con el botón de la barra inferior.
            En móvil es un OVERLAY a pantalla completa sobre el video (no le
            roba alto a las cámaras); en desktop es la columna lateral fija. */}
        {chatVisible && (
          <div
            className={cn(
              "flex min-h-0 min-w-0 flex-col",
              // Móvil: superpuesto sobre el área de video.
              "absolute inset-0 z-30 bg-slate-900 p-2",
              // Desktop: columna del grid, sin overlay.
              "lg:static lg:z-auto lg:h-full lg:flex-1 lg:bg-transparent lg:p-0"
            )}
          >
            <ChatPanel
              currentUid={user?.uid ?? ""}
              messages={chatMessages}
              participants={participants}
              status={chatStatus}
              reconnected={chatReconnected}
              historyStatus={historyStatus}
              onRetryHistory={retryHistory}
              onSend={sendChatMessage}
            />
          </div>
        )}
      </main>

      {/* ── Barra de controles ─────────────────────────────────────────── */}
      <footer className="shrink-0 border-t border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-2 px-2 py-2 sm:gap-3 sm:px-6 sm:py-3">
          <div className="flex items-center gap-1.5 sm:gap-2" role="group" aria-label="Controles de la sala">
            {controls.map((c) => {
              // Toggle apagado (mic/cam silenciados) → rojo normativo
              // para que el usuario y los demás vean el estado al vuelo.
              const offToggleStyle =
                c.isToggle && !c.active
                  ? "border-red-500 bg-red-500/15 text-red-300 hover:bg-red-500/25"
                  : c.active
                  ? "border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700"
                  : "border-slate-700 bg-slate-900 text-slate-400 hover:bg-slate-800";
              return (
                <button
                  key={c.label}
                  type="button"
                  onClick={mediaBlocked ? undefined : c.onClick}
                  disabled={mediaBlocked}
                  aria-label={mediaBlocked ? "Sin acceso" : c.label}
                  aria-pressed={c.active}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                    mediaBlocked
                      ? "cursor-not-allowed border-slate-800 bg-slate-900 text-slate-500 opacity-60"
                      : offToggleStyle
                  )}
                >
                  {c.icon}
                  <span className="hidden sm:inline">
                    {mediaBlocked ? "Sin acceso" : c.label.split(" ")[1] ?? c.label}
                  </span>
                </button>
              );
            })}
            {/* Menú "Más": contiene la configuración de la sala (anfitrión).
                Los ítems son <button> reales → navegables con Tab. */}
            <div className="relative" ref={moreMenuRef}>
              <button
                ref={moreBtnRef}
                type="button"
                aria-label="Más opciones"
                aria-haspopup="menu"
                aria-expanded={moreOpen}
                onClick={() => setMoreOpen((o) => !o)}
                className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm font-medium text-slate-300 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="1" />
                  <circle cx="19" cy="12" r="1" />
                  <circle cx="5" cy="12" r="1" />
                </svg>
                <span className="hidden sm:inline">Más</span>
              </button>

              {moreOpen && (
                <div
                  role="menu"
                  aria-label="Más opciones"
                  className="absolute bottom-full left-0 z-20 mb-2 min-w-[230px] rounded-lg border border-slate-700 bg-slate-900 p-1.5 shadow-xl"
                >
                  {/* Config de dispositivos (mic/cámara) — disponible para
                      todos los participantes, no solo el anfitrión. */}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMoreOpen(false);
                      setDeviceSettingsOpen(true);
                    }}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium text-slate-200 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3M8 22h8" />
                    </svg>
                    <span className="flex flex-col">
                      Configuración de dispositivos
                      <span className="text-xs font-normal text-slate-400">
                        Elegir micrófono y cámara
                      </span>
                    </span>
                  </button>

                  {isHost && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMoreOpen(false);
                        setSettingsOpen(true);
                      }}
                      className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium text-slate-200 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                      </svg>
                      <span className="flex flex-col">
                        Configuración de sala
                        <span className="text-xs font-normal text-slate-400">
                          Editar nombre o eliminar
                        </span>
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Mostrar / ocultar el panel de chat. */}
            <button
              type="button"
              onClick={() => setChatVisible((v) => !v)}
              aria-pressed={chatVisible}
              aria-label={chatVisible ? "Ocultar chat" : "Mostrar chat"}
              className={cn(
                "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                chatVisible
                  ? "border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700"
                  : "border-slate-700 bg-slate-900 text-slate-400 hover:bg-slate-800"
              )}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span className="hidden sm:inline">
                {chatVisible ? "Ocultar chat" : "Mostrar chat"}
              </span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleLeave}
            aria-label="Salir de la sala"
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-md border-2 border-red-500 px-3 py-1.5 sm:px-4",
              "text-sm font-semibold text-red-400 transition-colors",
              "hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            )}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span className="hidden sm:inline">Salir de la sala</span>
          </button>
        </div>
      </footer>

      {/* ── US-07: configuración de sala (editar / eliminar) — anfitrión ── */}
      {isHost && room && (
        <RoomSettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          room={room}
          onUpdated={handleRoomUpdated}
          onDeleted={handleRoomDeletedByHost}
          returnFocusRef={moreBtnRef}
        />
      )}

      {/* ── Configuración individual de dispositivos (mic/cámara) ───────── */}
      <DeviceSettingsModal
        open={deviceSettingsOpen}
        onClose={() => setDeviceSettingsOpen(false)}
        audioDevices={audioDevices}
        videoDevices={videoDevices}
        selectedMicId={selectedMicId}
        selectedCamId={selectedCamId}
        onSelectMic={switchAudioDevice}
        onSelectCam={switchVideoDevice}
        localStream={localStream}
        micOn={micOn}
        returnFocusRef={moreBtnRef}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tiles del grid de video
// ─────────────────────────────────────────────────────────────────────────────

interface VideoTileProps {
  name: string;
  avatar?: string;
  isYou?: boolean;
  cameraOff?: boolean;
  micOff?: boolean;
  /** MediaStream de la cámara/pantalla a renderizar (local o remoto). */
  stream?: MediaStream;
  /** Silenciar el `<video>` (siempre true para el tile propio: evita eco). */
  muted?: boolean;
  /** Espejar horizontalmente (cámara propia, no al compartir pantalla). */
  mirror?: boolean;
  /** El peer perdió la conexión P2P → tile en gris + badge "Desconectado". */
  disconnected?: boolean;
}

function VideoTile({
  name,
  avatar,
  isYou,
  cameraOff,
  micOff,
  stream,
  muted,
  mirror,
  disconnected,
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // `srcObject` no se puede setear como atributo JSX → lo asignamos por ref.
  // Forzamos `play()`: algunos navegadores bloquean el autoplay con audio y,
  // si la promesa se rechaza en silencio, NO se ve ni se escucha al remoto.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.srcObject !== (stream ?? null)) {
      el.srcObject = stream ?? null;
    }
    if (stream) {
      el.play().catch((err) => {
        console.warn(
          `%c[WebRTC]%c No se pudo reproducir el video de ${name}: ${err?.name ?? err}`,
          "color:#f59e0b;font-weight:bold",
          ""
        );
      });
    }
  }, [stream, name]);

  // Mostramos el video cuando hay stream y la cámara no está marcada apagada.
  const showVideo = !!stream && !cameraOff;

  return (
    <li
      aria-label={`Video de ${name}${cameraOff ? " (cámara apagada)" : ""}${
        disconnected ? " (desconectado)" : ""
      }`}
      className={cn(
        "relative flex h-full w-full min-h-0 items-center justify-center overflow-hidden rounded-xl transition",
        showVideo
          ? "bg-slate-950 ring-1 ring-slate-600"
          : cameraOff
          ? "bg-slate-800 ring-1 ring-slate-700"
          : "bg-gradient-to-br from-slate-700 to-slate-900 ring-1 ring-slate-600",
        disconnected && "opacity-60 grayscale"
      )}
    >
      {/* Badge "Desconectado" (top-right) cuando se pierde el P2P. */}
      {disconnected && (
        <span className="absolute right-2 top-2 z-10 inline-flex items-center rounded-md bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
          Desconectado
        </span>
      )}
      {/* El elemento de video siempre está montado (para conservar la
          conexión de la pista); se oculta cuando no hay que mostrarlo.
          Sin <track>: es video en vivo (cámara/pantalla), no hay subtítulos. */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className={cn(
          "absolute inset-0 h-full w-full bg-slate-950 object-cover",
          // El video propio se espeja (sensación de "espejo"), salvo al
          // compartir pantalla, donde el espejo confundiría.
          mirror && "scale-x-[-1]",
          showVideo ? "block" : "hidden"
        )}
      />

      {!showVideo &&
        (avatar ? (
          <img
            src={avatar}
            alt=""
            aria-hidden="true"
            className={cn(
              "h-24 w-24 rounded-full object-cover ring-4 ring-slate-900/40 sm:h-32 sm:w-32",
              cameraOff && "opacity-50 grayscale"
            )}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <Avatar name={name} size="xl" className="ring-4 ring-slate-900/40" />
        ))}

      {/* Etiqueta nombre (top-left) */}
      <span className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-md bg-slate-950/70 px-2 py-0.5 text-xs font-medium text-slate-100 backdrop-blur">
        {isYou && (
          <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
        )}
        {name}
      </span>

      {/* Estado mic (bottom-right) */}
      <span
        className={cn(
          "absolute bottom-2 right-2 inline-flex h-7 w-7 items-center justify-center rounded-full",
          micOff ? "bg-red-500/90 text-white" : "bg-slate-900/70 text-slate-200"
        )}
        aria-hidden="true"
      >
        {micOff ? (
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 2l20 20" />
            <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="2" width="6" height="13" rx="3" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" />
          </svg>
        )}
      </span>
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Badge de estado de la videollamada (header)
// ─────────────────────────────────────────────────────────────────────────────

const BADGE_TONES: Record<"green" | "amber" | "red", { dot: string; text: string; ring: string }> = {
  green: { dot: "bg-emerald-500", text: "text-emerald-400", ring: "" },
  amber: { dot: "bg-amber-400", text: "text-amber-400", ring: "ring-2 ring-amber-300/40 animate-pulse" },
  red: { dot: "bg-red-500", text: "text-red-400", ring: "" },
};

function CallBadge({
  tone,
  label,
  spin,
}: {
  tone: "green" | "amber" | "red";
  label: string;
  spin: boolean;
}) {
  const t = BADGE_TONES[tone];
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-2 rounded-full bg-slate-900/70 px-3 py-1 text-sm font-semibold",
        t.text
      )}
    >
      {spin ? (
        <span
          aria-hidden="true"
          className="inline-block h-3 w-3 rounded-full border-2 border-current border-r-transparent animate-spin"
        />
      ) : (
        <span aria-hidden="true" className={cn("inline-block h-2.5 w-2.5 rounded-full", t.dot, t.ring)} />
      )}
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Overlay sobre la cuadrícula: conectando participantes / reconectando
// ─────────────────────────────────────────────────────────────────────────────

function CallOverlay({ reconnecting }: { reconnecting: boolean }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-xl bg-slate-950/70 backdrop-blur-sm"
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-block h-10 w-10 rounded-full border-4 border-r-transparent animate-spin",
          reconnecting ? "border-amber-400" : "border-blue-400"
        )}
      />
      <p className="text-base font-semibold text-white">
        {reconnecting ? "Reconectando…" : "Conectando participantes…"}
      </p>
      <p className="text-sm text-slate-300">
        {reconnecting
          ? "Recuperando la conexión automáticamente"
          : "Esto puede tomar unos segundos"}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pantalla: solicitar permisos de cámara/micrófono
// ─────────────────────────────────────────────────────────────────────────────

function PermissionRequestPanel({ roomName }: { roomName?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <div aria-hidden="true" className="text-4xl">🎥 🎤</div>
      <h3 className="text-lg font-bold text-white sm:text-xl">
        Necesitamos acceso a tu cámara y micrófono
      </h3>
      <p className="max-w-sm text-sm text-slate-400">
        {roomName ? `${roomName} necesita` : "La sala necesita"} estos permisos
        para que puedas participar. Haz clic en{" "}
        <span className="font-semibold text-slate-200">“Permitir”</span> cuando
        el navegador lo solicite.
      </p>
      <span className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-3 py-1 text-sm font-medium text-amber-300">
        <span className="inline-block h-3 w-3 rounded-full border-2 border-current border-r-transparent animate-spin" />
        Esperando permisos…
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pantalla: permisos denegados (o navegador sin soporte)
// ─────────────────────────────────────────────────────────────────────────────

function PermissionDeniedPanel({
  kind,
  message,
  onRetry,
  onLeave,
}: {
  kind: Exclude<MediaErrorKind, null>;
  message: string | null;
  onRetry: () => void;
  onLeave: () => void;
}) {
  const unsupported = kind === "unsupported";
  // Título + ícono + texto por tipo de fallo (Tarea 5).
  const { icon, title, fallback } =
    kind === "unsupported"
      ? {
          icon: "🚫",
          title: "Navegador no compatible",
          fallback:
            "Tu navegador no soporta WebRTC. Usa un navegador moderno (Chrome, Edge o Firefox) para participar.",
        }
      : kind === "busy"
      ? {
          icon: "⚠️",
          title: "Dispositivos multimedia ocupados",
          fallback:
            "Tu cámara o micrófono está siendo usado por otra aplicación. Cierra Zoom, Teams u otras videollamadas activas.",
        }
      : kind === "notfound"
      ? {
          icon: "🎥",
          title: "Sin cámara ni micrófono",
          fallback:
            "No se encontró ninguna cámara ni micrófono conectados a este dispositivo.",
        }
      : {
          icon: "🚫",
          title: "Permisos denegados",
          fallback:
            "Para participar en la sala necesitas habilitar el acceso a la cámara y micrófono desde la configuración de tu navegador.",
        };

  return (
    <div
      role="alert"
      className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center"
    >
      <span
        aria-hidden="true"
        className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/15 text-3xl"
      >
        {icon}
      </span>
      <h3 className="text-lg font-bold text-red-400 sm:text-xl">{title}</h3>
      <p className="max-w-sm text-sm text-slate-400">{message || fallback}</p>

      {/* Ayuda de permisos del navegador (solo cuando el problema es de
          permisos; no aplica si el dispositivo está ocupado o no hay soporte). */}
      {kind === "permission" && (
        <div className="max-w-sm rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-left text-xs text-slate-300">
          <p className="mb-1">
            <span className="font-semibold text-slate-100">Chrome:</span> 🔒 en
            la barra de URL → Permisos del sitio
          </p>
          <p className="mb-1">
            <span className="font-semibold text-slate-100">Firefox:</span> ⓘ en
            la barra de URL → Más información
          </p>
          <p>
            <span className="font-semibold text-slate-100">Safari:</span>{" "}
            Preferencias → Sitios web → Cámara
          </p>
        </div>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        {!unsupported && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center justify-center rounded-md bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          >
            {kind === "busy" ? "Reintentar" : "Reintentar tras habilitar"}
          </button>
        )}
        <button
          type="button"
          onClick={onLeave}
          className="inline-flex items-center justify-center rounded-md border border-slate-700 px-5 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          Salir de la sala
        </button>
      </div>
    </div>
  );
}
