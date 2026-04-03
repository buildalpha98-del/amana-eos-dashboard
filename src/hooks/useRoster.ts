"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";

export interface RosterChild {
  childId: string;
  firstName: string;
  surname: string;
  bookingType: string;
  hasMedical: boolean;
  hasDietary: boolean;
}

/** dateString → sessionType → children[] */
export type RosterData = Record<string, Record<string, RosterChild[]>>;

export function useRoster(serviceId: string, weekStart: string) {
  const params = new URLSearchParams({ serviceId, weekStart });

  return useQuery<RosterData>({
    queryKey: ["roster", serviceId, weekStart],
    queryFn: () => fetchApi<RosterData>(`/api/bookings/roster?${params}`),
    enabled: !!serviceId && !!weekStart,
    staleTime: 60_000,
    retry: 2,
  });
}
