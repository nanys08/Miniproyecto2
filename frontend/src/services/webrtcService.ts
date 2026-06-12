/**
 * @file webrtcService — Servicio WebRTC del cliente (Repositorio Frontend).
 *
 * Responsable de la "fontanería" WebRTC que usa el hook `useWebRTC`:
 *   - Detectar soporte del navegador (Tarea 2).
 *   - Configurar los servidores ICE: STUN + TURN (Tarea 6).
 *   - Crear `RTCPeerConnection` ya configuradas (Tarea 6).
 *   - Un logger de cliente con prefijo claro para la demo (Offer enviada,
 *     Answer recibida, ICE recibido, P2P establecida, …).
 *
 * La señalización (offer/answer/ICE) la orquesta `useWebRTC`, que delega aquí
 * la configuración y el registro. El audio/video viaja P2P; el TURN solo se usa
 * como relay cuando la conexión directa no es posible.
 */

const TURN_URL = import.meta.env.VITE_TURN_URL as string | undefined;
const TURN_USERNAME = import.meta.env.VITE_TURN_USERNAME as string | undefined;
const TURN_CREDENTIAL = import.meta.env.VITE_TURN_CREDENTIAL as
  | string
  | undefined;

// ─── Tarea 2: soporte del navegador ──────────────────────────────────────────

/**
 * `true` si el navegador soporta WebRTC (RTCPeerConnection) y la captura de
 * medios (getUserMedia). Si devuelve `false`, la UI debe mostrar
 * "Tu navegador no soporta WebRTC".
 */
export function isWebRTCSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.RTCPeerConnection === "function" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  );
}

// ─── Tarea 6: servidores ICE (STUN + TURN) ───────────────────────────────────

/**
 * Lista de servidores ICE. Siempre incluye STUN público de Google; añade el
 * TURN configurado solo si las tres variables de entorno están presentes.
 */
export function getIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  ];

  if (TURN_URL && TURN_USERNAME && TURN_CREDENTIAL) {
    servers.push({
      urls: TURN_URL,
      username: TURN_USERNAME,
      credential: TURN_CREDENTIAL,
    });
  }

  return servers;
}

/** `true` si hay un TURN configurado (útil para avisos de diagnóstico). */
export const hasTurnConfigured = Boolean(
  TURN_URL && TURN_USERNAME && TURN_CREDENTIAL
);

/** Config base para `new RTCPeerConnection(...)`. */
export function buildPeerConfig(): RTCConfiguration {
  return {
    iceServers: getIceServers(),
    // `all` permite rutas P2P directas y vía TURN. `relay` forzaría TURN
    // siempre (útil para depurar NAT, más lento).
    iceTransportPolicy: "all",
    bundlePolicy: "max-bundle",
  };
}

/** Crea una `RTCPeerConnection` ya configurada con STUN + TURN + ICE. */
export function createPeerConnection(): RTCPeerConnection {
  return new RTCPeerConnection(buildPeerConfig());
}

// ─── Logs de cliente (evidencia para la demo del C1) ─────────────────────────

/**
 * Logger con prefijo para ver el flujo WebRTC en la consola del navegador:
 *   [WebRTC] Juan conectado
 *   [WebRTC] Introduction enviada
 *   [WebRTC] Offer enviada → <peer>
 *   [WebRTC] Answer recibida ← <peer>
 *   [WebRTC] ICE recibido ← <peer>
 *   [WebRTC] P2P establecida con <peer>
 */
export const rtcLog = (msg: string, ...args: unknown[]): void => {
  console.info(`%c[WebRTC]%c ${msg}`, "color:#22c55e;font-weight:bold", "", ...args);
};
