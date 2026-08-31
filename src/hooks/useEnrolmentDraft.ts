"use client";

/**
 * Account-backed enrolment draft with debounced autosave.
 *
 * 2026-07-30, Phase 2. The parent's progress lives on their ACCOUNT rather
 * than in localStorage, so leaving mid-form — or switching from phone to
 * laptop — resumes exactly where they were.
 *
 * Debounced at 1.2s: long enough that typing a sentence is one write
 * rather than forty, short enough that a parent who closes the tab
 * mid-thought loses at most a word.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";

const AUTOSAVE_DEBOUNCE_MS = 1200;

export type DraftData = Record<string, unknown>;

interface DraftResponse {
  data: DraftData;
  currentStep: number;
  submittedAt: string | null;
  updatedAt: string | null;
}

export type SaveState = "idle" | "saving" | "saved" | "error";

export function useEnrolmentDraft() {
  const { data: loaded, isLoading } = useQuery<DraftResponse>({
    queryKey: ["parent", "enrolment-draft"],
    queryFn: () => fetchApi<DraftResponse>("/api/parent/enrolment-draft"),
    // The draft is the source of truth for an in-progress form; refetching
    // it mid-edit would clobber what the parent is typing.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Holds the newest payload so a save that fires mid-debounce still sends
  // the latest values rather than a stale closure.
  const pendingRef = useRef<{ data: DraftData; currentStep: number } | null>(null);

  const flush = useCallback(async () => {
    const payload = pendingRef.current;
    if (!payload) return;
    pendingRef.current = null;
    setSaveState("saving");
    try {
      await mutateApi("/api/parent/enrolment-draft", {
        method: "PUT",
        body: payload,
      });
      setSaveState("saved");
    } catch {
      // Deliberately non-destructive: the parent keeps typing, we show
      // "Not saved" and retry on their next change. Throwing here would
      // surface a toast over a form they're mid-way through.
      setSaveState("error");
    }
  }, []);

  const save = useCallback(
    (data: DraftData, currentStep: number) => {
      pendingRef.current = { data, currentStep };
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, AUTOSAVE_DEBOUNCE_MS);
    },
    [flush],
  );

  // Flush on unmount and on tab-close so a parent navigating away mid-typing
  // doesn't lose the last debounce window.
  useEffect(() => {
    const onHide = () => {
      if (pendingRef.current) void flush();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (pendingRef.current) void flush();
    };
  }, [flush]);

  return {
    initialData: loaded?.data ?? {},
    initialStep: loaded?.currentStep ?? 0,
    submittedAt: loaded?.submittedAt ?? null,
    isLoading,
    save,
    saveState,
    flush,
  };
}
