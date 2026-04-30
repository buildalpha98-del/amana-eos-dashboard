"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";

// ── Types ────────────────────────────────────────────────

export interface WeeklyRollCallChild {
  id: string;
  firstName: string;
  surname: string;
  photo: string | null;
  dob: string | null;
  bookingPrefs: unknown;
}

export interface WeeklyRollCallAttendanceRecord {
  id: string;
  childId: string;
  /** AttendanceRecord.date in prisma/schema.prisma — NOT `attendanceDate`. */
  date: string;
  sessionType: "bsc" | "asc" | "vc";
  status: "booked" | "present" | "absent";
  signInTime: string | null;
  signOutTime: string | null;
  signedInById: string | null;
  signedOutById: string | null;
  absenceReason: string | null;
  notes: string | null;
}

export interface WeeklyRollCallBooking {
  id: string;
  childId: string;
  date: string;
  sessionType: "bsc" | "asc" | "vc";
  fee: number | null;
}

export interface WeeklyRollCallResponse {
  children: WeeklyRollCallChild[];
  attendanceRecords: WeeklyRollCallAttendanceRecord[];
  bookings: WeeklyRollCallBooking[];
  weekStart: string;
}

export interface EnrollableChildrenResponse {
  children: WeeklyRollCallChild[];
}

// ── Hooks ────────────────────────────────────────────────

/**
 * Fetch the week's children + attendance records + bookings for a service.
 * Returns data across Mon–Sun starting from `weekStart` (YYYY-MM-DD).
 */
export function useWeeklyRollCall(serviceId: string, weekStart: string) {
  return useQuery<WeeklyRollCallResponse>({
    queryKey: ["weekly-roll-call", serviceId, weekStart],
    queryFn: () =>
      fetchApi<WeeklyRollCallResponse>(
        `/api/services/${serviceId}/roll-call/weekly?weekStart=${weekStart}`,
      ),
    enabled: !!serviceId && !!weekStart,
    retry: 2,
    staleTime: 30_000,
  });
}

/**
 * Fetch children at this service not yet on any attendance record for the given week.
 * Used by the "+ Add child to week" dialog.
 */
export function useEnrollableChildren(serviceId: string, weekStart: string) {
  return useQuery<EnrollableChildrenResponse>({
    queryKey: ["enrollable-children", serviceId, weekStart],
    queryFn: () =>
      fetchApi<EnrollableChildrenResponse>(
        `/api/services/${serviceId}/children/enrollable?weekStart=${weekStart}`,
      ),
    enabled: !!serviceId && !!weekStart,
    retry: 2,
    staleTime: 30_000,
  });
}
