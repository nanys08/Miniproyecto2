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
  rtcLog,
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

export interface UseWebRTCOptions {
  roomId: string | undefined;
  /** Identidad local que se anuncia en `introduction`. */
  identity: WebRTCIdentity | null;
  /** Arrancar (pedir cámara/micro). Falso = sala en modo solo-lectura. */
  enabled: boolean;
  /** Se invoca cuando el usuario alterna mic/cam (para publicar presencia). */
  onLocalMediaChange?: (state: { micOn: boolean; camOn: boolean }) => void;
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
}

/** Discrimina un payload de señal SDP (offer/answer) de un candidato ICE. */
const isSdp = (
  signal: RTCSessionDescriptionInit | RTCIceCandidateInit
): signal is RTCSessionDescriptionInit =>
  typeof (signal as RTCSessionDescriptionInit).type === "string";

export function useWebRTC({
  roomId,
  identity,
  enabled,
  onLocalMediaChange,
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
      try {
        ctx.pc.close();
      } catch {
        /* noop */
      }
      peersRef.current.delete(socketId);
      uidBySocketRef.current.delete(socketId);
      dropRemoteStream(ctx.uid);
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
      rtcLog(`RTCPeerConnection creada con ${uid ?? remoteSocketId}`);

      // Adjuntar las pistas locales actuales (cámara+micro). Si ya estamos
      // compartiendo pantalla, sustituimos la pista de video por la pantalla.
      const ls = localStreamRef.current;
      if (ls) {
        ls.getTracks().forEach((track) => pc.addTrack(track, ls));
        if (screenTrackRef.current) {
          const sender = pc
            .getSenders()
            .find((s) => s.track?.kind === "video");
          sender?.replaceTrack(screenTrackRef.current).catch(() => undefined);
        }
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
          rtcLog(`ICE enviado → ${ctx.uid ?? remoteSocketId}`);
        }
      };

      pc.ontrack = ({ streams }) => {
        const [stream] = streams;
        if (!stream) return;
        const key = ctx.uid;
        if (!key) return; // sin uid no podemos asociarlo a un tile
        rtcLog(`Stream remoto recibido de ${key}`);
        setRemoteStreams((prev) => ({ ...prev, [key]: stream }));
      };

      pc.onconnectionstatechange = () => {
        const st = pc.connectionState;
        ctx.connectionState = st; // Tarea 7 — guardamos el estado del peer.
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
        if (st === "connected") rtcLog(`P2P establecida con ${who}`);
        else if (st === "failed") rtcLog(`Fallo de conexión P2P con ${who}`);
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
      setMediaError("Tu navegador no soporta WebRTC");
      return;
    }
    let cancelled = false;

    (async () => {
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        });
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false,
          });
          if (!cancelled) {
            setCamOn(false);
            mediaStateRef.current.camOn = false;
            onMediaChangeRef.current?.({ micOn: true, camOn: false });
            mediaErrorRef.current = "camara_denegada";
            setMediaError(
              "No se pudo acceder a la cámara. Continúas solo con audio."
            );
          }
        } catch {
          if (!cancelled) {
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
  }, [enabled, roomId, supported]);

  // ── Efecto 2: socket de señalización + ciclo de vida de la malla ───────
  // Arranca cuando el intento de media terminó (`mediaReady`): si hubo stream,
  // las pistas ya están listas para adjuntarse; si no, entramos en modo
  // recepción (recvonly) y reportamos `media-error`.
  useEffect(() => {
    if (!enabled || !roomId || !mediaReady) return;
    const id = identityRef.current;
    if (!id) return;

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
      introduce();
    };

    // `introduction` (server → cliente): lista de peers. Para cada peer, el
    // de socketId mayor inicia la conexión; el otro espera la oferta.
    const onIntroduction = ({ self, peers }: IntroductionEvent) => {
      peers.forEach((p) => {
        if (!p.socketId || p.socketId === self) return;
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
        if (self > p.socketId) {
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
    socket.on("introduction", onIntroduction);
    socket.on("signal", onSignal);
    socket.on("peer-left", onPeerLeft);
    socket.on("media-state", onRemoteMediaState);
    socket.on("camera_on", onCameraOn);
    socket.on("camera_off", onCameraOff);
    socket.on("mic_on", onMicOn);
    socket.on("mic_off", onMicOff);
    if (socket.connected) onConnect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("introduction", onIntroduction);
      socket.off("signal", onSignal);
      socket.off("peer-left", onPeerLeft);
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
  };
}
