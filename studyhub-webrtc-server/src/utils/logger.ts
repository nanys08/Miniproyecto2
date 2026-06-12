/**
 * @file logger — Logger mínimo con timestamp ISO.
 *
 * Mismo shape que el logger del room-service y el chat-service, para que los
 * logs de los tres servicios se lean igual. Es la evidencia de la **Tarea 7**:
 * registrar usuario conectado, offer/answer/ICE reenviados y usuario
 * desconectado.
 */
const timestamp = () => new Date().toISOString();

export const logger = {
  info: (msg: string, ...args: unknown[]) =>
    console.log(`[${timestamp()}] INFO: ${msg}`, ...args),
  warn: (msg: string, ...args: unknown[]) =>
    console.warn(`[${timestamp()}] WARN: ${msg}`, ...args),
  error: (msg: string, ...args: unknown[]) =>
    console.error(`[${timestamp()}] ERROR: ${msg}`, ...args),
};
