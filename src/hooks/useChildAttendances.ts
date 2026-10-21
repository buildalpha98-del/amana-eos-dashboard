"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";

export interface ChildAttendanceRecord {
  id: string;
  date: string; // YYYY-MM-DD
  sessionType: "bsc" | "asc" | "vc";
  status: "booked" | "present" | "absent";
  signInTime: string | null;
  signOutTime: string | null;
  signedInBy: { id: string; name: string } | null;
  signedOutBy: { id: string; name: string } | null;
  absenceReason: string | null;
  notes: string | null;
  /** From the associated Booking; absent for educators (no billing). */
  fee?: number | null;
}

export interface ChildAttendancesResponse {
  records: ChildAttendanceRecord[];
  stats: {
    attendances: number; // present count
    absences: number;
    /** Absent for educators. */
    totalFee?: number;
    totalHours: number;
  };
}

export function useChildAttendances(
  childId: string,
  from: string,
  to: string,
) {
  return useQuery<ChildAttendancesResponse>({
    queryKey: ["child-attendances", childId, from, to],
    queryFn: () =>
      fetchApi<ChildAttendancesResponse>(
        `/api/children/${childId}/attendances?from=${from}&to=${to}`,
      ),
    enabled: !!childId && !!from && !!to,
    retry: 2,
    staleTime: 30_000,
  });
}
