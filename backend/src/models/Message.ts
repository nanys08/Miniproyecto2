/**
 * @file Message — Modelo de mensaje de chat en una sala.
 *
 * Persistencia Firestore: subcolección `rooms/{roomId}/messages/{messageId}`.
 *
 * Decisión de diseño: usamos una **subcolección** en vez de una colección
 * raíz `messages/` para:
 *  - Evitar índices compuestos al consultar por `roomId + createdAt`.
 *  - Cascadear el borrado de mensajes cuando se elimina la sala.
 *  - Mantener cada documento alineado con un único agregado raíz (room).
 *
 * El campo `roomId` se persiste de forma redundante para facilitar logs
 * y trazabilidad si en el futuro se exporta el historial fuera del path.
 */

/** Documento `rooms/{roomId}/messages/{messageId}` en Firestore. */
export interface Message {
  /** ID único del mensaje (coincide con el doc id de Firestore). */
  id: string;
  /** ID de la sala a la que pertenece el mensaje. */
  roomId: string;
  /** UID Firebase del autor del mensaje. */
  senderUid: string;
  /** Username del autor en el momento del envío (snapshot, no joinea). */
  senderUsername: string;
  /** Contenido del mensaje (texto ya saneado por el servidor). */
  content: string;
  /** Tipo de mensaje: del usuario o del sistema (joins/leaves). */
  type: "text" | "system";
  /** Fecha de creación (Firestore Timestamp en lectura, Date al escribir). */
  createdAt: FirebaseFirestore.Timestamp | Date;
}

/** Nombre de la subcolección de mensajes bajo `rooms/{roomId}`. */
export const MESSAGES_SUBCOLLECTION = "messages";
