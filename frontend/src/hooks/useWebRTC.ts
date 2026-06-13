/**
 * @file useWebRTC — Video/audio en tiempo real y compartir pantalla (mesh P2P).
 *
 * Topología: **malla completa** (full mesh). Cada par de participantes abre
 * una `RTCPeerConnection` directa. Es la opción correcta para salas pequeñas
 * (el grid es 2x2 → ≤4 personas); por encima de ~5-6 conviene un SFU.
 *
 * Señalización: viaja por el **Signaling Server WebRTC** (Repositorio 3), un
 * servicio independiente (`VITE_WEBRTC_URL`). Contrato:
 *   - emitimos `introduction { roomId, uid, username, avatar }` al conectar;
 *   - el server nos responde `introduction { peers }` (quién está conectado) y
 *     avisa a los demás (quién entra);
 *   - `signal { to, signal }` transporta offer/answer/ICE (el server lo
 *     reenvía sin tocar) → llega como `signal { from, signal }`;
 *   - `peer-left { socketId }` cuando alguien se va.
 *
 * Negociación: patrón **"perfect negotiation"** (MDN). El peer con el socketId
 * mayor inicia la oferta; las colisiones se resuelven con roles polite/impolite
 * según el socketId. Esto permite renegociar (al compartir pantalla) sin glare.
 *
 * El estado mic/cam se sigue publicando por el socket del room-service (lo hace
 * RoomPage vía `onLocalMediaChange`); aquí solo habilitamos/inhabilitamos las
 * pistas locales.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { createWebrtcSocket } from "@/services/webrtcSocket";
import {
  createPeerConnection,
  isWebRTCSupported,
  logIceConfig,
  rtcLog,
  rtcWarn,
} from "@/services/webrtcService";

interface PeerInfo {
  socketId: string;
  uid?: string;
  username?: string;
  avatar?: string;
  micOn?: boolean;
  camOn?: boolean;
}
interface IntroductionEvent {
  roomId: string;
  self: string;
  peers: PeerInfo[];
}
interface SignalEvent {
  from: string;
  signal: RTCSessionDescriptionInit | RTCIceCandidateInit;
}
interface PeerLeftEvent {
  socketId: string;
  uid?: string;
  roomId: string;
}

/** Estado interno de cada conexión con un peer remoto (Tarea 7). */
interface PeerCtx {
  /** socketId del peer (clave del mapa `peers`). */
  socketId: string;
  pc: RTCPeerConnection;
  /** Rol para resolver colisiones de oferta (perfect negotiation). */
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  /** uid del peer (clave con la que se expone su stream a la UI). */
  uid?: string;
  /** Estado de la conexión P2P (new → connecting → connected → …). */
  connectionState: RTCPeerConnectionState;
}

export interface WebRTCIdentity {
  uid: string;
  username?: string;
  avatar?: string;
}

/** Estado del acceso a cámara/micrófono (para las pantallas de permisos). */
export type MediaStatus =
  | "idle"
  | "unsupported"
  | "requesting"
  | "granted"
  | "audio-only"
  | "denied";

/** Estado del socket de señalización (para el badge del header). */
export type SignalingStatus = "connecting" | "connected" | "reconnecting";

export interface UseWebRTCOptions {
  roomId: string | undefined;
  /** Identidad local que se anuncia en `introduction`. */
  identity: WebRTCIdentity | null;
  /** Arrancar (pedir cámara/micro). Falso = sala en modo solo-lectura. */
  enabled: boolean;
  /** Se invoca cuando el usuario alterna mic/cam (para publicar presencia). */
  onLocalMediaChange?: (state: { micOn: boolean; camOn: boolean }) => void;
  /** Un participante entró a la sala (para notificación "X se unió"). */
  onPeerJoined?: (name: string) => void;
  /** Un participante salió (para notificación "X salió"). */
  onPeerLeft?: (name: string) => void;
  /** Se estableció la conexión P2P con un peer. */
  onPeerConnected?: (name: string) => void;
  /** El socket de señalización se conectó por primera vez. */
  onSignalingConnected?: () => void;
}

export interface UseWebRTCResult {
  /** Cámara + micrófono local (para el tile propio). */
  localStream: MediaStream | null;
  /** Pantalla compartida local (si está activa). */
  screenStream: MediaStream | null;
  /** Stream remoto por uid del participante. */
  remoteStreams: Record<string, MediaStream>;
  /** Estado mic/cam remoto por uid (sincronizado vía `media-state`). */
  remoteMedia: Record<string, { micOn: boolean; camOn: boolean }>;
  micOn: boolean;
  camOn: boolean;
  screenSharing: boolean;
  toggleMic: () => void;
  toggleCam: () => void;
  toggleScreenShare: () => Promise<void>;
  /** Mensaje legible si no se pudo obtener cámara/micrófono. */
  mediaError: string | null;
  /** `false` si el navegador no soporta WebRTC (Tarea 2). */
  supported: boolean;
  /** Estado del acceso a cámara/micrófono (pantallas de permisos). */
  mediaStatus: MediaStatus;
  /** Estado del socket de señalización (badge del header). */
  signalingStatus: SignalingStatus;
  /** `true` si hay peers cuya conexión P2P aún se está estableciendo. */
  peerConnecting: boolean;
  /** Estado de la conexión P2P por uid (para marcar tiles "Desconectado"). */
  peerState: Record<string, RTCPeerConnectionState>;
  /** Reintenta pedir cámara/micrófono (botón "Reintentar tras habilitar"). */
  retryMedia: () => void;
  /** Micrófonos disponibles (config individual de dispositivos). */
  audioDevices: MediaDeviceInfo[];
  /** Cámaras disponibles (config individual de dispositivos). */
  videoDevices: MediaDeviceInfo[];
  /** deviceId del micrófono actualmente en uso (o null). */
  selectedMicId: string | null;
  /** deviceId de la cámara actualmente en uso (o null). */
  selectedCamId: string | null;
  /** Cambia el micrófono en vivo (replaceTrack en los peers). */
  switchAudioDevice: (deviceId: string) => Promise<void>;
  /** Cambia la cámara en vivo (replaceTrack en los peers). */
  switchVideoDevice: (deviceId: string) => Promise<void>;
}

/** Discrimina un payload de señal SDP (offer/answer) de un candidato ICE. */
const isSdp = (
  signal: RTCSessionDescriptionInit | RTCIceCandidateInit
): signal is RTCSessionDescriptionInit =>
  typeof (signal as RTCSessionDescriptionInit).type === "string";

// ─── Selección de dispositivos (config individual por persona) ───────────────
// Cada persona elige qué micrófono/cámara usar; la elección se guarda en
// localStorage del navegador y se reaplica al volver a entrar a una sala.
const MIC_STORAGE_KEY = "studyhub:webrtc:micId";
const CAM_STORAGE_KEY = "studyhub:webrtc:camId";

const readStoredDevice = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const writeStoredDevice = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* localStorage no disponible (modo privado): la elección no persiste */
  }
};

/** Constraints de audio respetando el micrófono elegido (si hay). */
const buildAudioConstraint = (
  micId: string | null
): MediaTrackConstraints | boolean => (micId ? { deviceId: { exact: micId } } : true);

/** Constraints de video respetando la cámara elegida (si hay). */
const buildVideoConstraint = (camId: string | null): MediaTrackConstraints =>
  camId
    ? { deviceId: { exact: camId }, width: { ideal: 1280 }, height: { ideal: 720 } }
    : { width: { ideal: 1280 }, height: { ideal: 720 } };

export function useWebRTC({
  roomId,
  identity,
  enabled,
  onLocalMediaChange,
  onPeerJoined,
  onPeerLeft,
  onPeerConnected,
  onSignalingConnected,
}: UseWebRTCOptions): UseWebRTCResult {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<
    Record<string, MediaStream>
  >({});
  const [remoteMedia, setRemoteMedia] = useState<
    Record<string, { micOn: boolean; camOn: boolean }>
  >({});
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  // Pasa a true cuando el intento de getUserMedia termina (con éxito o no),
  // momento en el que el socket de señalización puede arrancar.
  const [mediaReady, setMediaReady] = useState(false);
  // Tarea 2 — soporte del navegador (se evalúa una vez).
  const supported = isWebRTCSupported();

  // Estados para las pantallas de permisos / conexión / reconexión.
  const [mediaStatus, setMediaStatus] = useState<MediaStatus>(
    supported ? "idle" : "unsupported"
  );
  const [signalingStatus, setSignalingStatus] =
    useState<SignalingStatus>("connecting");
  const [peerState, setPeerState] = useState<
    Record<string, RTCPeerConnectionState>
  >({});
  // Permite reintentar getUserMedia (botón "Reintentar tras habilitar").
  const [retryKey, setRetryKey] = useState(0);
  const retryMedia = useCallback(() => setRetryKey((k) => k + 1), []);

  // ── Config individual de dispositivos (mic/cámara) ──────────────────────
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  // Inicializamos con la última elección guardada (config persistente por
  // persona). Tras obtener el stream lo ajustamos al dispositivo real en uso.
  const [selectedMicId, setSelectedMicId] = useState<string | null>(() =>
    readStoredDevice(MIC_STORAGE_KEY)
  );
  const [selectedCamId, setSelectedCamId] = useState<string | null>(() =>
    readStoredDevice(CAM_STORAGE_KEY)
  );
  // Refs para leer la elección dentro del efecto de getUserMedia sin que un
  // cambio de dispositivo vuelva a re-pedir todo el stream (eso lo hace
  // switchAudio/VideoDevice con replaceTrack, sin reconectar).
  const selectedMicIdRef = useRef(selectedMicId);
  selectedMicIdRef.current = selectedMicId;
  const selectedCamIdRef = useRef(selectedCamId);
  selectedCamIdRef.current = selectedCamId;

  // Lista de dispositivos disponibles (etiquetas visibles tras conceder
  // permisos). Se refresca al conectar y ante `devicechange`.
  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setAudioDevices(list.filter((d) => d.kind === "audioinput"));
      setVideoDevices(list.filter((d) => d.kind === "videoinput"));
    } catch {
      /* sin permisos aún: la lista quedará vacía */
    }
  }, []);

  // Callbacks de notificación estables (no recrean efectos/listeners).
  const onPeerJoinedRef = useRef(onPeerJoined);
  onPeerJoinedRef.current = onPeerJoined;
  const onPeerLeftRef = useRef(onPeerLeft);
  onPeerLeftRef.current = onPeerLeft;
  const onPeerConnectedRef = useRef(onPeerConnected);
  onPeerConnectedRef.current = onPeerConnected;
  const onSignalingConnectedRef = useRef(onSignalingConnected);
  onSignalingConnectedRef.current = onSignalingConnected;
  // Evita disparar "Conexión establecida" más de una vez por sesión.
  const signaledConnectedRef = useRef(false);

  const socketRef = useRef<Socket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const peersRef = useRef<Map<string, PeerCtx>>(new Map());
  /** socketId → uid, sembrado en `introduction` antes de llegar los `signal`. */
  const uidBySocketRef = useRef<Map<string, string>>(new Map());
  /** Estado de medios local actual (para anunciarlo en introduction/toggles). */
  const mediaStateRef = useRef({ micOn: true, camOn: true });
  /** Motivo de error de medios pendiente de reportar al server al conectar. */
  const mediaErrorRef = useRef<string | null>(null);
  /** Permisos concedidos por getUserMedia, a reportar al conectar (Tarea 3). */
  const permissionsRef = useRef<{ audio: boolean; video: boolean } | null>(null);

  // Callbacks/identidad estables para no recrear listeners en cada render.
  const onMediaChangeRef = useRef(onLocalMediaChange);
  onMediaChangeRef.current = onLocalMediaChange;
  const identityRef = useRef(identity);
  identityRef.current = identity;

  // Emite el estado mic/cam al signaling server (Tarea 3), si hay socket.
  const emitMediaState = useCallback((state: { micOn: boolean; camOn: boolean }) => {
    const s = socketRef.current;
    if (s && s.connected) s.emit("media-state", state);
  }, []);

  // ── Quitar el stream remoto asociado a un uid ───────────────────────────
  const dropRemoteStream = useCallback((uid?: string) => {
    if (!uid) return;
    setRemoteStreams((prev) => {
      if (!(uid in prev)) return prev;
      const next = { ...prev };
      delete next[uid];
      return next;
    });
  }, []);

  // ── Teardown de un peer concreto (por socketId) ─────────────────────────
  const closePeer = useCallback(
    (socketId: string) => {
      const ctx = peersRef.current.get(socketId);
      if (!ctx) return;
      ctx.pc.onicecandidate = null;
      ctx.pc.ontrack = null;
      ctx.pc.onnegotiationneeded = null;
      ctx.pc.onconnectionstatechange = null;
      ctx.pc.oniceconnectionstatechange = null;
      ctx.pc.onicegatheringstatechange = null;
      ctx.pc.onsignalingstatechange = null;
      ctx.pc.onicecandidateerror = null;
      try {
        ctx.pc.close();
      } catch {
        /* noop */
      }
      peersRef.current.delete(socketId);
      uidBySocketRef.current.delete(socketId);
      dropRemoteStream(ctx.uid);
      if (ctx.uid) {
        setPeerState((prev) => {
          if (!(ctx.uid! in prev)) return prev;
          const next = { ...prev };
          delete next[ctx.uid!];
          return next;
        });
      }
    },
    [dropRemoteStream]
  );

  // ── Crear (o devolver) la conexión con un peer ─────────────────────────
  const ensurePeer = useCallback(
    (remoteSocketId: string, uid?: string): PeerCtx | null => {
      const existing = peersRef.current.get(remoteSocketId);
      if (existing) {
        if (uid && !existing.uid) existing.uid = uid;
        return existing;
      }

      const socket = socketRef.current;
      const localSocketId = socket?.id;
      if (!socket || !localSocketId) return null;

      const pc = createPeerConnection();
      // El peer con el id "menor" es el polite (cede ante colisiones).
      const ctx: PeerCtx = {
        socketId: remoteSocketId,
        pc,
        polite: localSocketId < remoteSocketId,
        makingOffer: false,
        ignoreOffer: false,
        uid,
        connectionState: pc.connectionState,
      };
      peersRef.current.set(remoteSocketId, ctx);
      // Etiqueta legible del peer para los logs (uid si lo conocemos).
      const peerLabel = () => ctx.uid ?? remoteSocketId;
      rtcLog(
        `RTCPeerConnection creada con ${peerLabel()} ` +
          `(rol: ${ctx.polite ? "polite" : "impolite"})`
      );

      // Adjuntar las pistas locales actuales (cámara+micro). Si ya estamos
      // compartiendo pantalla, sustituimos la pista de video por la pantalla.
      const ls = localStreamRef.current;
      if (ls) {
        const tracks = ls.getTracks();
        tracks.forEach((track) => pc.addTrack(track, ls));
        rtcLog(
          `Pistas locales adjuntadas → ${peerLabel()}: ` +
            tracks
              .map((t) => `${t.kind}(${t.enabled ? "on" : "off"})`)
              .join(", ") || "ninguna"
        );
        if (screenTrackRef.current) {
          const sender = pc
            .getSenders()
            .find((s) => s.track?.kind === "video");
          sender?.replaceTrack(screenTrackRef.current).catch(() => undefined);
        }
      } else {
        rtcWarn(
          `Sin stream local al crear el peer ${peerLabel()}: solo recibirás ` +
            "media (no podrás enviar audio/video)."
        );
      }

      pc.onnegotiationneeded = async () => {
        try {
          ctx.makingOffer = true;
          await pc.setLocalDescription();
          socket.emit("signal", {
            to: remoteSocketId,
            signal: pc.localDescription,
          });
          rtcLog(`Offer enviada → ${ctx.uid ?? remoteSocketId}`);
        } catch {
          /* la renegociación reintentará */
        } finally {
          ctx.makingOffer = false;
        }
      };

      pc.onicecandidate = ({ candidate }) => {
        if (candidate) {
          socket.emit("signal", {
            to: remoteSocketId,
            signal: candidate.toJSON(),
          });
          // El TIPO de candidato es clave para diagnosticar NAT:
          //   host  = misma red/local · srflx = vía STUN (IP pública)
          //   relay = vía TURN (necesario tras NAT simétrica).
          rtcLog(
            `ICE enviado → ${peerLabel()} [${candidate.type ?? "?"}]`,
            candidate.candidate
          );
        } else {
          rtcLog(`ICE gathering completo → ${peerLabel()}`);
        }
      };

      // Errores al obtener candidatos (p. ej. TURN rechaza credenciales: 401/
      // 701). Aquí se ve si el TURN no autentica → no habrá candidato relay.
      pc.onicecandidateerror = (e: RTCPeerConnectionIceErrorEvent) => {
        rtcWarn(
          `ICE candidate error (${peerLabel()}): code=${e.errorCode} ` +
            `"${e.errorText}" url=${e.url}`
        );
      };

      pc.oniceconnectionstatechange = () => {
        const st = pc.iceConnectionState;
        rtcLog(`ICE connection (${peerLabel()}): ${st}`);
        if (st === "failed") {
          rtcWarn(
            `ICE FALLÓ con ${peerLabel()}: no se pudo establecer ruta P2P. ` +
              "Probable NAT sin TURN, o TURN con credenciales vencidas."
          );
        }
      };

      pc.onicegatheringstatechange = () =>
        rtcLog(`ICE gathering (${peerLabel()}): ${pc.iceGatheringState}`);

      pc.onsignalingstatechange = () =>
        rtcLog(`Signaling (${peerLabel()}): ${pc.signalingState}`);

      pc.ontrack = ({ track, streams }) => {
        const [stream] = streams;
        // Si el uid aún no estaba sembrado, lo recuperamos del mapa socket→uid.
        const key = ctx.uid ?? uidBySocketRef.current.get(remoteSocketId);
        if (key && !ctx.uid) ctx.uid = key;
        rtcLog(
          `Track remoto recibido de ${key ?? remoteSocketId}: ` +
            `${track.kind} (enabled=${track.enabled}, muted=${track.muted})`
        );
        if (!stream) {
          rtcWarn(`Track ${track.kind} sin stream asociado de ${peerLabel()}`);
          return;
        }
        if (!key) {
          rtcWarn(
            `Track de ${remoteSocketId} sin uid: no se puede asociar al tile ` +
              "(se reintentará al sembrar el uid)."
          );
          return;
        }
        setRemoteStreams((prev) => ({ ...prev, [key]: stream }));
      };

      pc.onconnectionstatechange = () => {
        const st = pc.connectionState;
        ctx.connectionState = st; // Tarea 7 — guardamos el estado del peer.
        // Espejamos el estado por uid para que la UI marque "Desconectado" /
        // muestre el overlay "Conectando participantes…".
        if (ctx.uid) {
          setPeerState((prev) => ({ ...prev, [ctx.uid!]: st }));
        }
        // Reportar al signaling server: conexión establecida / fallo /
        // interrupción (Tarea 1: registro de fallos de conexión WebRTC).
        const s = socketRef.current;
        if (
          s?.connected &&
          (st === "connected" || st === "failed" || st === "disconnected")
        ) {
          s.emit("connection-state", {
            peerUid: ctx.uid,
            peerSocketId: remoteSocketId,
            state: st,
          });
        }
        const who = ctx.uid ?? remoteSocketId;
        if (st === "connected") {
          rtcLog(`P2P establecida con ${who}`);
          onPeerConnectedRef.current?.(who);
        } else if (st === "failed") rtcLog(`Fallo de conexión P2P con ${who}`);
        else if (st === "disconnected") rtcLog(`Conexión P2P interrumpida con ${who}`);
        if (st === "failed" || st === "closed") {
          closePeer(remoteSocketId);
        }
      };

      return ctx;
    },
    [closePeer]
  );

  // ── Efecto 1: obtener cámara/micrófono ─────────────────────────────────
  useEffect(() => {
    if (!enabled || !roomId) return;
    // Tarea 2 — sin soporte de WebRTC no seguimos; mostramos el aviso.
    if (!supported) {
      rtcLog("Tu navegador no soporta WebRTC");
      setMediaStatus("unsupported");
      setMediaError("Tu navegador no soporta WebRTC");
      return;
    }
    let cancelled = false;

    (async () => {
      // Mientras el navegador muestra el diálogo de permisos.
      setMediaError(null);
      setMediaStatus("requesting");
      let stream: MediaStream | null = null;
      try {
        // Respetamos el micrófono/cámara elegidos por esta persona (si los
        // hay). Si el dispositivo guardado ya no existe, reintentamos con los
        // predeterminados antes de caer a "solo audio".
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: buildAudioConstraint(selectedMicIdRef.current),
            video: buildVideoConstraint(selectedCamIdRef.current),
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          });
        }
        if (!cancelled) setMediaStatus("granted");
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false,
          });
          if (!cancelled) {
            setCamOn(false);
            setMediaStatus("audio-only");
            mediaStateRef.current.camOn = false;
            onMediaChangeRef.current?.({ micOn: true, camOn: false });
            mediaErrorRef.current = "camara_denegada";
            setMediaError(
              "No se pudo acceder a la cámara. Continúas solo con audio."
            );
          }
        } catch {
          if (!cancelled) {
            setMediaStatus("denied");
            mediaErrorRef.current = "camara_y_microfono_denegados";
            setMediaError(
              "No se pudo acceder a la cámara ni al micrófono. Revisa los permisos del navegador."
            );
          }
        }
      }

      if (cancelled) {
        stream?.getTracks().forEach((t) => t.stop());
        return;
      }
      if (stream) {
        localStreamRef.current = stream;
        cameraTrackRef.current = stream.getVideoTracks()[0] ?? null;
        // Permisos realmente concedidos (audio-only fallback → video:false).
        permissionsRef.current = {
          audio: stream.getAudioTracks().length > 0,
          video: stream.getVideoTracks().length > 0,
        };
        setLocalStream(stream);
        // Sincronizamos la selección con el dispositivo REALMENTE en uso
        // (puede diferir del guardado si ya no existe) para que la config
        // muestre el micrófono/cámara activos, y enumeramos los disponibles.
        const usedMic = stream.getAudioTracks()[0]?.getSettings().deviceId;
        const usedCam = stream.getVideoTracks()[0]?.getSettings().deviceId;
        if (usedMic) setSelectedMicId(usedMic);
        if (usedCam) setSelectedCamId(usedCam);
        void refreshDevices();
      }
      // El intento terminó (con o sin media): el socket ya puede arrancar.
      setMediaReady(true);
    })();

    return () => {
      cancelled = true;
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      cameraTrackRef.current = null;
      screenTrackRef.current?.stop();
      screenTrackRef.current = null;
      mediaErrorRef.current = null;
      permissionsRef.current = null;
      mediaStateRef.current = { micOn: true, camOn: true };
      setLocalStream(null);
      setScreenStream(null);
      setScreenSharing(false);
      setMediaReady(false);
    };
  }, [enabled, roomId, supported, retryKey, refreshDevices]);

  // ── Efecto: refrescar la lista ante conexión/desconexión de dispositivos ─
  useEffect(() => {
    if (!supported || !navigator.mediaDevices?.addEventListener) return;
    const handler = () => void refreshDevices();
    navigator.mediaDevices.addEventListener("devicechange", handler);
    return () =>
      navigator.mediaDevices.removeEventListener("devicechange", handler);
  }, [supported, refreshDevices]);

  // ── Efecto 2: socket de señalización + ciclo de vida de la malla ───────
  // Arranca cuando el intento de media terminó (`mediaReady`): si hubo stream,
  // las pistas ya están listas para adjuntarse; si no, entramos en modo
  // recepción (recvonly) y reportamos `media-error`.
  useEffect(() => {
    if (!enabled || !roomId || !mediaReady) return;
    const id = identityRef.current;
    if (!id) return;

    // Diagnóstico: imprime la config ICE/TURN al iniciar la llamada.
    logIceConfig();
    rtcLog("Stream local al iniciar señalización", {
      tieneStream: !!localStreamRef.current,
      audio: localStreamRef.current?.getAudioTracks().length ?? 0,
      video: localStreamRef.current?.getVideoTracks().length ?? 0,
    });

    const socket = createWebrtcSocket();
    socketRef.current = socket;

    const introduce = () => {
      const { micOn: m, camOn: c } = mediaStateRef.current;
      // Anunciamos quién somos y nuestro estado de medios actual.
      socket.emit("introduction", {
        roomId,
        uid: id.uid,
        username: id.username,
        avatar: id.avatar,
        micOn: m,
        camOn: c,
      });
      rtcLog("Introduction enviada", { roomId });
      // Permisos concedidos (Tarea 3), evidencia de stream listo, o error.
      if (permissionsRef.current) {
        socket.emit("permissions-granted", permissionsRef.current);
      }
      if (localStreamRef.current) socket.emit("stream-started");
      if (mediaErrorRef.current) {
        socket.emit("media-error", { reason: mediaErrorRef.current });
      }
    };

    // "Juan conectado" — nuestra conexión al signaling server (Tarea 1/demo).
    const onConnect = () => {
      rtcLog(`${id.username ?? "Tú"} conectado`, socket.id);
      setSignalingStatus("connected");
      if (!signaledConnectedRef.current) {
        signaledConnectedRef.current = true;
        onSignalingConnectedRef.current?.();
      }
      introduce();
    };

    // Reconexión: el socket cayó (no por cierre voluntario) o reintenta.
    const onDisconnect = (reason: string) => {
      if (reason === "io client disconnect") return;
      setSignalingStatus("reconnecting");
    };
    const onReconnectAttempt = () => setSignalingStatus("reconnecting");

    // Notificaciones de entrada/salida (participant_joined/left del server).
    const onParticipantJoined = (p: { username?: string }) => {
      if (p?.username) onPeerJoinedRef.current?.(p.username);
    };
    const onParticipantLeft = (p: { username?: string }) => {
      if (p?.username) onPeerLeftRef.current?.(p.username);
    };

    // `introduction` (server → cliente): lista de peers. Para cada peer, el
    // de socketId mayor inicia la conexión; el otro espera la oferta.
    //
    // IMPORTANTE: usamos NUESTRO propio `socket.id` como "self", NO el `self`
    // del payload. Cuando el server avisa a los que YA estaban sobre un nuevo
    // peer, manda `self = id del recién llegado` (no el del receptor). Si
    // confiáramos en ese `self`, el peer existente vería `p.socketId === self`
    // y se saltaría la conexión → la llamada solo cuajaba ~50% de las veces
    // según el orden de los ids. Con el id local, ambos lados evalúan la MISMA
    // comparación y exactamente uno inicia la oferta.
    const onIntroduction = ({ peers }: IntroductionEvent) => {
      const selfId = socket.id;
      if (!selfId) return;
      peers.forEach((p) => {
        if (!p.socketId || p.socketId === selfId) return;
        // Log de "Ana conectada" la primera vez que vemos a este peer.
        const known =
          uidBySocketRef.current.has(p.socketId) ||
          peersRef.current.has(p.socketId);
        if (!known) rtcLog(`${p.username ?? p.socketId} conectada`);
        // Sembrar el uid para todos (también para el lado que espera la
        // oferta, así puede asociar el stream cuando llegue por `signal`).
        if (p.uid) uidBySocketRef.current.set(p.socketId, p.uid);
        // Sembrar el estado mic/cam inicial del peer (Tarea 3).
        if (p.uid && (typeof p.micOn === "boolean" || typeof p.camOn === "boolean")) {
          setRemoteMedia((prev) => ({
            ...prev,
            [p.uid!]: { micOn: p.micOn ?? true, camOn: p.camOn ?? true },
          }));
        }
        const ctx = peersRef.current.get(p.socketId);
        if (ctx) {
          if (p.uid && !ctx.uid) ctx.uid = p.uid;
          return;
        }
        if (selfId > p.socketId) {
          // Somos el impolite (id mayor) → iniciamos nosotros la conexión.
          ensurePeer(p.socketId, p.uid);
        }
        // Si somos el menor, esperamos su oferta (creamos el peer al recibir
        // el primer `signal`, ya con el uid sembrado arriba).
      });
    };

    // `signal` (server → cliente): offer/answer/ICE reenviado por el server.
    const onSignal = async ({ from, signal }: SignalEvent) => {
      const ctx = ensurePeer(from, uidBySocketRef.current.get(from));
      if (!ctx) return;
      const { pc } = ctx;
      try {
        if (isSdp(signal)) {
          const collision =
            signal.type === "offer" &&
            (ctx.makingOffer || pc.signalingState !== "stable");
          ctx.ignoreOffer = !ctx.polite && collision;
          if (ctx.ignoreOffer) return;
          const peerName = ctx.uid ?? from;
          if (signal.type === "offer") rtcLog(`Offer recibida ← ${peerName}`);
          else if (signal.type === "answer") rtcLog(`Answer recibida ← ${peerName}`);
          await pc.setRemoteDescription(signal);
          if (signal.type === "offer") {
            await pc.setLocalDescription();
            socket.emit("signal", { to: from, signal: pc.localDescription });
            rtcLog(`Answer enviada → ${peerName}`);
          }
        } else {
          await pc.addIceCandidate(signal);
          rtcLog(`ICE recibido ← ${ctx.uid ?? from}`);
        }
      } catch (err) {
        if (!ctx.ignoreOffer) console.warn("onSignal error", err);
      }
    };

    const onPeerLeft = ({ socketId, uid }: PeerLeftEvent) => {
      rtcLog(`Peer desconectado: ${uid ?? socketId}`);
      closePeer(socketId);
    };

    // `media-state` (server → cliente): mic/cam de un peer cambió (agregado).
    const onRemoteMediaState = ({
      uid,
      micOn: m,
      camOn: c,
    }: {
      socketId: string;
      uid?: string;
      micOn: boolean;
      camOn: boolean;
    }) => {
      if (!uid) return;
      setRemoteMedia((prev) => ({ ...prev, [uid]: { micOn: m, camOn: c } }));
    };

    // Eventos AV DISCRETOS (camera_on/off, mic_on/off): actualizan un solo
    // campo del estado remoto. Payload: { id, uid }.
    const patchRemoteMedia = (
      uid: string | undefined,
      field: "micOn" | "camOn",
      value: boolean
    ) => {
      if (!uid) return;
      setRemoteMedia((prev) => {
        const cur = prev[uid] ?? { micOn: true, camOn: true };
        return { ...prev, [uid]: { ...cur, [field]: value } };
      });
    };
    const onCameraOn = (p: { uid?: string }) => patchRemoteMedia(p?.uid, "camOn", true);
    const onCameraOff = (p: { uid?: string }) => patchRemoteMedia(p?.uid, "camOn", false);
    const onMicOn = (p: { uid?: string }) => patchRemoteMedia(p?.uid, "micOn", true);
    const onMicOff = (p: { uid?: string }) => patchRemoteMedia(p?.uid, "micOn", false);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.io.on("reconnect_attempt", onReconnectAttempt);
    socket.on("introduction", onIntroduction);
    socket.on("signal", onSignal);
    socket.on("peer-left", onPeerLeft);
    socket.on("participant_joined", onParticipantJoined);
    socket.on("participant_left", onParticipantLeft);
    socket.on("media-state", onRemoteMediaState);
    socket.on("camera_on", onCameraOn);
    socket.on("camera_off", onCameraOff);
    socket.on("mic_on", onMicOn);
    socket.on("mic_off", onMicOff);
    if (socket.connected) onConnect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.io.off("reconnect_attempt", onReconnectAttempt);
      socket.off("introduction", onIntroduction);
      socket.off("signal", onSignal);
      socket.off("peer-left", onPeerLeft);
      socket.off("participant_joined", onParticipantJoined);
      socket.off("participant_left", onParticipantLeft);
      socket.off("media-state", onRemoteMediaState);
      socket.off("camera_on", onCameraOn);
      socket.off("camera_off", onCameraOff);
      socket.off("mic_on", onMicOn);
      socket.off("mic_off", onMicOff);
      // Cerrar todas las conexiones y desconectar el socket dedicado.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const peerMap = peersRef.current;
      peerMap.forEach((ctx) => {
        try {
          ctx.pc.close();
        } catch {
          /* noop */
        }
      });
      peerMap.clear();
      setRemoteStreams({});
      setRemoteMedia({});
      setPeerState({});
      setSignalingStatus("connecting");
      signaledConnectedRef.current = false;
      socket.disconnect();
      socketRef.current = null;
    };
  }, [enabled, roomId, mediaReady, ensurePeer, closePeer]);

  // ── Toggles de mic/cam (habilitan/inhabilitan la pista, sin renegociar) ─
  const toggleMic = useCallback(() => {
    setMicOn((prev) => {
      const next = !prev;
      localStreamRef.current
        ?.getAudioTracks()
        .forEach((t) => (t.enabled = next));
      mediaStateRef.current = { micOn: next, camOn };
      onMediaChangeRef.current?.({ micOn: next, camOn }); // room-service
      emitMediaState({ micOn: next, camOn }); // signaling server (Tarea 3)
      return next;
    });
  }, [camOn, emitMediaState]);

  const toggleCam = useCallback(() => {
    setCamOn((prev) => {
      const next = !prev;
      // No tocamos la pista mientras compartimos pantalla (el video sender
      // lleva la pantalla); el toggle solo afecta a la cámara real.
      if (!screenSharing) {
        localStreamRef.current
          ?.getVideoTracks()
          .forEach((t) => (t.enabled = next));
      }
      mediaStateRef.current = { micOn, camOn: next };
      onMediaChangeRef.current?.({ micOn, camOn: next }); // room-service
      emitMediaState({ micOn, camOn: next }); // signaling server (Tarea 3)
      return next;
    });
  }, [micOn, screenSharing, emitMediaState]);

  // ── Compartir pantalla (replaceTrack → sin renegociación cuando hay
  //    sender de video; addTrack si la cámara fue denegada) ───────────────
  const stopScreenShare = useCallback(() => {
    const screenTrack = screenTrackRef.current;
    screenTrackRef.current = null;
    screenTrack?.stop();

    const camTrack = cameraTrackRef.current;
    peersRef.current.forEach((ctx) => {
      const sender = ctx.pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender && camTrack) {
        sender.replaceTrack(camTrack).catch(() => undefined);
      } else if (sender && !camTrack) {
        ctx.pc.removeTrack(sender);
      }
    });
    if (camTrack) camTrack.enabled = camOn;
    setScreenStream(null);
    setScreenSharing(false);
  }, [camOn]);

  const startScreenShare = useCallback(async () => {
    let display: MediaStream;
    try {
      display = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
    } catch {
      return; // el usuario canceló el diálogo de compartir
    }
    const screenTrack = display.getVideoTracks()[0];
    if (!screenTrack) return;
    screenTrackRef.current = screenTrack;

    peersRef.current.forEach((ctx) => {
      const sender = ctx.pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender) {
        sender.replaceTrack(screenTrack).catch(() => undefined);
      } else {
        // Cámara denegada: añadimos la pista → dispara renegociación.
        ctx.pc.addTrack(screenTrack, display);
      }
    });

    // Si el usuario detiene la compartición desde el chrome del navegador.
    screenTrack.onended = () => stopScreenShare();
    setScreenStream(display);
    setScreenSharing(true);
  }, [stopScreenShare]);

  const toggleScreenShare = useCallback(async () => {
    if (screenSharing) {
      stopScreenShare();
    } else {
      await startScreenShare();
    }
  }, [screenSharing, startScreenShare, stopScreenShare]);

  // ── Cambiar micrófono/cámara en vivo (config individual) ────────────────
  // Pedimos una pista nueva del dispositivo elegido y la sustituimos con
  // replaceTrack en cada peer (sin renegociar) y en el stream local. La
  // elección se guarda para próximas sesiones de esta persona.
  const switchAudioDevice = useCallback(
    async (deviceId: string) => {
      try {
        const ns = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: deviceId } },
        });
        const newTrack = ns.getAudioTracks()[0];
        if (!newTrack) return;
        newTrack.enabled = mediaStateRef.current.micOn;
        peersRef.current.forEach((ctx) => {
          const sender = ctx.pc
            .getSenders()
            .find((s) => s.track?.kind === "audio");
          sender?.replaceTrack(newTrack).catch(() => undefined);
        });
        const ls = localStreamRef.current;
        if (ls) {
          ls.getAudioTracks().forEach((t) => {
            t.stop();
            ls.removeTrack(t);
          });
          ls.addTrack(newTrack);
          // Nuevo objeto MediaStream → la UI (tile + medidor de nivel) se
          // reengancha a la pista de audio recién seleccionada.
          setLocalStream(new MediaStream(ls.getTracks()));
        } else {
          localStreamRef.current = ns;
          setLocalStream(ns);
        }
        writeStoredDevice(MIC_STORAGE_KEY, deviceId);
        setSelectedMicId(deviceId);
        void refreshDevices();
        rtcLog(`Micrófono cambiado → ${deviceId}`);
      } catch {
        setMediaError("No se pudo cambiar el micrófono seleccionado.");
      }
    },
    [refreshDevices]
  );

  const switchVideoDevice = useCallback(
    async (deviceId: string) => {
      // Si estamos compartiendo pantalla, solo guardamos la preferencia: la
      // cámara real volverá a usarse al dejar de compartir.
      if (screenTrackRef.current) {
        writeStoredDevice(CAM_STORAGE_KEY, deviceId);
        setSelectedCamId(deviceId);
        return;
      }
      try {
        const ns = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: { exact: deviceId },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        const newTrack = ns.getVideoTracks()[0];
        if (!newTrack) return;
        newTrack.enabled = mediaStateRef.current.camOn;
        cameraTrackRef.current = newTrack;
        peersRef.current.forEach((ctx) => {
          const sender = ctx.pc
            .getSenders()
            .find((s) => s.track?.kind === "video");
          if (sender) {
            sender.replaceTrack(newTrack).catch(() => undefined);
          } else {
            // No había pista de video (cámara antes denegada): la añadimos →
            // dispara renegociación para que los peers la reciban.
            ctx.pc.addTrack(newTrack, ns);
          }
        });
        const ls = localStreamRef.current;
        if (ls) {
          ls.getVideoTracks().forEach((t) => {
            t.stop();
            ls.removeTrack(t);
          });
          ls.addTrack(newTrack);
          setLocalStream(new MediaStream(ls.getTracks()));
        } else {
          localStreamRef.current = ns;
          setLocalStream(ns);
        }
        writeStoredDevice(CAM_STORAGE_KEY, deviceId);
        setSelectedCamId(deviceId);
        void refreshDevices();
        rtcLog(`Cámara cambiada → ${deviceId}`);
      } catch {
        setMediaError("No se pudo cambiar la cámara seleccionada.");
      }
    },
    [refreshDevices]
  );

  // Hay peers cuya conexión P2P aún se está estableciendo (overlay
  // "Conectando participantes…").
  const peerConnecting = Object.values(peerState).some(
    (s) => s === "new" || s === "connecting"
  );

  return {
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
    supported,
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
  };
}
