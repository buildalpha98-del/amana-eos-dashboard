"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  MarketingPlatform,
  MarketingPostStatus,
  MarketingCampaignType,
  MarketingCampaignStatus,
  MarketingRecurrence,
} from "@prisma/client";

// ── Types ──────────────────────────────────────────────────

export interface CampaignData {
  id: string;
  name: string;
  type: MarketingCampaignType;
  status: MarketingCampaignStatus;
  startDate: string | null;
  endDate: string | null;
  platforms: MarketingPlatform[];
  goal: string | null;
  notes: string | null;
  designLink: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { posts: number; comments: number };
}

export interface CampaignDetail extends CampaignData {
  posts: PostData[];
  comments: CommentData[];
}

export interface PostData {
  id: string;
  title: string;
  platform: MarketingPlatform;
  status: MarketingPostStatus;
  scheduledDate: string | null;
  content: string | null;
  notes: string | null;
  designLink: string | null;
  pillar: string | null;
  assigneeId: string | null;
  assignee: { id: string; name: string; avatar: string | null } | null;
  campaignId: string | null;
  campaign: { id: string; name: string } | null;
  likes: number;
  comments: number;
  shares: number;
  reach: number;
  recurring: MarketingRecurrence;
  createdAt: string;
  updatedAt: string;
}

export interface CommentData {
  id: string;
  text: string;
  createdAt: string;
  author: { id: string; name: string; avatar: string | null };
}

export interface OverviewData {
  totalPosts: number;
  totalCampaigns: number;
  publishedThisMonth: number;
  activeCampaigns: number;
  upcomingPosts: PostData[];
  activeCampaignsList: (CampaignData & { _count: { posts: number } })[];
}

// ── Campaigns ──────────────────────────────────────────────

export function useCampaigns(filters?: {
  status?: string;
  type?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.type) params.set("type", filters.type);
  const qs = params.toString();

  return useQuery<CampaignData[]>({
    queryKey: ["campaigns", filters?.status, filters?.type],
    queryFn: async () => {
      const res = await fetch(`/api/marketing/campaigns${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error("Failed to fetch campaigns");
      return res.json();
    },
  });
}

export function useCampaign(id: string) {
  return useQuery<CampaignDetail>({
    queryKey: ["campaign", id],
    queryFn: async () => {
      const res = await fetch(`/api/marketing/campaigns/${id}`);
      if (!res.ok) throw new Error("Failed to fetch campaign");
      return res.json();
    },
    enabled: !!id,
  });
}

export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      name: string;
      type?: MarketingCampaignType;
      status?: MarketingCampaignStatus;
      startDate?: string;
      endDate?: string;
      platforms?: MarketingPlatform[];
      goal?: string;
      notes?: string;
      designLink?: string;
    }) => {
      const res = await fetch("/api/marketing/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create campaign");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      qc.invalidateQueries({ queryKey: ["marketingOverview"] });
    },
  });
}

export function useUpdateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      name?: string;
      type?: MarketingCampaignType;
      status?: MarketingCampaignStatus;
      startDate?: string | null;
      endDate?: string | null;
      platforms?: MarketingPlatform[];
      goal?: string | null;
      notes?: string | null;
      designLink?: string | null;
    }) => {
      const res = await fetch(`/api/marketing/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update campaign");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      qc.invalidateQueries({ queryKey: ["campaign"] });
      qc.invalidateQueries({ queryKey: ["marketingOverview"] });
    },
  });
}

export function useDeleteCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/marketing/campaigns/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete campaign");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      qc.invalidateQueries({ queryKey: ["marketingOverview"] });
    },
  });
}

// ── Campaign Comments ──────────────────────────────────────

export function useCampaignComments(campaignId: string) {
  return useQuery<CommentData[]>({
    queryKey: ["campaignComments", campaignId],
    queryFn: async () => {
      const res = await fetch(
        `/api/marketing/campaigns/${campaignId}/comments`
      );
      if (!res.ok) throw new Error("Failed to fetch comments");
      return res.json();
    },
    enabled: !!campaignId,
  });
}

export function useAddCampaignComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      campaignId,
      text,
    }: {
      campaignId: string;
      text: string;
    }) => {
      const res = await fetch(
        `/api/marketing/campaigns/${campaignId}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to add comment");
      }
      return res.json();
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({
        queryKey: ["campaignComments", vars.campaignId],
      });
      qc.invalidateQueries({ queryKey: ["campaign", vars.campaignId] });
    },
  });
}

// ── Posts ───────────────────────────────────────────────────

export function usePosts(filters?: {
  status?: string;
  platform?: string;
  assigneeId?: string;
  campaignId?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.platform) params.set("platform", filters.platform);
  if (filters?.assigneeId) params.set("assigneeId", filters.assigneeId);
  if (filters?.campaignId) params.set("campaignId", filters.campaignId);
  const qs = params.toString();

  return useQuery<PostData[]>({
    queryKey: [
      "posts",
      filters?.status,
      filters?.platform,
      filters?.assigneeId,
      filters?.campaignId,
    ],
    queryFn: async () => {
      const res = await fetch(`/api/marketing/posts${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error("Failed to fetch posts");
      return res.json();
    },
  });
}

export function usePost(id: string) {
  return useQuery<PostData & { recurringChildren?: { id: string; title: string; scheduledDate: string | null; status: MarketingPostStatus }[] }>({
    queryKey: ["post", id],
    queryFn: async () => {
      const res = await fetch(`/api/marketing/posts/${id}`);
      if (!res.ok) throw new Error("Failed to fetch post");
      return res.json();
    },
    enabled: !!id,
  });
}

export function useCreatePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      title: string;
      platform: MarketingPlatform;
      status?: MarketingPostStatus;
      scheduledDate?: string;
      content?: string;
      notes?: string;
      designLink?: string;
      pillar?: string;
      assigneeId?: string;
      campaignId?: string;
      recurring?: MarketingRecurrence;
    }) => {
      const res = await fetch("/api/marketing/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create post");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["posts"] });
      qc.invalidateQueries({ queryKey: ["marketingOverview"] });
    },
  });
}

export function useUpdatePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      title?: string;
      platform?: MarketingPlatform;
      status?: MarketingPostStatus;
      scheduledDate?: string | null;
      content?: string | null;
      notes?: string | null;
      designLink?: string | null;
      pillar?: string | null;
      assigneeId?: string | null;
      campaignId?: string | null;
      likes?: number;
      comments?: number;
      shares?: number;
      reach?: number;
    }) => {
      const res = await fetch(`/api/marketing/posts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update post");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["posts"] });
      qc.invalidateQueries({ queryKey: ["post"] });
      qc.invalidateQueries({ queryKey: ["marketingOverview"] });
    },
  });
}

export function useDeletePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/marketing/posts/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete post");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["posts"] });
      qc.invalidateQueries({ queryKey: ["marketingOverview"] });
    },
  });
}

// ── Overview ───────────────────────────────────────────────

export function useMarketingOverview() {
  return useQuery<OverviewData>({
    queryKey: ["marketingOverview"],
    queryFn: async () => {
      const res = await fetch("/api/marketing/overview");
      if (!res.ok) throw new Error("Failed to fetch overview");
      return res.json();
    },
  });
}

// ── Analytics ──────────────────────────────────────────────

export interface AnalyticsData {
  pillarBreakdown: { pillar: string; _count: { id: number } }[];
  platformBreakdown: { platform: string; _count: { id: number } }[];
  statusBreakdown: { status: string; _count: { id: number } }[];
  leaderboard: {
    id: string;
    title: string;
    platform: string;
    totalEngagement: number;
    assignee: { id: string; name: string; avatar: string | null } | null;
    campaign: { id: string; name: string } | null;
  }[];
  monthlyTrend: { month: string; posts: number; engagement: number }[];
}

export function useMarketingAnalytics(period: number) {
  return useQuery<AnalyticsData>({
    queryKey: ["marketingAnalytics", period],
    queryFn: async () => {
      const res = await fetch(`/api/marketing/analytics?period=${period}`);
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
  });
}

// ── KPIs ───────────────────────────────────────────────────

export interface KPIData {
  id: string;
  name: string;
  target: number;
  current: number;
  unit: string | null;
  period: string;
  category: string;
}

export function useKPIs() {
  return useQuery<KPIData[]>({
    queryKey: ["marketingKPIs"],
    queryFn: async () => {
      const res = await fetch("/api/marketing/kpis");
      if (!res.ok) throw new Error("Failed to fetch KPIs");
      return res.json();
    },
  });
}

export function useCreateKPI() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      name: string;
      target: number;
      current?: number;
      unit?: string | null;
      period: string;
      category: string;
    }) => {
      const res = await fetch("/api/marketing/kpis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create KPI");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketingKPIs"] });
    },
  });
}

export function useUpdateKPI() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      name?: string;
      target?: number;
      current?: number;
      unit?: string | null;
      period?: string;
      category?: string;
    }) => {
      const res = await fetch(`/api/marketing/kpis/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update KPI");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketingKPIs"] });
    },
  });
}

export function useDeleteKPI() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/marketing/kpis/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete KPI");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketingKPIs"] });
    },
  });
}

// ── Assets ─────────────────────────────────────────────────

export interface AssetData {
  id: string;
  name: string;
  type: string;
  url: string;
  tags: string[];
  createdAt: string;
}

export function useAssets(filters?: { type?: string; search?: string }) {
  const params = new URLSearchParams();
  if (filters?.type) params.set("type", filters.type);
  if (filters?.search) params.set("search", filters.search);
  const qs = params.toString();

  return useQuery<AssetData[]>({
    queryKey: ["marketingAssets", filters?.type, filters?.search],
    queryFn: async () => {
      const res = await fetch(`/api/marketing/assets${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error("Failed to fetch assets");
      return res.json();
    },
  });
}

export function useCreateAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; type?: string; url: string; tags?: string[] }) => {
      const res = await fetch("/api/marketing/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed to create asset"); }
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["marketingAssets"] }); },
  });
}

export function useUpdateAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; name?: string; type?: string; url?: string; tags?: string[] }) => {
      const res = await fetch(`/api/marketing/assets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed to update asset"); }
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["marketingAssets"] }); },
  });
}

export function useDeleteAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/marketing/assets/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete asset");
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["marketingAssets"] }); },
  });
}

// ── Templates ──────────────────────────────────────────────

export interface TemplateData {
  id: string;
  name: string;
  platform: string;
  pillar: string | null;
  content: string;
  notes: string | null;
  hashtags: string | null;
  createdAt: string;
}

export function useTemplates(platform?: string) {
  const qs = platform ? `?platform=${platform}` : "";
  return useQuery<TemplateData[]>({
    queryKey: ["marketingTemplates", platform],
    queryFn: async () => {
      const res = await fetch(`/api/marketing/templates${qs}`);
      if (!res.ok) throw new Error("Failed to fetch templates");
      return res.json();
    },
  });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; platform: string; pillar?: string; content: string; notes?: string; hashtags?: string }) => {
      const res = await fetch("/api/marketing/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed to create template"); }
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["marketingTemplates"] }); },
  });
}

export function useUpdateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; name?: string; platform?: string; pillar?: string | null; content?: string; notes?: string | null; hashtags?: string | null }) => {
      const res = await fetch(`/api/marketing/templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed to update template"); }
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["marketingTemplates"] }); },
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/marketing/templates/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete template");
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["marketingTemplates"] }); },
  });
}

export function useUseTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (templateId: string) => {
      const res = await fetch(`/api/marketing/templates/${templateId}/use`, { method: "POST" });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed to use template"); }
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["posts"] }); },
  });
}

// ── Hashtag Sets ───────────────────────────────────────────

export interface HashtagSetData {
  id: string;
  name: string;
  category: string;
  tags: string;
  createdAt: string;
}

export function useHashtagSets(category?: string) {
  const qs = category ? `?category=${category}` : "";
  return useQuery<HashtagSetData[]>({
    queryKey: ["marketingHashtags", category],
    queryFn: async () => {
      const res = await fetch(`/api/marketing/hashtags${qs}`);
      if (!res.ok) throw new Error("Failed to fetch hashtag sets");
      return res.json();
    },
  });
}

export function useCreateHashtagSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; category: string; tags: string }) => {
      const res = await fetch("/api/marketing/hashtags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed to create hashtag set"); }
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["marketingHashtags"] }); },
  });
}

export function useUpdateHashtagSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; name?: string; category?: string; tags?: string }) => {
      const res = await fetch(`/api/marketing/hashtags/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed to update hashtag set"); }
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["marketingHashtags"] }); },
  });
}

export function useDeleteHashtagSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/marketing/hashtags/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete hashtag set");
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["marketingHashtags"] }); },
  });
}
