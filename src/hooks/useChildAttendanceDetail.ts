"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";

export interface AttendanceSession {
  sessionType: string;
  status?: string;
  signInTime?: string | null;
  signOutTime?: string | null;
  signedInBy?: string | null;
  signedOutBy?: string | null;
  absenceReason?: string | null;
  notes?: string | null;
  // Aggregate fallback fields
  enrolled?: number;
  attended?: number;
  absent?: number;
}

export interface AttendanceDetailResponse {
  source: "individual" | "aggregate" | "none";
  date: string;
  sessions: AttendanceSession[];
}

export function useChildAttendanceDetail(childId: string, date: string) {
  return useQuery<AttendanceDetailResponse>({
    queryKey: ["child-attendance-detail", childId, date],
    queryFn: () =>
      fetchApi<AttendanceDetailResponse>(
        `/api/parent/children/${childId}/attendance-detail?date=${date}`,
      ),
    enabled: !!childId && !!date,
    staleTime: 15_000, // 15s — live during session
    retry: 2,
  });
}
