import { createContext } from "react";

export type ToastKind = "success" | "error" | "info";

export interface ToastEntry {
  id: number;
  kind: ToastKind;
  message: string;
}

export interface ToastContextValue {
  toasts: ToastEntry[];
  show: (kind: ToastKind, message: string) => void;
  dismiss: (id: number) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);
