"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";

export interface LeaderboardRow {
  userId: string;
  name: string;
  email: string;
  avatar: string | null;
  role: string;
  ticketsAssigned: number;
  ticketsResolved: number;
  avgFirstResponseMin: number | null;
  enquiriesTotal: number;
  enquiriesConverted: number;
}

export interface Leaderboard {
  days: number;
  since: string;
  rows: LeaderboardRow[];
}

export function useLeaderboard(days = 30, enabled = true) {
  return useQuery<Leaderboard>({
    queryKey: ["leaderboard", days],
    queryFn: () => fetchApi<Leaderboard>(`/api/contact-centre/leaderboard?days=${days}`),
    staleTime: 60_000,
    retry: 2,
    enabled,
  });
}
