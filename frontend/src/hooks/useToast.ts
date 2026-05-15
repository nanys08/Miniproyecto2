import { useContext } from "react";
import {
  ToastContext,
  type ToastContextValue,
} from "@/context/toast-context";

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast debe usarse dentro de <ToastProvider>");
  }
  return ctx;
}
