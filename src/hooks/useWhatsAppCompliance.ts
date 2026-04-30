import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import type { WhatsAppNonPostReason, WhatsAppNetworkGroup } from "@prisma/client";

export interface GridCentre {
  id: string;
  name: string;
  state: string | null;
  code: string;
  coordinatorName: string | null;
  coordinatorUserId: string | null;
}

export interface GridDay {
  date: string;
  dayLabel: "Mon" | "Tue" | "Wed" | "Thu" | "Fri";
}

export interface GridCellRecord {
  id: string;
  posted: boolean;
  notPostingReason: WhatsAppNonPostReason | null;
  notes: string | null;
  recordedAt: string;
  recordedByName: string;
}

export interface GridCell {
  serviceId: string;
  date: string;
  record: GridCellRecord | null;
}

export interface NetworkPostSummary {
  id: string;
  postedAt: string;
  topic: string | null;
  notes: string | null;
  recordedByName: string;
  marketingPostId: string | null;
}

export interface TwoWeekConcern {
  serviceId: string;
  serviceName: string;
  coordinatorName: string | null;
  coordinatorUserId: string | null;
  lastWeekPosted: number;
  thisWeekPosted: number;
  reason: "two_consecutive_below_floor";
}

export interface GridResponse {
  week: { start: string; end: string; weekNumber: number; year: number };
  centres: GridCentre[];
  days: GridDay[];
  cells: GridCell[];
  summary: {
    totalCells: number;
    cellsChecked: number;
    posted: number;
    notPosted: number;
    coverage: number;
    target: number;
    floor: number;
    coordinatorWeeklyFloor: number;
  };
  networkPosts: {
    engagement: { count: number; target: number; floor: number; posts: NetworkPostSummary[] };
    announcements: { count: number; target: number; floor: number; posts: NetworkPostSummary[] };
  };
  patterns: { twoWeekConcerns: TwoWeekConcern[] };
}

export interface QuickEntryInput {
  date: string;
  entries: Array<{
    serviceId: string;
    posted: boolean;
    notPostingReason?: WhatsAppNonPostReason;
    notes?: string;
  }>;
}

export interface CellPatchInput {
  serviceId: string;
  date: string;
  posted: boolean;
  notPostingReason?: WhatsAppNonPostReason;
  notes?: string;
}

export interface FlagInput {
  serviceId: string;
  date?: string;
  context: "one_off" | "two_week_pattern";
}

export interface FlagResponse {
  coordinatorName: string | null;
  coordinatorPhone: string | null;
  centreName: string;
  message: string;
  whatsappLink: string | null;
}

export interface NetworkPostInput {
  group: WhatsAppNetworkGroup;
  postedAt: string;
  topic?: string;
  notes?: string;
  marketingPostId?: string;
}

export interface CoordinatorHistoryWeek {
  weekStart: string;
  weekNumber: number;
  year: number;
  posted: number;
  notPosted: number;
  notChecked: number;
  excluded: number;
  coverage: number;
  floor: number;
  target: number;
  status: "green" | "amber" | "red";
}

export interface CoordinatorHistoryNote {
  id: string;
  date: string;
  notes: string | null;
  posted: boolean;
  notPostingReason: WhatsAppNonPostReason | null;
}

export interface CoordinatorHistoryResponse {
  serviceId: string;
  serviceName: string;
  coordinatorName: string | null;
  coordinatorUserId: string | null;
  weeks: CoordinatorHistoryWeek[];
  notes: CoordinatorHistoryNote[];
}

const GRID_KEY = "whatsapp-grid";

function destructiveToast(err: Error) {
  toast({ variant: "destructive", description: err.message || "Something went wrong" });
}

export function useWhatsAppGrid(weekStart?: string) {
  const qs = weekStart ? `?weekStart=${weekStart}` : "";
  return useQuery<GridResponse>({
    queryKey: [GRID_KEY, weekStart ?? "current"],
    queryFn: () => fetchApi<GridResponse>(`/api/marketing/whatsapp/grid${qs}`),
    retry: 2,
    staleTime: 30_000,
  });
}

export function useQuickEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: QuickEntryInput) =>
      mutateApi("/api/marketing/whatsapp/quick-entry", { method: "POST", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [GRID_KEY] }),
    onError: destructiveToast,
  });
}

export function useCellPatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CellPatchInput) =>
      mutateApi("/api/marketing/whatsapp/cell", { method: "PATCH", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [GRID_KEY] }),
    onError: destructiveToast,
  });
}

export function useFlagCoordinator() {
  return useMutation<FlagResponse, Error, FlagInput>({
    mutationFn: (input) =>
      mutateApi<FlagResponse>("/api/marketing/whatsapp/cell/flag", { method: "POST", body: input }),
    onError: destructiveToast,
  });
}

export function useCreateNetworkPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NetworkPostInput) =>
      mutateApi("/api/marketing/whatsapp/network-post", { method: "POST", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [GRID_KEY] }),
    onError: destructiveToast,
  });
}

export function useDeleteNetworkPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      mutateApi(`/api/marketing/whatsapp/network-post/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [GRID_KEY] }),
    onError: destructiveToast,
  });
}

export function useAddToOneOnOne() {
  return useMutation<{ taskId: string; dueDate: string | null }, Error, { serviceId: string; coordinatorName: string | null }>({
    mutationFn: (input) =>
      mutateApi("/api/marketing/whatsapp/add-to-1on1", { method: "POST", body: input }),
    onError: destructiveToast,
  });
}

export function useCoordinatorHistory(serviceId: string | null) {
  return useQuery<CoordinatorHistoryResponse>({
    queryKey: ["whatsapp-coordinator-history", serviceId],
    queryFn: () =>
      fetchApi<CoordinatorHistoryResponse>(`/api/marketing/whatsapp/coordinator-history/${serviceId}`),
    enabled: !!serviceId,
    retry: 2,
    staleTime: 30_000,
  });
}
