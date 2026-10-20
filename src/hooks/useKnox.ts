"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { ADMIN_ROLES } from "@/lib/role-permissions";
import type { KnoxSubjectType, KnoxTier } from "@/lib/knox/format";

/**
 * Knox (incident triage) client hooks over /api/knox/*.
 *
 * Every Knox route is open to the admin tier plus coordinators (`member`) —
 * the same list as `KNOX_ROLES` in src/app/api/knox/_lib.ts. Hooks stay
 * disabled for anyone else so a page an educator can open (incidents,
 * complaints) never fires a 403 at them.
 */
const KNOX_CLIENT_ROLES: readonly string[] = [...ADMIN_ROLES, "member"];

export function canUseKnox(role: string | null | undefined): boolean {
  return !!role && KNOX_CLIENT_ROLES.includes(role);
}

export function useCanUseKnox(): boolean {
  return useKnoxAccess().canUse;
}

/** `loading` while the session resolves, so pages don't flash a "not available" state. */
export function useKnoxAccess(): { canUse: boolean; loading: boolean } {
  const { data: session, status } = useSession();
  return { canUse: canUseKnox(session?.user?.role), loading: status === "loading" };
}

// ── Response shapes (mirror src/app/api/knox/inbox/route.ts selections) ──

export interface KnoxAlert {
  id: string;
  channel: string;
  escalationLevel: number;
  recipientUserId: string | null;
  sentAt: string;
  delivered: boolean;
  acknowledgedAt: string | null;
}

export interface KnoxClockData {
  kind: string;
  dueAt: string;
  basis: string;
  overdue: boolean;
}

export interface KnoxAssessment {
  id: string;
  jobId: string;
  subjectType: KnoxSubjectType;
  subjectId: string;
  serviceId: string;
  tier: KnoxTier;
  ruleHits: string[];
  /** Stored as Json; normalised by `assessmentClocks()`. */
  clocks: unknown;
  alerted: boolean;
  source: string;
  modelId: string | null;
  severityOpinion: string | null;
  rationale: string | null;
  missingFields: string[];
  suggestedSeverity: string | null;
  suggestedCategory: string | null;
  parentNoticeDraft: string | null;
  regulatorPackDraft: string | null;
  modelError: string | null;
  createdAt: string;
  /** Present on `awaitingAck` and `recent`, absent on the subject slice. */
  service?: { name: string };
  /** Present on `awaitingAck` and the subject slice, absent on `recent`. */
  alerts?: KnoxAlert[];
}

export interface KnoxPendingAction {
  id: string;
  proposedBy: string;
  userId: string | null;
  serviceId: string | null;
  kind: string;
  subjectType: KnoxSubjectType | null;
  subjectId: string | null;
  payload: unknown;
  summary: string;
  rationale: string | null;
  assessmentId: string | null;
  expiresAt: string;
  committedAt: string | null;
  dismissedAt: string | null;
  dismissReason: string | null;
  resultId: string | null;
  createdAt: string;
}

export interface KnoxFailedJob {
  id: string;
  subjectType: KnoxSubjectType;
  subjectId: string;
  serviceId: string;
  reason: string;
  status: string;
  attempts: number;
  lastError: string | null;
  updatedAt: string;
  createdAt: string;
}

export interface KnoxInbox {
  awaitingAck: KnoxAssessment[];
  openCards: KnoxPendingAction[];
  recent: KnoxAssessment[];
  /** Always `[]` for non-admin roles. */
  failedJobs: KnoxFailedJob[];
  subject?: { assessments: KnoxAssessment[]; cards: KnoxPendingAction[] };
}

/** `clocks` is Json in the schema; keep only well-formed entries. */
export function assessmentClocks(a: Pick<KnoxAssessment, "clocks">): KnoxClockData[] {
  if (!Array.isArray(a.clocks)) return [];
  return a.clocks.flatMap((c): KnoxClockData[] => {
    if (!c || typeof c !== "object") return [];
    const { kind, dueAt, basis, overdue } = c as Record<string, unknown>;
    if (typeof kind !== "string" || typeof dueAt !== "string") return [];
    return [{ kind, dueAt, basis: typeof basis === "string" ? basis : "", overdue: overdue === true }];
  });
}

/**
 * True when alerts went out on THIS assessment and nobody has acknowledged any
 * of them yet. For a record's panel use `subjectNeedsAck` instead: a re-triage
 * leaves the alert on an older assessment.
 */
export function needsAcknowledgement(a: Pick<KnoxAssessment, "alerted" | "alerts">): boolean {
  return a.alerted && !(a.alerts ?? []).some((al) => al.acknowledgedAt);
}

/**
 * Record-level acknowledgement (shared with the escalation sweep): the panel
 * shows Acknowledge on the LATEST assessment whenever any assessment of the
 * record still needs it; History items never show the button.
 */
export { subjectNeedsAck, subjectAcknowledgedAt } from "@/lib/knox/ack";

/** Earliest acknowledgement time across the assessment's alerts, if any. */
export function acknowledgedAt(a: Pick<KnoxAssessment, "alerts">): string | null {
  const times = (a.alerts ?? []).map((al) => al.acknowledgedAt).filter((t): t is string => !!t);
  if (times.length === 0) return null;
  return times.reduce((min, t) => (t < min ? t : min));
}

// ── Keys: primitives only ──

export const knoxKeys = {
  all: () => ["knox"],
  inbox: (subject?: string) => ["knox", "inbox", subject ?? ""],
  subject: (type: KnoxSubjectType, id: string) => ["knox", "inbox", `${type}:${id}`],
  tiers: (type: KnoxSubjectType, ids: readonly string[]) => ["knox", "tiers", type, [...ids].sort().join(",")],
};

const MAX_TIER_IDS = 200; // mirrors the API's cap

const onError = (err: Error) => {
  toast({ variant: "destructive", description: err.message || "Something went wrong" });
};

// ── Queries ──

export function useKnoxInbox(subject?: string) {
  const enabled = useCanUseKnox();
  return useQuery({
    queryKey: knoxKeys.inbox(subject),
    queryFn: () =>
      fetchApi<KnoxInbox>(
        subject ? `/api/knox/inbox?subject=${encodeURIComponent(subject)}` : "/api/knox/inbox",
      ),
    enabled,
    retry: 2,
    staleTime: 30_000,
    // Every Knox surface renders its own inline error state.
    meta: { suppressGlobalErrorToast: true },
  });
}

/** The inbox's `subject` slice for one record: every assessment (newest first) and card. */
export function useKnoxSubject(type: KnoxSubjectType, id: string) {
  const enabled = useCanUseKnox();
  return useQuery({
    queryKey: knoxKeys.subject(type, id),
    queryFn: () =>
      fetchApi<KnoxInbox>(`/api/knox/inbox?subject=${encodeURIComponent(`${type}:${id}`)}`),
    select: (d) => d.subject ?? { assessments: [], cards: [] },
    enabled: enabled && !!id,
    retry: 2,
    staleTime: 30_000,
    meta: { suppressGlobalErrorToast: true },
  });
}

/** Latest Knox tier per record, for register badges — one request per table. */
export function useKnoxTiers(type: KnoxSubjectType, ids: readonly string[]) {
  const enabled = useCanUseKnox();
  const sorted = [...new Set(ids)].sort();
  const query = useQuery({
    queryKey: knoxKeys.tiers(type, sorted),
    queryFn: async () => {
      const chunks: string[][] = [];
      for (let i = 0; i < sorted.length; i += MAX_TIER_IDS) chunks.push(sorted.slice(i, i + MAX_TIER_IDS));
      const results = await Promise.all(
        chunks.map((chunk) =>
          fetchApi<{ tiers: Record<string, KnoxTier | null> }>(
            `/api/knox/inbox?tiersFor=${encodeURIComponent(`${type}:${chunk.join(",")}`)}`,
          ),
        ),
      );
      return Object.assign({}, ...results.map((r) => r.tiers)) as Record<string, KnoxTier | null>;
    },
    enabled: enabled && sorted.length > 0,
    retry: 2,
    staleTime: 30_000,
    // Badges are decorative: a failure shows no badge, never a toast.
    meta: { suppressGlobalErrorToast: true },
  });
  return query.data ?? {};
}

// ── Mutations ──

function useInvalidateKnox() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: knoxKeys.all() });
}

export function useAcknowledge() {
  const invalidate = useInvalidateKnox();
  return useMutation({
    mutationFn: (assessmentId: string) =>
      mutateApi<{ acknowledgedAt: string }>(`/api/knox/assessments/${assessmentId}/ack`, {
        method: "POST",
      }),
    onSuccess: () => {
      invalidate();
      toast({ description: "Acknowledged" });
    },
    onError,
  });
}

/**
 * Lists that show the records an approved card changes (severity, notifiable,
 * reportable): the incidents page (list, summary, trends), the complaints
 * register, and the service's staff-incidents register. Prefixes only.
 */
export function recordListKeysAfterApprove(serviceId: string | null | undefined): string[][] {
  return [
    ["incidents"],
    ["incidents-summary"],
    ["incidents-trends"],
    ["compliance", "complaints"],
    // StaffIncidentsPanel keys on ["service", serviceId, "staff-incidents"];
    // a card without a service (never expected for these subjects) falls back wide.
    serviceId ? ["service", serviceId, "staff-incidents"] : ["service"],
  ];
}

export function useApproveAction() {
  const qc = useQueryClient();
  const invalidate = useInvalidateKnox();
  return useMutation({
    mutationFn: ({ id }: { id: string; serviceId?: string | null }) =>
      mutateApi<{ resultId: string; jobId: string | null }>(`/api/knox/actions/${id}/approve`, {
        method: "POST",
      }),
    onSuccess: (_data, { serviceId }) => {
      invalidate();
      for (const queryKey of recordListKeysAfterApprove(serviceId)) qc.invalidateQueries({ queryKey });
      toast({ description: "Approved — the change has been applied" });
    },
    onError,
  });
}

export function useDismissAction() {
  const invalidate = useInvalidateKnox();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      mutateApi<{ ok: true }>(`/api/knox/actions/${id}/dismiss`, {
        method: "POST",
        body: reason?.trim() ? { reason: reason.trim() } : {},
      }),
    onSuccess: () => {
      invalidate();
      toast({ description: "Dismissed" });
    },
    onError,
  });
}
