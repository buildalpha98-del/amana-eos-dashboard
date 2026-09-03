"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "@/hooks/useToast";

const DRAFT_PREFIX = "amana-draft-";
const DEBOUNCE_MS = 3000;

/**
 * Generic hook for autosaving form drafts to localStorage.
 *
 * Usage:
 *   const { data, updateField, clearDraft, hasDraft } = useFormDraft("email-compose", initialData);
 *
 * - Auto-saves to localStorage every 3 seconds when data changes (debounced)
 * - On mount, checks for existing draft and returns it if found
 * - Shows a "Draft restored" toast when recovering a draft
 * - clearDraft() removes from localStorage (call after successful submit)
 */
export function useFormDraft<T extends Record<string, unknown>>(
  key: string,
  initialData: T,
) {
  const storageKey = `${DRAFT_PREFIX}${key}`;
  const initialRef = useRef(initialData);

  // Initialize data from draft or initial (computed once on mount)
  const [restore] = useState<{ data: T; restored: boolean }>(() => {
    if (typeof window === "undefined") {
      return { data: initialData, restored: false };
    }

    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as T;
        // Only restore if different from initial
        if (JSON.stringify(parsed) !== JSON.stringify(initialData)) {
          return { data: parsed, restored: true };
        }
      }
    } catch {
      // Ignore parse errors
    }
    return { data: initialData, restored: false };
  });
  const [data, setData] = useState<T>(restore.data);
  const [hasDraft, setHasDraft] = useState(restore.restored);

  // Show toast after mount if draft was restored
  useEffect(() => {
    if (restore.restored) {
      toast({ description: "Draft restored" });
    }
  }, [restore.restored]);

  // Debounced auto-save to localStorage
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Don't save if data matches initial
    if (JSON.stringify(data) === JSON.stringify(initialRef.current)) {
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      try {
        // `data` is current at fire time: this effect re-runs (and clears the
        // timer) on every data change, so only the latest schedule can fire.
        localStorage.setItem(storageKey, JSON.stringify(data));
        setHasDraft(true);
      } catch {
        // localStorage full or unavailable
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [data, storageKey]);

  const updateField = useCallback(
    <K extends keyof T>(field: K, value: T[K]) => {
      setData((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Ignore
    }
    setHasDraft(false);
  }, [storageKey]);

  return { data, setData, updateField, clearDraft, hasDraft };
}
