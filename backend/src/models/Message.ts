export interface Message {
  id: string;
  roomId: string;
  senderUid: string;
  senderUsername: string;
  content: string;
  type: "text" | "system";
  createdAt: FirebaseFirestore.Timestamp | Date;
}

// Colección Firestore: messages/{messageId}
export const MESSAGES_COLLECTION = "messages";
