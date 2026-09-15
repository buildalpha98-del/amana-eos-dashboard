/**
 * Data layer for the casual staff pool (Staff Lifecycle → Candidates).
 *
 * Filters live in the query key so the server does the filtering — the pool is
 * meant to grow into the hundreds, and "who's free Tuesday near Officer" is a
 * database question, not a browser one.
 */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

export interface PoolCandidate {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  suburb: string | null;
  postcode: string | null;
  preferredRegion: string | null;
  source: string;
  stage: string;
  appliedAt: string;
  qualification: string | null;
  studying: boolean;
  wwccNumber: string | null;
  wwccExpiry: string | null;
  hasFirstAid: boolean;
  rightToWork: string | null;
  previousRole: string | null;
  previousEmployer: string | null;
  yearsExperience: number | null;
  availableSessions: string[];
  availableDays: string[];
  earliestStart: string | null;
  hasTransport: boolean;
  rating: number | null;
  lastContactedAt: string | null;
  archivedAt: string | null;
  resumeFileUrl: string | null;
  notes: string | null;
  interviewNotes: string | null;
  aiScreenScore: number | null;
  vacancy: {
    id: string;
    role: string;
    region: string | null;
    service: { id: string; name: string } | null;
  } | null;
  _count?: { candidateNotes: number };
}

export interface PoolFilters {
  q?: string;
  stage?: string;
  session?: string;
  day?: string;
  region?: string;
  source?: string;
  scope?: "active" | "all" | "archived";
  sort?: "recent" | "name" | "rating" | "stale";
}

function toQuery(f: PoolFilters): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  }
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}

export function useCandidatePool(filters: PoolFilters) {
  return useQuery({
    queryKey: ["candidate-pool", filters],
    queryFn: () =>
      fetchApi<{ items: PoolCandidate[]; total: number }>(
        `/api/recruitment/candidates${toQuery(filters)}`,
      ),
    retry: 2,
  });
}

export interface CandidateNote {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string; avatar: string | null } | null;
}

export function useCandidateNotes(candidateId: string | null) {
  return useQuery({
    queryKey: ["candidate-notes", candidateId],
    queryFn: () =>
      fetchApi<{ notes: CandidateNote[] }>(
        `/api/recruitment/candidates/${candidateId}/notes`,
      ),
    enabled: !!candidateId,
    retry: 2,
  });
}

export function useAddCandidateNote(candidateId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      mutateApi<CandidateNote>(
        `/api/recruitment/candidates/${candidateId}/notes`,
        { method: "POST", body: { body } },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["candidate-notes", candidateId] });
      qc.invalidateQueries({ queryKey: ["candidate-pool"] });
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message }),
  });
}

export function useUpdateCandidate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & Record<string, unknown>) =>
      mutateApi<PoolCandidate>(`/api/recruitment/candidates/${id}`, {
        method: "PATCH",
        body: patch,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["candidate-pool"] });
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message }),
  });
}

export function useCreateCandidate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      mutateApi<PoolCandidate>("/api/recruitment/candidates", {
        method: "POST",
        body,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["candidate-pool"] });
      toast({ description: "Candidate added to the pool." });
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message }),
  });
}
