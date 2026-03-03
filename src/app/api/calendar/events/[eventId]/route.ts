import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server-auth";
import {
  updateEvent,
  deleteEvent,
  isCalendarConnected,
} from "@/lib/microsoft-calendar";

/**
 * PATCH /api/calendar/events/[eventId]
 * Update a calendar event.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const connected = await isCalendarConnected(session!.user.id);
  if (!connected) {
    return NextResponse.json(
      { error: "Calendar not connected" },
      { status: 400 }
    );
  }

  const { eventId } = await params;
  const body = await req.json();

  const updates: Record<string, unknown> = {};
  if (body.subject !== undefined) updates.subject = body.subject;
  if (body.body !== undefined) updates.body = body.body;
  if (body.start !== undefined) {
    updates.start = {
      dateTime: body.start.dateTime,
      timeZone: body.start.timeZone || "Australia/Sydney",
    };
  }
  if (body.end !== undefined) {
    updates.end = {
      dateTime: body.end.dateTime,
      timeZone: body.end.timeZone || "Australia/Sydney",
    };
  }
  if (body.location !== undefined) {
    updates.location = { displayName: body.location };
  }

  const updated = await updateEvent(session!.user.id, eventId, updates);

  if (!updated) {
    return NextResponse.json(
      { error: "Failed to update calendar event" },
      { status: 502 }
    );
  }

  return NextResponse.json(updated);
}

/**
 * DELETE /api/calendar/events/[eventId]
 * Delete a calendar event.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const connected = await isCalendarConnected(session!.user.id);
  if (!connected) {
    return NextResponse.json(
      { error: "Calendar not connected" },
      { status: 400 }
    );
  }

  const { eventId } = await params;
  const success = await deleteEvent(session!.user.id, eventId);

  if (!success) {
    return NextResponse.json(
      { error: "Failed to delete calendar event" },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true });
}
