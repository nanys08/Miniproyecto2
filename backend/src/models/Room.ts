/**
 * @file Room — Modelo de sala de estudio.
 *
 * Estructura Firestore: rooms/{roomId}
 *
 * Campos obligatorios al crear:
 *   roomId, name, ownerId, createdAt
 *
 * Campos adicionales gestionados por el backend:
 *   participants — array de UIDs que han entrado alguna vez a la sala.
 *   isActive     — false cuando la sala se archiva/cierra.
 */

/** Documento `rooms/{roomId}` en Firestore. */
export interface Room {
  /** ID único de la sala — coincide con el ID del documento Firestore. */
  roomId: string;
  /** Nombre descriptivo de la sala (1-100 caracteres). */
  name: string;
  /** UID Firebase del usuario que creó la sala. */
  ownerId: string;
  /**
   * Código de acceso corto (6 chars alfanuméricos en mayúsculas, ej. "B6K3F2").
   * Se comparte con otros estudiantes para unirse a la sala.
   */
  accessCode: string;
  /** Fecha de creación (Firestore Timestamp o Date JS al serializar). */
  createdAt: FirebaseFirestore.Timestamp | Date;
  /** UIDs de participantes que se han unido (incluye al dueño). */
  participants: string[];
  /** `true` mientras la sala esté activa; `false` si fue archivada. */
  isActive: boolean;
}

/** Nombre de la colección en Firestore. */
export const ROOMS_COLLECTION = "rooms";
