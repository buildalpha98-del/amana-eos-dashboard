import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withParentAuth } from "@/lib/parent-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { sendBookingRequestNotification } from "@/lib/notifications/bookings";

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const createBookingSchema = z.object({
  childId: z.string().min(1, "childId is required"),
  serviceId: z.string().min(1, "serviceId is required"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  sessionType: z.enum(["bsc", "asc", "vc"]),
});

// ---------------------------------------------------------------------------
// Helpers (exported for [bookingId] route)
// ---------------------------------------------------------------------------

/**
 * Get all childIds that belong to the authenticated parent's enrolments.
 */
export async function getParentChildIds(enrolmentIds: string[]): Promise<Set<string>> {
  if (enrolmentIds.length === 0) return new Set();

  const children = await prisma.child.findMany({
    where: { enrolmentId: { in: enrolmentIds } },
    select: { id: true },
  });

  return new Set(children.map((c) => c.id));
}

// ---------------------------------------------------------------------------
// GET — Fetch upcoming bookings and absences for parent's children
// ---------------------------------------------------------------------------

export const GET = withParentAuth(async (req, { parent }) => {
  const childIds = await getParentChildIds(parent.enrolmentIds);
  if (childIds.size === 0) {
    return NextResponse.json({ bookings: [], absences: [] });
  }

  const childIdArray = Array.from(childIds);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Support ?period=past for past bookings
  const url = new URL(req.url);
  const period = url.searchParams.get("period");
  const dateFilter = period === "past" ? { lt: today } : { gte: today };
  const dateOrder = period === "past" ? "desc" as const : "asc" as const;

  const [bookings, absences] = await Promise.all([
    prisma.booking.findMany({
      where: {
        childId: { in: childIdArray },
        date: dateFilter,
      },
      include: {
        child: { select: { id: true, firstName: true, surname: true, yearLevel: true } },
        service: { select: { id: true, name: true } },
      },
      orderBy: { date: dateOrder },
      take: period === "past" ? 50 : undefined,
    }),
    prisma.absence.findMany({
      where: {
        childId: { in: childIdArray },
        date: dateFilter,
      },
      include: {
        child: { select: { id: true, firstName: true, surname: true } },
        service: { select: { id: true, name: true } },
      },
      orderBy: { date: dateOrder },
      take: period === "past" ? 50 : undefined,
    }),
  ]);

  return NextResponse.json({ bookings, absences });
});

// ---------------------------------------------------------------------------
// POST — Request a new casual booking
// ---------------------------------------------------------------------------

export const POST = withParentAuth(async (req, { parent }) => {
  const body = await parseJsonBody(req);
  const parsed = createBookingSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid booking data", parsed.error.flatten().fieldErrors);
  }

  const { childId, serviceId, date, sessionType } = parsed.data;

  // Verify child belongs to parent
  const childIds = await getParentChildIds(parent.enrolmentIds);
  if (!childIds.has(childId)) {
    throw ApiError.forbidden("You do not have access to this child");
  }

  // Verify service exists
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { id: true, bscCasualRate: true, ascCasualRate: true, vcDailyRate: true },
  });
  if (!service) {
    throw ApiError.notFound("Service not found");
  }

  // Determine fee based on session type
  const feeMap: Record<string, number | null> = {
    bsc: service.bscCasualRate,
    asc: service.ascCasualRate,
    vc: service.vcDailyRate ?? null,
  };
  const fee = feeMap[sessionType] ?? null;

  // Prevent duplicate bookings
  const bookingDate = new Date(date + "T00:00:00.000Z");
  const existing = await prisma.booking.findUnique({
    where: {
      childId_serviceId_date_sessionType: {
        childId,
        serviceId,
        date: bookingDate,
        sessionType,
      },
    },
  });
  if (existing) {
    throw ApiError.conflict("A booking already exists for this child, date, and session");
  }

  // Look up CentreContact for requestedById
  const contact = await prisma.centreContact.findFirst({
    where: { email: parent.email, serviceId },
    select: { id: true },
  });

  const booking = await prisma.booking.create({
    data: {
      childId,
      serviceId,
      date: bookingDate,
      sessionType,
      status: "requested",
      type: "casual",
      fee,
      requestedById: contact?.id ?? null,
    },
    include: {
      child: { select: { id: true, firstName: true, surname: true } },
      service: { select: { id: true, name: true } },
    },
  });

  // Fire and forget — notify coordinator
  sendBookingRequestNotification(booking.id).catch(() => {});

  return NextResponse.json(booking, { status: 201 });
});

