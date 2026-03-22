"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

// ── Types ────────────────────────────────────────────────

export interface CalendarEvent {
  id: string;
  subject: string;
  body?: { contentType: string; content: string };
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  location?: { displayName: string };
  attendees?: {
    emailAddress: { address: string; name?: string };
    type: "required" | "optional";
  }[];
  isOnlineMeeting?: boolean;
  onlineMeetingUrl?: string;
}

interface CalendarStatus {
  configured: boolean;
  connected: boolean;
  authUrl?: string;
  state?: string;
  message?: string;
}

interface CreateEventInput {
  subject: string;
  start: { dateTime: string; timeZone?: string };
  end: { dateTime: string; timeZone?: string };
  location?: string;
  attendees?: { email: string; name?: string; optional?: boolean }[];
  isOnlineMeeting?: boolean;
  body?: { contentType: "HTML" | "Text"; content: string };
}

// ── Hooks ────────────────────────────────────────────────

/** Check the calendar integration status */
export function useCalendarStatus() {
  return useQuery<CalendarStatus>({
    queryKey: ["calendar-status"],
    queryFn: () => fetchApi<CalendarStatus>("/api/calendar"),
    staleTime: 60_000, // cache for 1 minute
    retry: 2,
  });
}

/** List calendar events in a date range */
export function useCalendarEvents(startDate: string | null, endDate: string | null) {
  return useQuery<CalendarEvent[]>({
    queryKey: ["calendar-events", startDate, endDate],
    queryFn: () =>
      fetchApi<CalendarEvent[]>(
        `/api/calendar/events?start=${encodeURIComponent(startDate!)}&end=${encodeURIComponent(endDate!)}`
      ),
    enabled: !!startDate && !!endDate,
    retry: 2,
  });
}

/** Create a new calendar event */
export function useCreateCalendarEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateEventInput) => {
      return mutateApi("/api/calendar/events", { method: "POST", body: input });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendar-events"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

/** Update a calendar event */
export function useUpdateCalendarEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      eventId,
      ...updates
    }: Partial<CreateEventInput> & { eventId: string }) => {
      return mutateApi(`/api/calendar/events/${eventId}`, { method: "PATCH", body: updates });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendar-events"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

/** Delete a calendar event */
export function useDeleteCalendarEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (eventId: string) => {
      return mutateApi(`/api/calendar/events/${eventId}`, { method: "DELETE" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendar-events"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

/** Disconnect calendar */
export function useDisconnectCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      return mutateApi("/api/calendar", { method: "DELETE" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendar-status"] });
      qc.invalidateQueries({ queryKey: ["calendar-events"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}
