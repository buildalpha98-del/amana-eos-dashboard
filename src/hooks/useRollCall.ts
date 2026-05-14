"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { offlineQueue } from "@/lib/offline-queue";

// ── Types ────────────────────────────────────────────────

export interface RollCallAllAboutMe {
  nickname: string | null;
  favouriteFood: string | null;
  favouriteToys: string | null;
  favouriteSubjects: string | null;
  hobbies: string | null;
  fears: string | null;
  calmingTechniques: string | null;
  additionalNotes: string | null;
  submittedAt: string | null;
  updatedAt: string;
}

export interface RollCallChild {
  id: string;
  firstName: string;
  surname: string;
  photo: string | null;
  medicalConditions: string[];
  dietaryRequirements: string[];
  anaphylaxisActionPlan: boolean;
  medicationDetails: string | null;
  medical: Record<string, unknown> | null;
  dietary: Record<string, unknown> | null;
  yearLevel: string | null;
  /// Custody arrangements — surfaced as a chip in the roll-call cell so
  /// staff see pickup restrictions before a sign-out happens.
  custodyArrangements: {
    type: "shared" | "sole" | "court_order" | "informal";
    primaryGuardian?: string;
    details?: string;
    courtOrderUrl?: string;
  } | null;
  /// All About Me — parent-submitted profile (nickname, favourites, calming
  /// techniques). Surfaced on the roll-call card so educators can greet
  /// the child personally on their first day. Stage 5 of the Amana Way.
  allAboutMe: RollCallAllAboutMe | null;
}

export interface RollCallEntry {
  childId: string;
  /// Underlying AttendanceRecord id — null until the child has been signed
  /// in (the record gets created on first action). Required for routes
  /// that act on the record (e.g. first-day-photo SMS).
  attendanceId: string | null;
  child: RollCallChild;
  bookingType: string;
  status: "booked" | "present" | "absent";
  signInTime: string | null;
  signOutTime: string | null;
  signedInBy: { id: string; name: string } | null;
  signedOutBy: { id: string; name: string } | null;
  absenceReason: string | null;
  notes: string | null;
  firstDayPhotoSentAt: string | null;
  firstDayPhotoUrl: string | null;
}

export interface RollCallSummary {
  total: number;
  present: number;
  absent: number;
  notMarked: number;
}

export interface RollCallResponse {
  records: RollCallEntry[];
  summary: RollCallSummary;
}

export type RollCallAction = "sign_in" | "sign_out" | "mark_absent" | "undo";

interface RollCallActionPayload {
  childId: string;
  serviceId: string;
  date: string;
  sessionType: string;
  action: RollCallAction;
  absenceReason?: string;
  notes?: string;
}

/**
 * Generate a UUID even on browsers/contexts without `crypto.randomUUID()`.
 * Roll call runs on tablets in flight mode — older webviews may not have it.
 */
function genUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ── Hooks ────────────────────────────────────────────────

export function useRollCall(serviceId: string, date: string, sessionType: string) {
  const params = new URLSearchParams({ serviceId, date, sessionType });

  return useQuery<RollCallResponse>({
    queryKey: ["roll-call", serviceId, date, sessionType],
    queryFn: () => fetchApi<RollCallResponse>(`/api/attendance/roll-call?${params}`),
    enabled: !!serviceId && !!date && !!sessionType,
    staleTime: 15_000,
    refetchInterval: 30_000, // Auto-refetch every 30s for multi-device sync
    retry: 2,
  });
}

export function useUpdateRollCall() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: RollCallActionPayload) => {
      // Stamp the action with the educator's local time + a UUID so:
      //   1. Offline replays preserve the original sign-in time (server clamps
      //      anything older than 24h)
      //   2. Activity logs can correlate replays back to the original tap
      const enriched = {
        ...payload,
        occurredAt: new Date().toISOString(),
        clientMutationId: genUuid(),
      };
      const url = "/api/attendance/roll-call";
      try {
        return await mutateApi(url, { method: "POST", body: enriched });
      } catch (err) {
        // Queue on transient failures only. Validation 4xx (e.g. unknown
        // child) bubbles up so the educator sees an immediate red toast.
        const msg = err instanceof Error ? err.message : "";
        const isTransient =
          msg.includes("NetworkError") ||
          msg.toLowerCase().includes("failed to fetch") ||
          msg.startsWith("HTTP 5");
        if (!isTransient) throw err;
        await offlineQueue.enqueue({
          id: enriched.clientMutationId,
          url,
          method: "POST",
          body: enriched,
        });
        toast({
          description:
            "Saved offline — will sync when you're back online.",
        });
        return { queued: true as const };
      }
    },
    // Optimistic update
    onMutate: async (variables) => {
      const key = ["roll-call", variables.serviceId, variables.date, variables.sessionType];
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<RollCallResponse>(key);

      if (previous) {
        const now = new Date().toISOString();
        const updated = previous.records.map((entry) => {
          if (entry.childId !== variables.childId) return entry;
          switch (variables.action) {
            case "sign_in":
              return { ...entry, status: "present" as const, signInTime: now, signOutTime: null };
            case "sign_out":
              return { ...entry, signOutTime: now };
            case "mark_absent":
              return { ...entry, status: "absent" as const, absenceReason: variables.absenceReason ?? null, signInTime: null, signOutTime: null };
            case "undo":
              return { ...entry, status: "booked" as const, signInTime: null, signOutTime: null, absenceReason: null };
            default:
              return entry;
          }
        });
        const present = updated.filter((r) => r.status === "present").length;
        const absent = updated.filter((r) => r.status === "absent").length;
        const notMarked = updated.filter((r) => r.status === "booked").length;
        queryClient.setQueryData<RollCallResponse>(key, {
          records: updated,
          summary: { total: updated.length, present, absent, notMarked },
        });
      }

      return { previous, key };
    },
    onError: (err: Error, variables, context) => {
      // Revert on failure
      if (context?.previous) {
        queryClient.setQueryData(context.key, context.previous);
      }
      toast({ variant: "destructive", description: err.message || "Failed to update attendance" });
    },
    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["roll-call", variables.serviceId, variables.date, variables.sessionType],
      });
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
    },
  });
}

interface SendFirstDayPhotoPayload {
  attendanceId: string;
  photoUrl: string;
  serviceId: string;
  date: string;
  sessionType: string;
}

/**
 * Sends the first-day welcome photo SMS to the child's primary parent.
 * Uses the existing /api/upload/image flow first to host the file, then
 * POSTs the resulting blob URL to /api/attendance/[id]/first-day-photo.
 */
export function useSendFirstDayPhoto() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: SendFirstDayPhotoPayload) => {
      return await mutateApi<{ ok: true; sentTo: string }>(
        `/api/attendance/${encodeURIComponent(payload.attendanceId)}/first-day-photo`,
        { method: "POST", body: { photoUrl: payload.photoUrl } },
      );
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        description: err.message || "Failed to send first-day photo",
      });
    },
    onSuccess: (_data, variables) => {
      toast({ description: "First-day photo SMS sent to parent" });
      queryClient.invalidateQueries({
        queryKey: ["roll-call", variables.serviceId, variables.date, variables.sessionType],
      });
    },
  });
}

/**
 * Uploads a File to /api/upload/image and returns the public blob URL.
 * Kept as a plain async helper (not a hook) — the photo upload + SMS
 * dispatch run as a single user action, so toast / error handling lives
 * in `useSendFirstDayPhoto`.
 */
export async function uploadFirstDayPhoto(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/upload/image", { method: "POST", body: form });
  if (!res.ok) {
    let serverError = "";
    try {
      const json = (await res.json()) as { error?: string };
      serverError = json.error ?? "";
    } catch { /* ignore */ }
    throw new Error(serverError || `Photo upload failed (HTTP ${res.status})`);
  }
  const json = (await res.json()) as { url?: string };
  if (!json.url) throw new Error("Upload succeeded but server returned no URL");
  return json.url;
}
