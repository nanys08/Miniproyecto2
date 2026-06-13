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

/**
 * TURN por defecto usado cuando NO hay VITE_TURN_* en el entorno del deploy.
 * En producción (Vercel) el `.env` local NO se sube, así que sin esto el sitio
 * quedaría solo con STUN → la llamada no conecta entre redes distintas (NAT).
 *
 * Proveedor: **metered.ca** (free, credenciales estables por cuenta — NO rotan
 * como las free de ExpressTURN/OpenRelay). Las credenciales de un TURN viajan
 * al navegador, así que son públicas por naturaleza. Cubrimos UDP (80), TCP (80
 * y 443) y TLS (turns 443) para atravesar NAT y redes que bloquean UDP.
 *
 * Si en el futuro dejan de conectar, regenera las credenciales en
 * dashboard.metered.ca y actualízalas aquí, o define las VITE_TURN_* en Vercel.
 */
const METERED_USERNAME = "d201c52a9b40a1c418eec5ac";
const METERED_CREDENTIAL = "X7028/jyIWL/0Lp5";

const DEFAULT_TURN: RTCIceServer[] = [
  { urls: "turn:standard.relay.metered.ca:80", username: METERED_USERNAME, credential: METERED_CREDENTIAL },
  { urls: "turn:standard.relay.metered.ca:80?transport=tcp", username: METERED_USERNAME, credential: METERED_CREDENTIAL },
  { urls: "turn:standard.relay.metered.ca:443", username: METERED_USERNAME, credential: METERED_CREDENTIAL },
  { urls: "turns:standard.relay.metered.ca:443?transport=tcp", username: METERED_USERNAME, credential: METERED_CREDENTIAL },
];

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
    {
      urls: [
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302",
        "stun:stun.relay.metered.ca:80",
      ],
    },
  ];

  // TURN principal: el del entorno (VITE_TURN_*) si existe; si no, el default
  // (metered.ca, que cubre UDP/TCP/443).
  if (TURN_URL && TURN_USERNAME && TURN_CREDENTIAL) {
    servers.push({
      urls: TURN_URL,
      username: TURN_USERNAME,
      credential: TURN_CREDENTIAL,
    });
  } else {
    servers.push(...DEFAULT_TURN);
  }

  return servers;
}

/**
 * `true` si hay algún TURN disponible. Ahora siempre lo hay (env o fallback),
 * así que la llamada puede usar relay aunque el deploy no defina VITE_TURN_*.
 */
export const hasTurnConfigured = true;

/** `true` si el TURN proviene de variables de entorno (no del fallback). */
export const turnFromEnv = Boolean(
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

/** Log de advertencia/diagnóstico con el mismo prefijo (en naranja). */
export const rtcWarn = (msg: string, ...args: unknown[]): void => {
  console.warn(`%c[WebRTC]%c ${msg}`, "color:#f59e0b;font-weight:bold", "", ...args);
};

/**
 * Imprime la configuración ICE efectiva al iniciar la llamada. Es la PRIMERA
 * pista para diagnosticar fallos de conexión entre redes distintas:
 *   - Si NO hay TURN configurado, una NAT simétrica impedirá el P2P → no se
 *     escucharán ni se verán (solo STUN no basta).
 *   - En producción (Vercel) las VITE_TURN_* deben estar en las env del deploy,
 *     no solo en el .env local.
 */
export function logIceConfig(): void {
  const servers = getIceServers();
  const urls = servers.flatMap((s) =>
    Array.isArray(s.urls) ? s.urls : [s.urls]
  );
  rtcLog("Configuración ICE", {
    turnDesdeEnv: turnFromEnv,
    stun: urls.filter((u) => u.startsWith("stun:")),
    turn: urls.filter((u) => u.startsWith("turn:")),
    entorno: typeof window !== "undefined" ? window.location.host : "?",
  });
  if (!turnFromEnv) {
    rtcWarn(
      "TURN usando el fallback del código (no hay VITE_TURN_* en el deploy). " +
        "Si la llamada no conecta, las credenciales free pueden haber rotado: " +
        "define VITE_TURN_* en Vercel con un TURN propio."
    );
  }
}
