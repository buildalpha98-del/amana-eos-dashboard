import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/server-auth";
import {
  listEvents,
  createEvent,
  isCalendarConnected,
  type CalendarEvent,
} from "@/lib/microsoft-calendar";

const createCalendarEventSchema = z.object({
  subject: z.string().min(1, "Subject is required"),
  body: z.string().optional(),
  start: z.object({
    dateTime: z.string().min(1, "Start dateTime is required"),
    timeZone: z.string().default("Australia/Sydney"),
  }),
  end: z.object({
    dateTime: z.string().min(1, "End dateTime is required"),
    timeZone: z.string().default("Australia/Sydney"),
  }),
  location: z.string().optional(),
  attendees: z.array(z.object({
    email: z.string().email(),
    name: z.string().optional(),
    optional: z.boolean().optional(),
  })).optional(),
  isOnlineMeeting: z.boolean().default(false),
});

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
  const parsed = createCalendarEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const event: CalendarEvent = {
    subject: parsed.data.subject,
    body: parsed.data.body ? { contentType: "HTML" as const, content: parsed.data.body } : undefined,
    start: {
      dateTime: parsed.data.start.dateTime,
      timeZone: parsed.data.start.timeZone,
    },
    end: {
      dateTime: parsed.data.end.dateTime,
      timeZone: parsed.data.end.timeZone,
    },
    location: parsed.data.location ? { displayName: parsed.data.location } : undefined,
    attendees: parsed.data.attendees?.map((a) => ({
      emailAddress: { address: a.email, name: a.name },
      type: a.optional ? ("optional" as const) : ("required" as const),
    })),
    isOnlineMeeting: parsed.data.isOnlineMeeting,
    onlineMeetingProvider: parsed.data.isOnlineMeeting ? "teamsForBusiness" : undefined,
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
