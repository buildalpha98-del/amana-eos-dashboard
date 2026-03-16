"use client";
import { useQuery } from "@tanstack/react-query";

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
    queryFn: async () => {
      const res = await fetch("/api/team");
      if (!res.ok) throw new Error("Failed to fetch team");
      return res.json();
    },
    staleTime: 5 * 60_000, // Reference data: 5 min stale time
  });
}
