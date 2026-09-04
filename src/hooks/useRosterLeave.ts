"use client";

/**
 * useRosterLeave — approved INTERNAL leave for a set of staff over a date
 * range, powering the roster grid's "On leave" overlay chips.
 *
 * Backed by GET /api/roster/leave (userIds-keyed — never serviceId, which is
 * nullable on LeaveRequest). Only internal leave: leave applied directly in
 * Employment Hero never lands in the LeaveRequest table, and the grid's
 * legend copy says so.
 */

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";

export interface RosterLeaveEntry {
  userId: string;
  leaveType: string;
  /** ISO datetime — @db.Date, so midnight UTC of the calendar date. */
  startDate: string;
  endDate: string;
  isHalfDay: boolean;
}

interface RosterLeaveResponse {
  leave: RosterLeaveEntry[];
}

export function useRosterLeave(
  userIds: string[],
  from: string | undefined,
  to: string | undefined,
) {
  // Sorted CSV so the query key is a stable primitive regardless of the
  // caller's array identity/order (CLAUDE.md: primitive query keys).
  const idsCsv = [...userIds].sort().join(",");
  return useQuery<RosterLeaveResponse>({
    queryKey: ["roster-leave", idsCsv, from, to],
    queryFn: () =>
      fetchApi<RosterLeaveResponse>(
        `/api/roster/leave?userIds=${encodeURIComponent(idsCsv)}&from=${from}&to=${to}`,
      ),
    enabled: userIds.length > 0 && !!from && !!to,
    retry: 2,
    staleTime: 60_000,
  });
}
