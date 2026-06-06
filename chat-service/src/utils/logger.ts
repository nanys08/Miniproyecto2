/**
 * @file logger — Logger mínimo con timestamp ISO.
 *
 * Mismo shape que el logger del room-service para que los logs de ambos
 * servicios se lean igual. Sirve de evidencia para las Tareas 5 y 7
 * (registro de quién entra/sale y de las notificaciones del room-service).
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
