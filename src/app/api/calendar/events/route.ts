import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server-auth";
import {
  listEvents,
  createEvent,
  isCalendarConnected,
  type CalendarEvent,
} from "@/lib/microsoft-calendar";

/**
 * GET /api/calendar/events?start=ISO&end=ISO
 * List calendar events in a date range.
 */
export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const connected = await isCalendarConnected(session!.user.id);
  if (!connected) {
    return NextResponse.json(
      { error: "Calendar not connected. Please connect from Settings." },
      { status: 400 }
    );
  }

  const { searchParams } = new URL(req.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  if (!start || !end) {
    return NextResponse.json(
      { error: "start and end query parameters are required (ISO 8601)" },
      { status: 400 }
    );
  }

  const events = await listEvents(session!.user.id, start, end);

  if (events === null) {
    return NextResponse.json(
      { error: "Failed to fetch calendar events. Token may have expired — try reconnecting." },
      { status: 502 }
    );
  }

  return NextResponse.json(events);
}

/**
 * POST /api/calendar/events
 * Create a new calendar event.
 */
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const connected = await isCalendarConnected(session!.user.id);
  if (!connected) {
    return NextResponse.json(
      { error: "Calendar not connected. Please connect from Settings." },
      { status: 400 }
    );
  }

  const body = await req.json();

  // Basic validation
  if (!body.subject || !body.start?.dateTime || !body.end?.dateTime) {
    return NextResponse.json(
      { error: "subject, start.dateTime, and end.dateTime are required" },
      { status: 400 }
    );
  }

  const event: CalendarEvent = {
    subject: body.subject,
    body: body.body || undefined,
    start: {
      dateTime: body.start.dateTime,
      timeZone: body.start.timeZone || "Australia/Sydney",
    },
    end: {
      dateTime: body.end.dateTime,
      timeZone: body.end.timeZone || "Australia/Sydney",
    },
    location: body.location ? { displayName: body.location } : undefined,
    attendees: body.attendees?.map((a: { email: string; name?: string; optional?: boolean }) => ({
      emailAddress: { address: a.email, name: a.name },
      type: a.optional ? "optional" : "required",
    })),
    isOnlineMeeting: body.isOnlineMeeting ?? false,
    onlineMeetingProvider: body.isOnlineMeeting ? "teamsForBusiness" : undefined,
  };

  const created = await createEvent(session!.user.id, event);

  if (!created) {
    return NextResponse.json(
      { error: "Failed to create calendar event" },
      { status: 502 }
    );
  }

  return NextResponse.json(created, { status: 201 });
}
