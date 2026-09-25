"use client";

/**
 * useRosterOverlays — one batched fetch for the roster grid's overlays:
 * approved INTERNAL leave ("On leave" chips) plus recurring unavailable
 * weekdays ("Unavailable" hints). Replaces useRosterLeave (staff-portal-v2
 * Task 10.2) so availability doesn't cost a second round-trip.
 *
 * Backed by GET /api/roster/overlays (userIds-keyed — never serviceId,
 * which is nullable on LeaveRequest). Leave comes from BOTH systems:
 * internal LeaveRequest rows (`leave`) and approved Employment Hero
 * requests (`ehLeave`, from the server-side 5-min cache — empty when EH
 * is unconfigured or down). Availability rows are the staff-set
 * (available: false) days from /profile — weekday-keyed (0=Sunday …
 * 6=Saturday), so they repeat every week.
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

export interface RosterUnavailabilityEntry {
  userId: string;
  /** 0=Sunday … 6=Saturday (JS Date#getDay convention). */
  weekday: number;
  note: string | null;
}

export interface RosterEhLeaveEntry {
  userId: string;
  /** EH ISO datetime — slice(0, 10) for the calendar date. */
  fromDate: string;
  toDate: string;
  totalHours: number;
}

export interface RosterOverlaysResponse {
  leave: RosterLeaveEntry[];
  availability: RosterUnavailabilityEntry[];
  ehLeave: RosterEhLeaveEntry[];
}

export function useRosterOverlays(
  userIds: string[],
  from: string | undefined,
  to: string | undefined,
) {
  // Sorted CSV so the query key is a stable primitive regardless of the
  // caller's array identity/order (CLAUDE.md: primitive query keys).
  const idsCsv = [...userIds].sort().join(",");
  return useQuery<RosterOverlaysResponse>({
    queryKey: ["roster-overlays", idsCsv, from, to],
    queryFn: () =>
      fetchApi<RosterOverlaysResponse>(
        `/api/roster/overlays?userIds=${encodeURIComponent(idsCsv)}&from=${from}&to=${to}`,
      ),
    enabled: userIds.length > 0 && !!from && !!to,
    retry: 2,
    staleTime: 60_000,
  });
}
