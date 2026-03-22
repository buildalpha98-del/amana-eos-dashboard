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
  role: "owner" | "admin" | "member";
  avatar: string | null;
  activeRocks: number;
  totalTodos: number;
  completedTodos: number;
  todoCompletionPct: number;
  openIssues: number;
  managedServices: number;
  rocks: TeamMemberRock[];
}

export function useTeam() {
  return useQuery<TeamMember[]>({
    queryKey: ["team"],
    queryFn: () => fetchApi<TeamMember[]>("/api/team"),
    staleTime: 5 * 60_000, // Reference data: 5 min stale time
    retry: 2,
  });
}
