import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import type { ContentTeamRole, ContentTeamStatus } from "@prisma/client";

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  active: boolean;
  contentTeamRole: ContentTeamRole | null;
  contentTeamStatus: ContentTeamStatus | null;
  contentTeamStartedAt: string | null;
  contentTeamPausedAt: string | null;
  contentTeamPauseReason: string | null;
  weeksWithTeam: number;
  outputThisWeek: number;
  outputLast4Weeks: number;
  avgWeeklyOutput: number;
  activeTaskCount: number;
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
  hiringMilestones: Record<"day60" | "day90" | "day120", ResolvedMilestone>;
  resetStartDate: string;
  outputSignal: string;
}

export interface TeamCandidate {
  id: string;
  name: string;
  email: string;
  role: string;
}

const TEAM_KEY = "marketing-content-team";
const CANDIDATES_KEY = "marketing-content-team-candidates";

function destructive(err: Error) {
  toast({ variant: "destructive", description: err.message || "Something went wrong" });
}

export function useTeam() {
  return useQuery<TeamResponse>({
    queryKey: [TEAM_KEY],
    queryFn: () => fetchApi<TeamResponse>("/api/marketing/team"),
    retry: 2,
    staleTime: 30_000,
  });
}

export function useTeamCandidates() {
  return useQuery<{ candidates: TeamCandidate[] }>({
    queryKey: [CANDIDATES_KEY],
    queryFn: () => fetchApi<{ candidates: TeamCandidate[] }>("/api/marketing/team/candidates"),
    retry: 2,
    staleTime: 60_000,
  });
}

export interface PatchMemberInput {
  userId: string;
  contentTeamRole?: ContentTeamRole | null;
  contentTeamStatus?: ContentTeamStatus | null;
  contentTeamStartedAt?: string | null;
  contentTeamPausedAt?: string | null;
  contentTeamPauseReason?: string | null;
}

export function usePatchMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, ...patch }: PatchMemberInput) =>
      mutateApi(`/api/marketing/team/${userId}`, { method: "PATCH", body: patch }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [TEAM_KEY] });
      qc.invalidateQueries({ queryKey: [CANDIDATES_KEY] });
    },
    onError: destructive,
  });
}

export interface AddMemberInput {
  userId: string;
  role: ContentTeamRole;
  startedAt?: string;
  initialStatus?: ContentTeamStatus;
}

export function useAddMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AddMemberInput) =>
      mutateApi("/api/marketing/team/add", { method: "POST", body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [TEAM_KEY] });
      qc.invalidateQueries({ queryKey: [CANDIDATES_KEY] });
    },
    onError: destructive,
  });
}
