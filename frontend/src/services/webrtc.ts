/**
 * @file webrtc — Configuración de servidores ICE para las conexiones P2P.
 *
 * Una RTCPeerConnection necesita "ICE servers" para descubrir cómo
 * alcanzar al otro peer:
 *   - STUN: el peer averigua su IP pública (NAT reflexiva). Gratis y
 *     suficiente en redes domésticas simples.
 *   - TURN: relay que reenvía el tráfico cuando la conexión directa es
 *     imposible (NAT simétrica, firewalls corporativos). Necesario para
 *     que la llamada funcione "siempre". Aquí usamos ExpressTURN (free),
 *     cuyas credenciales vienen de variables de entorno (VITE_TURN_*).
 *
 * Las credenciales free de ExpressTURN ROTAN periódicamente: si la llamada
 * conecta en la misma red pero falla entre redes distintas, casi siempre es
 * que el TURN caducó — refréscalo en el Dashboard y actualiza el `.env`.
 */

const TURN_URL = import.meta.env.VITE_TURN_URL as string | undefined;
const TURN_USERNAME = import.meta.env.VITE_TURN_USERNAME as string | undefined;
const TURN_CREDENTIAL = import.meta.env.VITE_TURN_CREDENTIAL as
  | string
  | undefined;

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

/** Config base reutilizable para `new RTCPeerConnection(...)`. */
export function buildPeerConfig(): RTCConfiguration {
  return {
    iceServers: getIceServers(),
    // `all` permite tanto rutas P2P directas como vía TURN. Cambiar a
    // `relay` forzaría TURN siempre (útil para depurar NAT, más lento).
    iceTransportPolicy: "all",
    bundlePolicy: "max-bundle",
  };
}
