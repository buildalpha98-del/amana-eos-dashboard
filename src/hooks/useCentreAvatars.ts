"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import type { AvatarFreshness } from "@/lib/centre-avatar/freshness";
import type {
  CentreAvatarInsightSource,
  CentreAvatarInsightStatus,
} from "@prisma/client";

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
  return useMutation({
    mutationFn: (serviceId: string) =>
      mutateApi<{ ok: boolean }>(`/api/centre-avatars/${serviceId}/open`, {
        method: "POST",
      }),
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
  });
}

export function useAddInsight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      serviceId,
      ...body
    }: {
      serviceId: string;
      occurredAt: string;
      source: CentreAvatarInsightSource;
      insight: string;
      impactOnAvatar?: string | null;
    }) =>
      mutateApi<{ insight: InsightRow }>(
        `/api/centre-avatars/${serviceId}/insights`,
        { method: "POST", body },
      ),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["centre-avatar", v.serviceId] });
    },
  });
}

export function useAddCampaignLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      serviceId,
      ...body
    }: {
      serviceId: string;
      occurredAt: string;
      campaignName: string;
      contentUsed?: string | null;
      result?: string | null;
      learnings?: string | null;
      marketingCampaignId?: string | null;
    }) =>
      mutateApi<{ log: CampaignLogRow }>(
        `/api/centre-avatars/${serviceId}/campaign-log`,
        { method: "POST", body },
      ),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["centre-avatar", v.serviceId] });
    },
  });
}

export function useAddCheckIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      serviceId,
      ...body
    }: {
      serviceId: string;
      occurredAt: string;
      topicsDiscussed: string;
      actionItems?: string | null;
      followUpDate?: string | null;
      coordinatorUserId?: string | null;
    }) =>
      mutateApi<{ checkIn: CheckInRow }>(
        `/api/centre-avatars/${serviceId}/check-ins`,
        { method: "POST", body },
      ),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["centre-avatar", v.serviceId] });
    },
  });
}

export function useAddSchoolLiaison() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      serviceId,
      ...body
    }: {
      serviceId: string;
      occurredAt: string;
      contactName: string;
      purpose: string;
      outcome?: string | null;
      nextStep?: string | null;
      schoolCommId?: string | null;
    }) =>
      mutateApi<{ liaison: LiaisonRow }>(
        `/api/centre-avatars/${serviceId}/school-liaison`,
        { method: "POST", body },
      ),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["centre-avatar", v.serviceId] });
    },
  });
}
