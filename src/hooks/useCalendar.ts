"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

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
    queryFn: async () => {
      const res = await fetch("/api/calendar");
      if (!res.ok) throw new Error("Failed to check calendar status");
      return res.json();
    },
    staleTime: 60_000, // cache for 1 minute
  });
}

/** List calendar events in a date range */
export function useCalendarEvents(startDate: string | null, endDate: string | null) {
  return useQuery<CalendarEvent[]>({
    queryKey: ["calendar-events", startDate, endDate],
    queryFn: async () => {
      const res = await fetch(
        `/api/calendar/events?start=${encodeURIComponent(startDate!)}&end=${encodeURIComponent(endDate!)}`
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to fetch events");
      }
      return res.json();
    },
    enabled: !!startDate && !!endDate,
  });
}

/** Create a new calendar event */
export function useCreateCalendarEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateEventInput) => {
      const res = await fetch("/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create event");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendar-events"] });
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
      const res = await fetch(`/api/calendar/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update event");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendar-events"] });
    },
  });
}

/** Delete a calendar event */
export function useDeleteCalendarEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (eventId: string) => {
      const res = await fetch(`/api/calendar/events/${eventId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete event");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendar-events"] });
    },
  });
}

/** Disconnect calendar */
export function useDisconnectCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/calendar", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to disconnect calendar");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendar-status"] });
      qc.invalidateQueries({ queryKey: ["calendar-events"] });
    },
  });
}
