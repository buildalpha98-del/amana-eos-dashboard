"use client";
import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";

export interface TeamMemberRock {
  id: string;
  title: string;
  status: string;
  percentComplete: number;
  priority: string;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: "owner" | "head_office" | "admin" | "marketing" | "coordinator" | "member" | "staff";
  avatar: string | null;
  service: { id: string; name: string } | null;
  activeRocks: number;
  totalTodos: number;
  completedTodos: number;
  todoCompletionPct: number;
  openIssues: number;
  managedServices: number;
  rocks: TeamMemberRock[];
}

export interface TeamFilters {
  service?: string;
  role?: string;
  q?: string;
}

function buildQueryString(filters?: TeamFilters): string {
  if (!filters) return "";
  const params = new URLSearchParams();
  if (filters.service) params.set("service", filters.service);
  if (filters.role) params.set("role", filters.role);
  if (filters.q) params.set("q", filters.q);
  const s = params.toString();
  return s ? `?${s}` : "";
}

export function useTeam(filters?: TeamFilters) {
  return useQuery<TeamMember[]>({
    // Primitive-spread query key per CLAUDE.md — prevents cache misses
    // on re-render when a caller passes a newly-constructed filters object.
    queryKey: [
      "team",
      filters?.service ?? null,
      filters?.role ?? null,
      filters?.q ?? null,
    ],
    queryFn: () =>
      fetchApi<TeamMember[]>(`/api/team${buildQueryString(filters)}`),
    staleTime: 30_000,
    retry: 2,
  });
}
