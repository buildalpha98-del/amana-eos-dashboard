"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import type { AvatarFreshness } from "@/lib/centre-avatar/freshness";
import type {
  CentreAvatarInsightSource,
  CentreAvatarInsightStatus,
} from "@prisma/client";

// Shared destructive-toast handler — every mutation in this file must use it
// per the global "no silent mutation failures" rule.
const onMutationError = (err: Error) =>
  toast({
    variant: "destructive",
    description: err.message || "Something went wrong",
  });

/**
 * Build an optimistic-update handler set for log-row adds.
 *
 * Prepends a temp row (id = `temp-<timestamp>`) to the avatar detail's log
 * array immediately. On error, rolls back to the snapshot. On settle,
 * invalidates so the real row replaces the optimistic one.
 *
 * Used by useAddInsight / CampaignLog / CheckIn / SchoolLiaison.
 */
function buildOptimisticAdd<
  K extends "insights" | "campaignLog" | "coordinatorCheckIns" | "schoolLiaisonLog",
  Vars extends { serviceId: string },
>(qc: ReturnType<typeof useQueryClient>, logKey: K) {
  return {
    onMutate: async (vars: Vars) => {
      const detailKey = ["centre-avatar", vars.serviceId];
      await qc.cancelQueries({ queryKey: detailKey });
      const prev = qc.getQueryData<CentreAvatarDetail>(detailKey);
      if (prev) {
        const tempRow = {
          id: `temp-${Date.now()}`,
          ...buildOptimisticRow(logKey, vars),
        };
        qc.setQueryData<CentreAvatarDetail>(detailKey, {
          ...prev,
          [logKey]: [tempRow, ...(prev[logKey] as unknown[])],
        } as CentreAvatarDetail);
      }
      return { prev };
    },
    onError: (err: Error, _vars: Vars, context?: { prev?: CentreAvatarDetail }) => {
      if (context?.prev) {
        qc.setQueryData(["centre-avatar", _vars.serviceId], context.prev);
      }
      onMutationError(err);
    },
    onSettled: (_data: unknown, _err: unknown, vars: Vars) => {
      qc.invalidateQueries({ queryKey: ["centre-avatar", vars.serviceId] });
      qc.invalidateQueries({ queryKey: ["centre-avatars"] });
    },
  };
}

function buildOptimisticRow(
  logKey: "insights" | "campaignLog" | "coordinatorCheckIns" | "schoolLiaisonLog",
  vars: Record<string, unknown>,
): Record<string, unknown> {
  const now = new Date().toISOString();
  switch (logKey) {
    case "insights":
      return {
        occurredAt: (vars.occurredAt as string) ?? now,
        source: (vars.source as string) ?? "manual",
        insight: (vars.insight as string) ?? "",
        impactOnAvatar: (vars.impactOnAvatar as string) ?? null,
        status: "pending_review",
        harvestedFrom: "manual",
        sourceRecordId: null,
        createdBy: null,
        createdAt: now,
      };
    case "campaignLog":
      return {
        occurredAt: (vars.occurredAt as string) ?? now,
        campaignName: (vars.campaignName as string) ?? "",
        contentUsed: (vars.contentUsed as string) ?? null,
        result: (vars.result as string) ?? null,
        learnings: (vars.learnings as string) ?? null,
        marketingCampaignId: (vars.marketingCampaignId as string) ?? null,
        marketingCampaign: null,
        createdBy: null,
      };
    case "coordinatorCheckIns":
      return {
        occurredAt: (vars.occurredAt as string) ?? now,
        topicsDiscussed: (vars.topicsDiscussed as string) ?? "",
        actionItems: (vars.actionItems as string) ?? null,
        followUpDate: (vars.followUpDate as string) ?? null,
        coordinator: null,
        createdBy: null,
      };
    case "schoolLiaisonLog":
      return {
        occurredAt: (vars.occurredAt as string) ?? now,
        contactName: (vars.contactName as string) ?? "",
        purpose: (vars.purpose as string) ?? "",
        outcome: (vars.outcome as string) ?? null,
        nextStep: (vars.nextStep as string) ?? null,
        schoolCommId: (vars.schoolCommId as string) ?? null,
        createdBy: null,
      };
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CentreAvatarSummary = {
  id: string;
  serviceId: string;
  serviceName: string;
  state: string | null;
  lastUpdatedAt: string;
  lastUpdatedBy: { id: string; name: string | null } | null;
  daysSinceUpdate: number;
  freshness: AvatarFreshness;
  pendingInsightsCount: number;
};

export type CentreAvatarDetail = {
  id: string;
  serviceId: string;
  serviceName: string;
  state: string | null;
  version: number;
  snapshot: unknown | null;
  parentAvatar: unknown | null;
  programmeMix: unknown | null;
  assetLibrary: unknown | null;
  lastUpdatedAt: string;
  lastUpdatedBy: { id: string; name: string | null } | null;
  lastReviewedAt: string | null;
  lastReviewedBy: { id: string; name: string | null } | null;
  lastFullReviewAt: string | null;
  lastOpenedAt: string | null;
  lastOpenedBy: { id: string; name: string | null } | null;
  daysSinceUpdate: number;
  freshness: AvatarFreshness;
  insights: InsightRow[];
  campaignLog: CampaignLogRow[];
  coordinatorCheckIns: CheckInRow[];
  schoolLiaisonLog: LiaisonRow[];
  updateLog: UpdateLogRow[];
};

export type InsightRow = {
  id: string;
  occurredAt: string;
  source: CentreAvatarInsightSource;
  insight: string;
  impactOnAvatar: string | null;
  status: CentreAvatarInsightStatus;
  harvestedFrom: string | null;
  sourceRecordId: string | null;
  createdBy: { id: string; name: string | null } | null;
  createdAt: string;
};

export type CampaignLogRow = {
  id: string;
  occurredAt: string;
  campaignName: string;
  contentUsed: string | null;
  result: string | null;
  learnings: string | null;
  marketingCampaignId: string | null;
  marketingCampaign: { id: string; name: string } | null;
  createdBy: { id: string; name: string | null } | null;
};

export type CheckInRow = {
  id: string;
  occurredAt: string;
  topicsDiscussed: string;
  actionItems: string | null;
  followUpDate: string | null;
  coordinator: { id: string; name: string | null } | null;
  createdBy: { id: string; name: string | null } | null;
};

export type LiaisonRow = {
  id: string;
  occurredAt: string;
  contactName: string;
  purpose: string;
  outcome: string | null;
  nextStep: string | null;
  schoolCommId: string | null;
  createdBy: { id: string; name: string | null } | null;
};

export type UpdateLogRow = {
  id: string;
  occurredAt: string;
  sectionsChanged: string[];
  summary: string;
  updatedBy: { id: string; name: string | null } | null;
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useCentreAvatars() {
  return useQuery({
    queryKey: ["centre-avatars"],
    queryFn: () =>
      fetchApi<{ avatars: CentreAvatarSummary[] }>("/api/centre-avatars").then(
        (d) => d.avatars,
      ),
    retry: 2,
    staleTime: 30_000,
  });
}

export function useCentreAvatar(serviceId: string | null | undefined) {
  return useQuery({
    queryKey: ["centre-avatar", serviceId],
    enabled: !!serviceId,
    queryFn: () =>
      fetchApi<{ avatar: CentreAvatarDetail }>(
        `/api/centre-avatars/${serviceId}`,
      ).then((d) => d.avatar),
    retry: 2,
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useOpenCentreAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (serviceId: string) =>
      mutateApi<{
        ok: boolean;
        lastOpenedAt: string;
        lastOpenedById: string;
      }>(`/api/centre-avatars/${serviceId}/open`, {
        method: "POST",
      }),
    onSuccess: (_data, serviceId) => {
      // Invalidate gate-status so any open campaign modal sees the fresh stamp.
      // Also invalidate the avatar detail so its lastOpenedAt updates inline.
      qc.invalidateQueries({ queryKey: ["gate-status", serviceId] });
      qc.invalidateQueries({ queryKey: ["centre-avatar", serviceId] });
    },
    onError: onMutationError,
  });
}

export function useUpdateCentreAvatarSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      serviceId,
      section,
      content,
      changeSummary,
    }: {
      serviceId: string;
      section: string;
      content: Record<string, unknown>;
      changeSummary?: string;
    }) =>
      mutateApi<{ ok: boolean }>(`/api/centre-avatars/${serviceId}`, {
        method: "PATCH",
        body: { section, content, changeSummary },
      }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["centre-avatar", v.serviceId] });
      qc.invalidateQueries({ queryKey: ["centre-avatars"] });
    },
    onError: onMutationError,
  });
}

export function useMarkCentreAvatarReviewed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (serviceId: string) =>
      mutateApi<{ ok: boolean }>(
        `/api/centre-avatars/${serviceId}/mark-reviewed`,
        { method: "POST" },
      ),
    onSuccess: (_d, serviceId) => {
      qc.invalidateQueries({ queryKey: ["centre-avatar", serviceId] });
      qc.invalidateQueries({ queryKey: ["centre-avatars"] });
    },
    onError: onMutationError,
  });
}

export function useApproveInsight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      serviceId,
      insightId,
      impactOnAvatar,
    }: {
      serviceId: string;
      insightId: string;
      impactOnAvatar?: string | null;
    }) =>
      mutateApi<{ ok: boolean }>(
        `/api/centre-avatars/${serviceId}/insights/${insightId}/approve`,
        { method: "POST", body: { impactOnAvatar } },
      ),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["centre-avatar", v.serviceId] });
      qc.invalidateQueries({ queryKey: ["centre-avatars"] });
    },
    onError: onMutationError,
  });
}

export function useDismissInsight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      serviceId,
      insightId,
    }: {
      serviceId: string;
      insightId: string;
    }) =>
      mutateApi<{ ok: boolean }>(
        `/api/centre-avatars/${serviceId}/insights/${insightId}/dismiss`,
        { method: "POST" },
      ),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["centre-avatar", v.serviceId] });
      qc.invalidateQueries({ queryKey: ["centre-avatars"] });
    },
    onError: onMutationError,
  });
}

export function useAddInsight() {
  const qc = useQueryClient();
  type Vars = {
    serviceId: string;
    occurredAt: string;
    source: CentreAvatarInsightSource;
    insight: string;
    impactOnAvatar?: string | null;
  };
  return useMutation({
    mutationFn: ({ serviceId, ...body }: Vars) =>
      mutateApi<{ insight: InsightRow }>(
        `/api/centre-avatars/${serviceId}/insights`,
        { method: "POST", body },
      ),
    ...buildOptimisticAdd<"insights", Vars>(qc, "insights"),
  });
}

export function useAddCampaignLog() {
  const qc = useQueryClient();
  type Vars = {
    serviceId: string;
    occurredAt: string;
    campaignName: string;
    contentUsed?: string | null;
    result?: string | null;
    learnings?: string | null;
    marketingCampaignId?: string | null;
  };
  return useMutation({
    mutationFn: ({ serviceId, ...body }: Vars) =>
      mutateApi<{ log: CampaignLogRow }>(
        `/api/centre-avatars/${serviceId}/campaign-log`,
        { method: "POST", body },
      ),
    ...buildOptimisticAdd<"campaignLog", Vars>(qc, "campaignLog"),
  });
}

export function useAddCheckIn() {
  const qc = useQueryClient();
  type Vars = {
    serviceId: string;
    occurredAt: string;
    topicsDiscussed: string;
    actionItems?: string | null;
    followUpDate?: string | null;
    coordinatorUserId?: string | null;
  };
  return useMutation({
    mutationFn: ({ serviceId, ...body }: Vars) =>
      mutateApi<{ checkIn: CheckInRow }>(
        `/api/centre-avatars/${serviceId}/check-ins`,
        { method: "POST", body },
      ),
    ...buildOptimisticAdd<"coordinatorCheckIns", Vars>(qc, "coordinatorCheckIns"),
  });
}

export function useAddSchoolLiaison() {
  const qc = useQueryClient();
  type Vars = {
    serviceId: string;
    occurredAt: string;
    contactName: string;
    purpose: string;
    outcome?: string | null;
    nextStep?: string | null;
    schoolCommId?: string | null;
  };
  return useMutation({
    mutationFn: ({ serviceId, ...body }: Vars) =>
      mutateApi<{ liaison: LiaisonRow }>(
        `/api/centre-avatars/${serviceId}/school-liaison`,
        { method: "POST", body },
      ),
    ...buildOptimisticAdd<"schoolLiaisonLog", Vars>(qc, "schoolLiaisonLog"),
  });
}
