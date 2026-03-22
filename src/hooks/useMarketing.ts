"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import type {
  MarketingPlatform,
  MarketingPostStatus,
  MarketingCampaignType,
  MarketingCampaignStatus,
  MarketingRecurrence,
  MarketingTaskStatus,
  MarketingTaskPriority,
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
  budget: number | null;
  location: string | null;
  deliverables: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { posts: number; comments: number };
  services?: { service: { id: string; name: string; code: string } }[];
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
  services?: { service: { id: string; name: string; code: string } }[];
  clonedFromId?: string;
  externalPostId?: string;
  externalUrl?: string;
  engagementSyncedAt?: string;
  approvedById?: string | null;
  approvedBy?: { id: string; name: string } | null;
  approvedAt?: string | null;
  rejectionReason?: string | null;
  canvaDesignId?: string | null;
  canvaDesignUrl?: string | null;
  canvaExportUrl?: string | null;
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
  centresWithContent?: number;
  centresWithoutContent?: number;
  taskCounts?: { status: string; _count: { id: number } }[];
  overdueTasks?: { id: string; title: string; dueDate: string; priority: string; assignee: { id: string; name: string } | null }[];
  dueSoonTasks?: { id: string; title: string; dueDate: string; priority: string; assignee: { id: string; name: string } | null }[];
  recentActivity?: { id: string; action: string; entityType: string; entityId: string; details: string | null; createdAt: string; user: { id: string; name: string } }[];
}

// ── Campaigns ──────────────────────────────────────────────

export function useCampaigns(filters?: {
  status?: string;
  type?: string;
  serviceId?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.type) params.set("type", filters.type);
  if (filters?.serviceId) params.set("serviceId", filters.serviceId);
  const qs = params.toString();

  return useQuery<CampaignData[]>({
    queryKey: ["campaigns", filters?.status, filters?.type, filters?.serviceId],
    queryFn: async () => {
      return fetchApi<CampaignData[]>(`/api/marketing/campaigns${qs ? `?${qs}` : ""}`);
    },
    retry: 2,
  });
}

export function useCampaign(id: string) {
  return useQuery<CampaignDetail>({
    queryKey: ["campaign", id],
    queryFn: async () => {
      return fetchApi<CampaignDetail>(`/api/marketing/campaigns/${id}`);
    },
    enabled: !!id,
    retry: 2,
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
      budget?: number;
      location?: string;
      deliverables?: string;
      serviceIds?: string[];
    }) => {
      return mutateApi("/api/marketing/campaigns", {
        method: "POST",
        body: data,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      qc.invalidateQueries({ queryKey: ["marketingOverview"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
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
      budget?: number | null;
      location?: string | null;
      deliverables?: string | null;
      serviceIds?: string[];
    }) => {
      return mutateApi(`/api/marketing/campaigns/${id}`, {
        method: "PATCH",
        body: data,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      qc.invalidateQueries({ queryKey: ["campaign"] });
      qc.invalidateQueries({ queryKey: ["marketingOverview"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useDeleteCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return mutateApi(`/api/marketing/campaigns/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      qc.invalidateQueries({ queryKey: ["marketingOverview"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ── Campaign Comments ──────────────────────────────────────

export function useCampaignComments(campaignId: string) {
  return useQuery<CommentData[]>({
    queryKey: ["campaignComments", campaignId],
    queryFn: async () => {
      return fetchApi<CommentData[]>(
        `/api/marketing/campaigns/${campaignId}/comments`
      );
    },
    enabled: !!campaignId,
    retry: 2,
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
      return mutateApi(
        `/api/marketing/campaigns/${campaignId}/comments`,
        {
          method: "POST",
          body: { text },
        }
      );
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({
        queryKey: ["campaignComments", vars.campaignId],
      });
      qc.invalidateQueries({ queryKey: ["campaign", vars.campaignId] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ── Posts ───────────────────────────────────────────────────

export function usePosts(filters?: {
  status?: string;
  platform?: string;
  assigneeId?: string;
  campaignId?: string;
  serviceId?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.platform) params.set("platform", filters.platform);
  if (filters?.assigneeId) params.set("assigneeId", filters.assigneeId);
  if (filters?.campaignId) params.set("campaignId", filters.campaignId);
  if (filters?.serviceId) params.set("serviceId", filters.serviceId);
  const qs = params.toString();

  return useQuery<PostData[]>({
    queryKey: [
      "marketing-posts",
      filters?.status,
      filters?.platform,
      filters?.assigneeId,
      filters?.campaignId,
      filters?.serviceId,
    ],
    queryFn: async () => {
      return fetchApi<PostData[]>(`/api/marketing/posts${qs ? `?${qs}` : ""}`);
    },
    retry: 2,
  });
}

export function usePost(id: string) {
  return useQuery<PostData & { recurringChildren?: { id: string; title: string; scheduledDate: string | null; status: MarketingPostStatus }[] }>({
    queryKey: ["post", id],
    queryFn: async () => {
      return fetchApi(`/api/marketing/posts/${id}`);
    },
    enabled: !!id,
    retry: 2,
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
      serviceIds?: string[];
      canvaDesignUrl?: string;
    }) => {
      return mutateApi("/api/marketing/posts", {
        method: "POST",
        body: data,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketing-posts"] });
      qc.invalidateQueries({ queryKey: ["marketingOverview"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
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
      serviceIds?: string[];
      externalPostId?: string | null;
      externalUrl?: string | null;
    }) => {
      return mutateApi(`/api/marketing/posts/${id}`, {
        method: "PATCH",
        body: data,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketing-posts"] });
      qc.invalidateQueries({ queryKey: ["post"] });
      qc.invalidateQueries({ queryKey: ["marketingOverview"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useDeletePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return mutateApi(`/api/marketing/posts/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketing-posts"] });
      qc.invalidateQueries({ queryKey: ["marketingOverview"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ── Overview ───────────────────────────────────────────────

export function useMarketingOverview(serviceId?: string) {
  const params = new URLSearchParams();
  if (serviceId) params.set("serviceId", serviceId);
  const qs = params.toString();

  return useQuery<OverviewData>({
    queryKey: ["marketing-overview", serviceId],
    queryFn: async () => {
      return fetchApi<OverviewData>(`/api/marketing/overview${qs ? `?${qs}` : ""}`);
    },
    retry: 2,
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

export function useMarketingAnalytics(period: number, serviceId?: string) {
  const params = new URLSearchParams();
  params.set("period", String(period));
  if (serviceId) params.set("serviceId", serviceId);
  const qs = params.toString();

  return useQuery<AnalyticsData>({
    queryKey: ["marketing-analytics", period, serviceId],
    queryFn: async () => {
      return fetchApi<AnalyticsData>(`/api/marketing/analytics?${qs}`);
    },
    retry: 2,
  });
}

// ── Coverage ───────────────────────────────────────────────

export function useCentreCoverage() {
  return useQuery({
    queryKey: ["marketing-coverage"],
    queryFn: async () => {
      return fetchApi<any>("/api/marketing/coverage");
    },
    retry: 2,
  });
}

// ── Batch Post Action ──────────────────────────────────────

export function useBatchPostAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { postIds: string[]; action: string; [key: string]: unknown }) => {
      return mutateApi("/api/marketing/posts/batch", {
        method: "POST",
        body: data,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketing-posts"] });
      qc.invalidateQueries({ queryKey: ["marketing-overview"] });
      qc.invalidateQueries({ queryKey: ["marketing-coverage"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
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
      return fetchApi<KPIData[]>("/api/marketing/kpis");
    },
    retry: 2,
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
      return mutateApi("/api/marketing/kpis", {
        method: "POST",
        body: data,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketingKPIs"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
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
      return mutateApi(`/api/marketing/kpis/${id}`, {
        method: "PATCH",
        body: data,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketingKPIs"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useDeleteKPI() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return mutateApi(`/api/marketing/kpis/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketingKPIs"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
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
      return fetchApi<AssetData[]>(`/api/marketing/assets${qs ? `?${qs}` : ""}`);
    },
    retry: 2,
  });
}

export function useCreateAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; type?: string; url: string; tags?: string[] }) => {
      return mutateApi("/api/marketing/assets", {
        method: "POST",
        body: data,
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["marketingAssets"] }); },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useUpdateAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; name?: string; type?: string; url?: string; tags?: string[] }) => {
      return mutateApi(`/api/marketing/assets/${id}`, {
        method: "PATCH",
        body: data,
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["marketingAssets"] }); },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useDeleteAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return mutateApi(`/api/marketing/assets/${id}`, { method: "DELETE" });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["marketingAssets"] }); },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
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
      return fetchApi<TemplateData[]>(`/api/marketing/templates${qs}`);
    },
    retry: 2,
  });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; platform: string; pillar?: string; content: string; notes?: string; hashtags?: string }) => {
      return mutateApi("/api/marketing/templates", {
        method: "POST",
        body: data,
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["marketingTemplates"] }); },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useUpdateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; name?: string; platform?: string; pillar?: string | null; content?: string; notes?: string | null; hashtags?: string | null }) => {
      return mutateApi(`/api/marketing/templates/${id}`, {
        method: "PATCH",
        body: data,
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["marketingTemplates"] }); },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return mutateApi(`/api/marketing/templates/${id}`, { method: "DELETE" });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["marketingTemplates"] }); },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useUseTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (templateId: string) => {
      return mutateApi(`/api/marketing/templates/${templateId}/use`, { method: "POST" });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["marketing-posts"] }); },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
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
      return fetchApi<HashtagSetData[]>(`/api/marketing/hashtags${qs}`);
    },
    retry: 2,
  });
}

export function useCreateHashtagSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; category: string; tags: string }) => {
      return mutateApi("/api/marketing/hashtags", {
        method: "POST",
        body: data,
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["marketingHashtags"] }); },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useUpdateHashtagSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; name?: string; category?: string; tags?: string }) => {
      return mutateApi(`/api/marketing/hashtags/${id}`, {
        method: "PATCH",
        body: data,
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["marketingHashtags"] }); },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useDeleteHashtagSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return mutateApi(`/api/marketing/hashtags/${id}`, { method: "DELETE" });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["marketingHashtags"] }); },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ── Import Content Calendar ─────────────────────────────────

export interface ImportPreviewPost {
  rowIndex: number;
  title: string;
  platform: string;
  platformRaw: string;
  status: string;
  scheduledDate: string | null;
  content: string | null;
  hashtags: string | null;
  campaign: string | null;
  pillar: string | null;
  designLink: string | null;
  notes: string | null;
  error: string | null;
}

export interface ImportPreviewData {
  posts: ImportPreviewPost[];
  errors: { row: number; message: string }[];
  summary: {
    totalRows: number;
    validPosts: number;
    errorCount: number;
    campaigns: string[];
  };
}

export interface ImportResultData {
  success: boolean;
  summary: {
    postsCreated: number;
    campaignsCreated: number;
    campaignsMatched: number;
    errors: number;
  };
  posts: { id: string; title: string; platform: string }[];
  errors: { row: number; message: string }[];
}

// FormData upload — keep raw fetch
export function useImportCalendarPreview() {
  return useMutation<ImportPreviewData, Error, File>({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/marketing/import-calendar?preview=true", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to preview file");
      }
      return res.json();
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// FormData upload — keep raw fetch
export function useImportCalendar() {
  const qc = useQueryClient();
  return useMutation<ImportResultData, Error, File>({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/marketing/import-calendar", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to import calendar");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketing-posts"] });
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      qc.invalidateQueries({ queryKey: ["marketingOverview"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ── Marketing Tasks ──────────────────────────────────────────

export interface MarketingTaskData {
  id: string;
  title: string;
  description: string | null;
  status: MarketingTaskStatus;
  priority: MarketingTaskPriority;
  dueDate: string | null;
  assigneeId: string | null;
  assignee: { id: string; name: string; avatar: string | null } | null;
  campaignId: string | null;
  campaign: { id: string; name: string } | null;
  postId: string | null;
  post: { id: string; title: string } | null;
  serviceId: string | null;
  service: { id: string; name: string; code: string } | null;
  subtasks: { text: string; done: boolean }[] | null;
  createdAt: string;
  updatedAt: string;
}

export function useMarketingTasks(filters?: {
  status?: string;
  priority?: string;
  assigneeId?: string;
  campaignId?: string;
  serviceId?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.priority) params.set("priority", filters.priority);
  if (filters?.assigneeId) params.set("assigneeId", filters.assigneeId);
  if (filters?.campaignId) params.set("campaignId", filters.campaignId);
  if (filters?.serviceId) params.set("serviceId", filters.serviceId);
  const qs = params.toString();

  return useQuery<MarketingTaskData[]>({
    queryKey: ["marketing-tasks", filters],
    queryFn: async () => {
      return fetchApi<MarketingTaskData[]>(`/api/marketing/tasks${qs ? `?${qs}` : ""}`);
    },
    retry: 2,
  });
}

export function useMarketingTask(id: string) {
  return useQuery<MarketingTaskData>({
    queryKey: ["marketing-task", id],
    queryFn: async () => {
      return fetchApi<MarketingTaskData>(`/api/marketing/tasks/${id}`);
    },
    enabled: !!id,
    retry: 2,
  });
}

export function useCreateMarketingTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      title: string;
      description?: string;
      status?: MarketingTaskStatus;
      priority?: MarketingTaskPriority;
      dueDate?: string;
      assigneeId?: string;
      campaignId?: string;
      postId?: string;
      serviceId?: string;
    }) => {
      return mutateApi("/api/marketing/tasks", {
        method: "POST",
        body: data,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketing-tasks"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useUpdateMarketingTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      title?: string;
      description?: string | null;
      status?: MarketingTaskStatus;
      priority?: MarketingTaskPriority;
      dueDate?: string | null;
      assigneeId?: string | null;
      campaignId?: string | null;
      postId?: string | null;
      serviceId?: string | null;
      subtasks?: { text: string; done: boolean }[] | null;
    }) => {
      return mutateApi(`/api/marketing/tasks/${id}`, {
        method: "PATCH",
        body: data,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketing-tasks"] });
      qc.invalidateQueries({ queryKey: ["marketing-task"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useDeleteMarketingTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return mutateApi(`/api/marketing/tasks/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketing-tasks"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ── Marketing Task Templates ────────────────────────────────

export interface MarketingTaskTemplateItemData {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  sortOrder: number;
  daysOffset: number;
}

export interface MarketingTaskTemplateData {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  items: MarketingTaskTemplateItemData[];
  createdAt: string;
}

export function useMarketingTaskTemplates() {
  return useQuery<MarketingTaskTemplateData[]>({
    queryKey: ["marketing-task-templates"],
    queryFn: async () => {
      return fetchApi<MarketingTaskTemplateData[]>("/api/marketing/task-templates");
    },
    retry: 2,
  });
}

export function useApplyMarketingTaskTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      templateId: string;
      campaignId?: string;
      serviceId?: string;
      startDate?: string;
    }) => {
      const { templateId, ...body } = data;
      return mutateApi<{ created: number }>(
        `/api/marketing/task-templates/${templateId}/apply`,
        {
          method: "POST",
          body,
        }
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketing-tasks"] });
      qc.invalidateQueries({ queryKey: ["marketing-overview"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ── Activation Assignments ──────────────────────────────────

export interface ActivationAssignmentData {
  id: string;
  campaignId: string;
  serviceId: string;
  service: { id: string; name: string; code: string };
  assigned: boolean;
  coordinatorId: string | null;
  coordinator: { id: string; name: string } | null;
  budget: number | null;
  notes: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export function useActivationAssignments(campaignId: string) {
  return useQuery<ActivationAssignmentData[]>({
    queryKey: ["activation-assignments", campaignId],
    queryFn: async () => {
      return fetchApi<ActivationAssignmentData[]>(
        `/api/marketing/campaigns/${campaignId}/activations`
      );
    },
    enabled: !!campaignId,
    retry: 2,
  });
}

export function useUpdateActivationAssignments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      campaignId,
      assignments,
    }: {
      campaignId: string;
      assignments: {
        serviceId: string;
        assigned?: boolean;
        coordinatorId?: string | null;
        budget?: number | null;
        notes?: string | null;
        status?: string;
      }[];
    }) => {
      return mutateApi(
        `/api/marketing/campaigns/${campaignId}/activations`,
        {
          method: "PUT",
          body: assignments,
        }
      );
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({
        queryKey: ["activation-assignments", vars.campaignId],
      });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ── Post Approval ────────────────────────────────────────────

export function useApprovePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (postId: string) => {
      return mutateApi(`/api/marketing/posts/${postId}/approve`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketing-posts"] });
      qc.invalidateQueries({ queryKey: ["post"] });
      qc.invalidateQueries({ queryKey: ["marketingOverview"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useRejectPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      postId,
      reason,
    }: {
      postId: string;
      reason?: string;
    }) => {
      return mutateApi(`/api/marketing/posts/${postId}/reject`, {
        method: "POST",
        body: { reason },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketing-posts"] });
      qc.invalidateQueries({ queryKey: ["post"] });
      qc.invalidateQueries({ queryKey: ["marketingOverview"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ─── Social Media Hooks ─────────────────────────────────────

export interface SocialConnectionData {
  id: string;
  platform: string;
  status: string;
  accountId: string | null;
  accountName: string | null;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  serviceId: string | null;
  tokenExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  service: { id: string; name: string } | null;
}

export interface SocialAccountData {
  id: string;
  platform: string;
  accountName: string | null;
  accountId: string | null;
  serviceId: string | null;
  status: string;
}

export interface SocialPostData {
  externalId: string;
  message: string;
  createdTime: string;
  permalink: string;
  likes: number;
  comments: number;
  shares: number;
}

export function useSocialConnections() {
  return useQuery<SocialConnectionData[]>({
    queryKey: ["social-connections"],
    queryFn: async () => {
      return fetchApi<SocialConnectionData[]>("/api/marketing/social/status");
    },
    retry: 2,
  });
}

export function useConnectSocial() {
  return useMutation({
    mutationFn: async (data: { platform: string }) => {
      return mutateApi<{ authUrl: string; state: string }>("/api/marketing/social/connect", {
        method: "POST",
        body: data,
      });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useDisconnectSocial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { connectionId: string }) => {
      return mutateApi("/api/marketing/social/disconnect", {
        method: "POST",
        body: data,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["social-connections"] }),
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useSocialAccounts() {
  return useQuery<SocialAccountData[]>({
    queryKey: ["social-accounts"],
    queryFn: async () => {
      return fetchApi<SocialAccountData[]>("/api/marketing/social/accounts");
    },
    retry: 2,
  });
}

export function useLinkSocialPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      postId: string;
      externalPostId: string;
      externalUrl: string;
    }) => {
      return mutateApi("/api/marketing/social/link-post", {
        method: "POST",
        body: data,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketing-posts"] });
      qc.invalidateQueries({ queryKey: ["social-connections"] });
      qc.invalidateQueries({ queryKey: ["post"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useFetchSocialPosts(connectionId?: string) {
  return useQuery<SocialPostData[]>({
    queryKey: ["social-posts", connectionId],
    queryFn: async () => {
      return fetchApi<SocialPostData[]>(
        `/api/marketing/social/fetch-posts?connectionId=${connectionId}`
      );
    },
    enabled: !!connectionId,
    retry: 2,
  });
}

// ── Term Calendar ───────────────────────────────────────────

export interface TermCalendarEntry {
  id: string;
  year: number;
  term: number;
  week: number;
  channel: string;
  title: string;
  description: string | null;
  status: string;
  service: { id: string; name: string; code: string } | null;
  assignee: { id: string; name: string; avatar: string | null } | null;
  campaign: { id: string; name: string } | null;
}

export interface TermCalendarData {
  year: number;
  term: number;
  weeks: Record<string, TermCalendarEntry[]>;
  summary: {
    totalEntries: number;
    byStatus: Record<string, number>;
    byChannel: Record<string, number>;
  };
}

export function useTermCalendar(year?: number, term?: number, serviceId?: string) {
  return useQuery<TermCalendarData>({
    queryKey: ["term-calendar", year, term, serviceId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (year) params.set("year", String(year));
      if (term) params.set("term", String(term));
      if (serviceId) params.set("serviceId", serviceId);
      const qs = params.toString();
      return fetchApi<TermCalendarData>(`/api/marketing/term-calendar${qs ? `?${qs}` : ""}`);
    },
    retry: 2,
  });
}

// ── Photo Compliance ────────────────────────────────────────

export interface PhotoComplianceDay {
  date: string;
  confirmed: boolean;
  confirmedAt: string | null;
}

export interface PhotoComplianceService {
  id: string;
  name: string;
  code: string;
  days: PhotoComplianceDay[];
  streak: number;
  complianceRate: number;
}

export interface PhotoComplianceData {
  dateRange: { start: string; end: string };
  services: PhotoComplianceService[];
  overallRate: number;
}

export function usePhotoCompliance() {
  return useQuery<PhotoComplianceData>({
    queryKey: ["photo-compliance"],
    queryFn: async () => {
      return fetchApi<PhotoComplianceData>("/api/marketing/photo-compliance");
    },
    retry: 2,
  });
}
