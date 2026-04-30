"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";

export interface RosterShiftListItem {
  id: string;
  userId: string | null;
  staffName: string;
  date: string;
  sessionType: string;
  shiftStart: string;
  shiftEnd: string;
  role: string | null;
  status: "draft" | "published";
  user: { id: string; name: string; avatar: string | null } | null;
}

export function useRosterShifts(serviceId: string, weekStart: string) {
  return useQuery({
    queryKey: ["roster-shifts", serviceId, weekStart],
    queryFn: () =>
      fetchApi<{ shifts: RosterShiftListItem[] }>(
        `/api/roster/shifts?serviceId=${encodeURIComponent(serviceId)}&weekStart=${encodeURIComponent(weekStart)}`,
      ),
    enabled: !!serviceId && !!weekStart,
    retry: 2,
    staleTime: 30_000,
  });
}
