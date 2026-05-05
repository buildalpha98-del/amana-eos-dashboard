import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import type { ContentTeamRole, ContentTeamStatus } from "@prisma/client";

export interface TeamMember {
  id: string;
  name: string;
  role: ContentTeamRole;
  status: ContentTeamStatus;
  phone: string | null;
  email: string | null;
  notes: string | null;
  startedAt: string | null;
  pausedAt: string | null;
  pauseReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResolvedMilestone {
  key: "day60" | "day90" | "day120";
  label: string;
  daysFromReset: number;
  targetDate: string;
  daysUntilTarget: number;
  requiredRoles: ContentTeamRole[];
  hiredRoles: ContentTeamRole[];
  missingRoles: ContentTeamRole[];
  status: "on_track" | "at_risk" | "overdue" | "complete";
}

export interface TeamResponse {
  members: TeamMember[];
  milestones: Record<"day60" | "day90" | "day120", ResolvedMilestone>;
  resetStartDate: string;
}

const TEAM_KEY = "marketing-content-team";

function destructive(err: Error) {
  toast({ variant: "destructive", description: err.message || "Something went wrong" });
}

export function useTeam() {
  return useQuery<TeamResponse>({
    queryKey: [TEAM_KEY],
    queryFn: () => fetchApi<TeamResponse>("/api/marketing/content-team"),
    retry: 2,
    staleTime: 30_000,
  });
}

export interface CreateMemberInput {
  name: string;
  role: ContentTeamRole;
  status?: ContentTeamStatus;
  phone?: string;
  email?: string;
  notes?: string;
  startedAt?: string;
}

export function useCreateMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMemberInput) =>
      mutateApi("/api/marketing/content-team", { method: "POST", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [TEAM_KEY] }),
    onError: destructive,
  });
}

export interface PatchMemberInput {
  id: string;
  name?: string;
  role?: ContentTeamRole;
  status?: ContentTeamStatus;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  startedAt?: string | null;
  pausedAt?: string | null;
  pauseReason?: string | null;
}

export function usePatchMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: PatchMemberInput) =>
      mutateApi(`/api/marketing/content-team/${id}`, { method: "PATCH", body: patch }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [TEAM_KEY] }),
    onError: destructive,
  });
}

export function useDeleteMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      mutateApi(`/api/marketing/content-team/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [TEAM_KEY] }),
    onError: destructive,
  });
}
