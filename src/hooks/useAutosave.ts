"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AutosaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export interface AutosaveResult {
  status: AutosaveStatus;
  /** Last successful save time (ms epoch). */
  lastSavedAt: number | null;
  /** Last error message, if any. */
  errorMessage: string | null;
  /** Trigger a save now (bypassing the debounce). Returns the save promise. */
  flush: () => Promise<void>;
  /** Discard the dirty flag without saving (e.g. on explicit cancel). */
  reset: () => void;
}

/**
 * Debounced autosave for form drafts. Watches `value`; when it changes,
 * schedules `onSave(value)` after `delay` ms of inactivity. Tracks status
 * and last-saved timestamp for UI display.
 *
 * Notes:
 * - Compares with shallow JSON equality against the last-saved value to avoid
 *   redundant saves.
 * - On unmount with pending changes, flushes immediately (best effort).
 * - `beforeunload` warning is wired separately via `useUnsavedChangesWarning`.
 */
export function useAutosave<T>(
  value: T,
  onSave: (value: T) => Promise<void>,
  options: { delayMs?: number; enabled?: boolean } = {},
): AutosaveResult {
  const { delayMs = 1500, enabled = true } = options;
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const lastSavedJsonRef = useRef<string>(JSON.stringify(value));
  const valueRef = useRef<T>(value);
  valueRef.current = value;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);

  const doSave = useCallback(async (toSave: T) => {
    setStatus("saving");
    setErrorMessage(null);
    try {
      await onSaveRef.current(toSave);
      lastSavedJsonRef.current = JSON.stringify(toSave);
      setLastSavedAt(Date.now());
      // If the value drifted again during the save, mark dirty; otherwise saved.
      if (JSON.stringify(valueRef.current) !== lastSavedJsonRef.current) {
        setStatus("dirty");
      } else {
        setStatus("saved");
      }
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Save failed");
    }
  }, []);

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (inFlightRef.current) await inFlightRef.current;
    if (JSON.stringify(valueRef.current) === lastSavedJsonRef.current) return;
    const promise = doSave(valueRef.current);
    inFlightRef.current = promise;
    try {
      await promise;
    } finally {
      inFlightRef.current = null;
    }
  }, [doSave]);

  const reset = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    lastSavedJsonRef.current = JSON.stringify(valueRef.current);
    setStatus("idle");
    setErrorMessage(null);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const json = JSON.stringify(value);
    if (json === lastSavedJsonRef.current) return;
    setStatus("dirty");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void flush();
    }, delayMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, delayMs, enabled, flush]);

  // On unmount: if dirty, flush synchronously (best-effort).
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        if (JSON.stringify(valueRef.current) !== lastSavedJsonRef.current) {
          void doSave(valueRef.current);
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { status, lastSavedAt, errorMessage, flush, reset };
}

/**
 * Wire a `beforeunload` warning when there are unsaved changes. The browser
 * will show its native "unsaved changes" prompt if the user tries to close
 * the tab or hit back.
 */
export function useUnsavedChangesWarning(hasUnsaved: boolean) {
  useEffect(() => {
    if (!hasUnsaved) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Modern browsers ignore the message and show their own; we just need
      // preventDefault + a returnValue to trigger the prompt.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsaved]);
}
