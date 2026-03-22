import { NextRequest, NextResponse } from "next/server";
import {
  updateEvent,
  deleteEvent,
  isCalendarConnected,
} from "@/lib/microsoft-calendar";
import { withApiAuth } from "@/lib/server-auth";
import { z } from "zod";

const patchEventSchema = z.object({
  subject: z.string().min(1).optional(),
  body: z.string().optional(),
  start: z.object({
    dateTime: z.string().min(1),
    timeZone: z.string().optional(),
  }).optional(),
  end: z.object({
    dateTime: z.string().min(1),
    timeZone: z.string().optional(),
  }).optional(),
  location: z.string().optional(),
});

/**
 * PATCH /api/calendar/events/[eventId]
 * Update a calendar event.
 */
export const PATCH = withApiAuth(async (req, session, context) => {
const connected = await isCalendarConnected(session!.user.id);
  if (!connected) {
    return NextResponse.json(
      { error: "Calendar not connected" },
      { status: 400 }
    );
  }

  const { eventId } = await context!.params!;
  const body = await req.json();
  const parsed = patchEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.subject !== undefined) updates.subject = parsed.data.subject;
  if (parsed.data.body !== undefined) updates.body = parsed.data.body;
  if (parsed.data.start !== undefined) {
    updates.start = {
      dateTime: parsed.data.start.dateTime,
      timeZone: parsed.data.start.timeZone || "Australia/Sydney",
    };
  }
  if (parsed.data.end !== undefined) {
    updates.end = {
      dateTime: parsed.data.end.dateTime,
      timeZone: parsed.data.end.timeZone || "Australia/Sydney",
    };
  }
  if (parsed.data.location !== undefined) {
    updates.location = { displayName: parsed.data.location };
  }

  const updated = await updateEvent(session!.user.id, eventId, updates);

  if (!updated) {
    return NextResponse.json(
      { error: "Failed to update calendar event" },
      { status: 502 }
    );
  }

  return NextResponse.json(updated);
});

/**
 * DELETE /api/calendar/events/[eventId]
 * Delete a calendar event.
 */
export const DELETE = withApiAuth(async (req, session, context) => {
const connected = await isCalendarConnected(session!.user.id);
  if (!connected) {
    return NextResponse.json(
      { error: "Calendar not connected" },
      { status: 400 }
    );
  }

  const { eventId } = await context!.params!;
  const success = await deleteEvent(session!.user.id, eventId);

  if (!success) {
    return NextResponse.json(
      { error: "Failed to delete calendar event" },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true });
});
