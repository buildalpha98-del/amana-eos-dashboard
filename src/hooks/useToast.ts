"use client";

import { useCallback, useEffect, useState } from "react";

export interface Toast {
  id: string;
  title?: string;
  description: string;
  variant?: "default" | "destructive";
  duration?: number;
}

type ToastEvent = Omit<Toast, "id">;

const listeners = new Set<(toast: Toast) => void>();
let toastCount = 0;

export function toast(event: ToastEvent) {
  const id = `toast-${++toastCount}`;
  const t: Toast = { id, ...event };
  listeners.forEach((fn) => fn(t));
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((t: Toast) => {
    setToasts((prev) => [...prev, t]);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    listeners.add(addToast);
    return () => {
      listeners.delete(addToast);
    };
  }, [addToast]);

  return { toasts, dismiss, toast };
}
