export interface User {
  uid: string;
  username: string;
  email: string;
  avatar: string;
  createdAt: FirebaseFirestore.Timestamp | Date;
  online: boolean;
}

// Colección Firestore: users/{uid}
export const USERS_COLLECTION = "users";
