export interface Room {
  id: string;
  name: string;
  createdBy: string;
  participants: string[];
  createdAt: FirebaseFirestore.Timestamp | Date;
  isActive: boolean;
}

// Colección Firestore: rooms/{roomId}
export const ROOMS_COLLECTION = "rooms";
