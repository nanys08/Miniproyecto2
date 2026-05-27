export type AuthProvider = "password" | "google";

export interface User {
  uid: string;
  username: string;
  fullName: string;
  email: string;
  avatar: string;
  provider: AuthProvider;
  createdAt: FirebaseFirestore.Timestamp | Date;
  online: boolean;
  /** Teléfono opcional. Campo libre, no se valida formato en el backend. */
  phone?: string;
}

// Colección Firestore: users/{uid}
export const USERS_COLLECTION = "users";
