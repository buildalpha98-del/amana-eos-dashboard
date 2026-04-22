"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

export interface Vacancy {
  id: string;
  serviceId: string;
  role: string;
  employmentType: string;
  qualificationRequired: string | null;
  status: string;
  postedChannels: string[];
  postedAt: string | null;
  targetFillDate: string | null;
  filledAt: string | null;
  filledByUserId: string | null;
  assignedToId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  service?: { id: string; name: string; code: string };
  assignedTo?: { id: string; name: string } | null;
  _count?: { candidates: number };
}

export interface Candidate {
  id: string;
  vacancyId: string;
  name: string;
  email: string | null;
  phone: string | null;
  source: string;
  stage: string;
  appliedAt: string;
  stageChangedAt: string;
  interviewNotes: string | null;
  referredByUserId: string | null;
  notes: string | null;
  resumeText: string | null;
  resumeFileUrl: string | null;
  aiScreenScore: number | null;
  aiScreenSummary: string | null;
  createdAt: string;
  updatedAt: string;
}

export function useVacancies(filters?: {
  serviceId?: string;
  status?: string;
  q?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.serviceId) params.set("serviceId", filters.serviceId);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.q) params.set("q", filters.q);
  const query = params.toString();
  return useQuery({
    queryKey: ["vacancies", filters?.serviceId, filters?.status, filters?.q],
    queryFn: () =>
      fetchApi<{ vacancies: Vacancy[]; total: number }>(
        `/api/recruitment${query ? `?${query}` : ""}`,
      ),
    retry: 2,
    staleTime: 30_000,
  });
}

export function useVacancy(id: string | null) {
  return useQuery({
    queryKey: ["vacancy", id],
    queryFn: () =>
      fetchApi<Vacancy & { candidates: Candidate[] }>(
        `/api/recruitment/${id}`,
      ),
    enabled: !!id,
    retry: 2,
    staleTime: 30_000,
  });
}

export function useUpdateCandidate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string;
      stage?: string;
      notes?: string;
      interviewNotes?: string;
      name?: string;
      email?: string | null;
      phone?: string | null;
      source?: string;
      referredByUserId?: string | null;
    }) =>
      mutateApi(`/api/recruitment/candidates/${id}`, {
        method: "PATCH",
        body: data,
      }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ["vacancy"] });
      const snapshot = qc.getQueriesData({ queryKey: ["vacancy"] });
      qc.setQueriesData<{ candidates?: Candidate[] } | undefined>(
        { queryKey: ["vacancy"] },
        (old) => {
          if (!old?.candidates) return old;
          return {
            ...old,
            candidates: old.candidates.map((c) =>
              c.id === vars.id
                ? { ...c, ...vars, stageChangedAt: new Date().toISOString() }
                : c,
            ),
          };
        },
      );
      return { snapshot };
    },
    onError: (err: Error, _vars, ctx) => {
      if (ctx?.snapshot) {
        ctx.snapshot.forEach(([key, data]) => qc.setQueryData(key, data));
      }
      toast({
        variant: "destructive",
        description: err.message || "Failed to update candidate",
      });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["vacancy"] });
    },
  });
}

export function useAiScreenCandidate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (candidateId: string) =>
      mutateApi<{ aiScreenScore: number; aiScreenSummary: string }>(
        `/api/recruitment/candidates/${candidateId}/ai-screen`,
        { method: "POST" },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vacancy"] });
      qc.invalidateQueries({ queryKey: ["vacancies"] });
      toast({ description: "AI screening complete" });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        description: err.message || "AI screening failed",
      });
    },
  });
}
