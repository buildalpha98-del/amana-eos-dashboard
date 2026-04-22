import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { z } from "zod";
import type { SessionType } from "@prisma/client";
import { sendSignInNotification, sendSignOutNotification } from "@/lib/notifications/attendance";
import { logger } from "@/lib/logger";

// YYYY-MM-DD regex used by both handlers for DST-safe parsing.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse a YYYY-MM-DD string as UTC midnight. Keeps AttendanceRecord.date
 * and DailyAttendance.date aligned with the bulk roll-call route across
 * AEST/AEDT DST boundaries, which `new Date("YYYY-MM-DD")` can't guarantee
 * across runtimes.
 */
function parseDateUTC(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

// ── GET: Fetch roll call list for a session ───────────────

export const GET = withApiAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  const dateStr = searchParams.get("date");
  const sessionType = searchParams.get("sessionType") as SessionType | null;

  if (!serviceId || !dateStr || !sessionType) {
    throw ApiError.badRequest("serviceId, date, and sessionType are required");
  }

  if (!DATE_RE.test(dateStr)) {
    throw ApiError.badRequest("date must be YYYY-MM-DD");
  }

  if (!["bsc", "asc", "vc"].includes(sessionType)) {
    throw ApiError.badRequest("sessionType must be bsc, asc, or vc");
  }

  const date = parseDateUTC(dateStr);

  // 1. Get all children with confirmed bookings for this session
  const bookings = await prisma.booking.findMany({
    where: {
      serviceId,
      date,
      sessionType: sessionType as SessionType,
      status: { in: ["confirmed", "requested"] },
    },
    select: {
      childId: true,
      type: true,
      child: {
        select: {
          id: true,
          firstName: true,
          surname: true,
          photo: true,
          medicalConditions: true,
          dietaryRequirements: true,
          anaphylaxisActionPlan: true,
          medicationDetails: true,
          medical: true,
          dietary: true,
          yearLevel: true,
        },
      },
    },
  });

  // 2. Get existing attendance records for this session
  const records = await prisma.attendanceRecord.findMany({
    where: { serviceId, date, sessionType: sessionType as SessionType },
    include: {
      signedInBy: { select: { id: true, name: true } },
      signedOutBy: { select: { id: true, name: true } },
    },
  });

  // 3. Build a map of childId -> attendance record
  const recordMap = new Map(records.map((r) => [r.childId, r]));

  // 4. Build the unified roll call list — one row per booked child
  const bookedChildIds = new Set<string>();
  const rollCall = bookings.map((b) => {
    bookedChildIds.add(b.childId);
    const record = recordMap.get(b.childId);
    return {
      childId: b.childId,
      child: b.child,
      bookingType: b.type,
      status: record?.status ?? "booked",
      signInTime: record?.signInTime ?? null,
      signOutTime: record?.signOutTime ?? null,
      signedInBy: record?.signedInBy ?? null,
      signedOutBy: record?.signedOutBy ?? null,
      absenceReason: record?.absenceReason ?? null,
      notes: record?.notes ?? null,
    };
  });

  // 5. Include any attendance records for children without a booking (walk-ins)
  for (const record of records) {
    if (!bookedChildIds.has(record.childId)) {
      // Fetch child data separately for walk-ins
      const child = await prisma.child.findUnique({
        where: { id: record.childId },
        select: {
          id: true, firstName: true, surname: true, photo: true,
          medicalConditions: true, dietaryRequirements: true, anaphylaxisActionPlan: true,
          medicationDetails: true, medical: true, dietary: true, yearLevel: true,
        },
      });
      if (child) {
        rollCall.push({
          childId: record.childId,
          child,
          bookingType: "casual",
          status: record.status,
          signInTime: record.signInTime,
          signOutTime: record.signOutTime,
          signedInBy: record.signedInBy,
          signedOutBy: record.signedOutBy,
          absenceReason: record.absenceReason,
          notes: record.notes,
        });
      }
    }
  }

  // Sort: present first, then booked/not marked, then absent
  const statusOrder: Record<string, number> = { present: 0, booked: 1, absent: 2 };
  rollCall.sort((a, b) => {
    const orderDiff = (statusOrder[a.status] ?? 1) - (statusOrder[b.status] ?? 1);
    if (orderDiff !== 0) return orderDiff;
    const surnCmp = a.child.surname.localeCompare(b.child.surname);
    return surnCmp !== 0 ? surnCmp : a.child.firstName.localeCompare(b.child.firstName);
  });

  const total = rollCall.length;
  const present = rollCall.filter((r) => r.status === "present").length;
  const absent = rollCall.filter((r) => r.status === "absent").length;
  const notMarked = rollCall.filter((r) => r.status === "booked").length;

  return NextResponse.json({
    records: rollCall,
    summary: { total, present, absent, notMarked },
  });
});

// ── POST: Update an individual child's attendance ─────────

const actionSchema = z.object({
  childId: z.string().min(1),
  serviceId: z.string().min(1),
  date: z.string().regex(DATE_RE, "date must be YYYY-MM-DD"),
  sessionType: z.enum(["bsc", "asc", "vc"]),
  action: z.enum(["sign_in", "sign_out", "mark_absent", "undo"]),
  absenceReason: z.string().max(500).optional(),
  notes: z.string().max(1000).optional(),
});

export const POST = withApiAuth(async (req, session) => {
  const body = await parseJsonBody(req);
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest("Validation failed", parsed.error.flatten().fieldErrors);
  }

  const { childId, serviceId, date, sessionType, action, absenceReason, notes } = parsed.data;
  const dateObj = parseDateUTC(date);
  const uniqueKey = {
    childId_serviceId_date_sessionType: {
      childId,
      serviceId,
      date: dateObj,
      sessionType,
    },
  };

  let record;

  switch (action) {
    case "sign_in": {
      const signInTime = new Date();
      record = await prisma.attendanceRecord.upsert({
        where: uniqueKey,
        update: {
          status: "present",
          signInTime,
          signedInById: session.user.id,
          notes,
        },
        create: {
          childId,
          serviceId,
          date: dateObj,
          sessionType,
          status: "present",
          signInTime,
          signedInById: session.user.id,
          notes,
        },
      });
      // Fire-and-forget — don't block the response
      sendSignInNotification(childId, serviceId, signInTime).catch((err) => logger.error("Failed to send sign-in notification", { err, childId, serviceId }));
      break;
    }

    case "sign_out": {
      const signOutTime = new Date();
      record = await prisma.attendanceRecord.upsert({
        where: uniqueKey,
        update: {
          signOutTime,
          signedOutById: session.user.id,
        },
        create: {
          childId,
          serviceId,
          date: dateObj,
          sessionType,
          status: "present",
          signInTime: signOutTime, // auto sign-in if missing
          signedInById: session.user.id,
          signOutTime,
          signedOutById: session.user.id,
        },
      });
      // Fire-and-forget
      sendSignOutNotification(childId, serviceId, signOutTime).catch((err) => logger.error("Failed to send sign-out notification", { err, childId, serviceId }));
      break;
    }

    case "mark_absent":
      record = await prisma.attendanceRecord.upsert({
        where: uniqueKey,
        update: {
          status: "absent",
          absenceReason: absenceReason ?? null,
          signInTime: null,
          signOutTime: null,
          signedInById: null,
          signedOutById: null,
          notes,
        },
        create: {
          childId,
          serviceId,
          date: dateObj,
          sessionType,
          status: "absent",
          absenceReason: absenceReason ?? null,
          notes,
        },
      });
      break;

    case "undo":
      record = await prisma.attendanceRecord.upsert({
        where: uniqueKey,
        update: {
          status: "booked",
          signInTime: null,
          signOutTime: null,
          signedInById: null,
          signedOutById: null,
          absenceReason: null,
        },
        create: {
          childId,
          serviceId,
          date: dateObj,
          sessionType,
          status: "booked",
        },
      });
      break;
  }

  // ── Sync aggregate DailyAttendance ─────────────────────
  // Count all individual records for this session to update the totals
  const counts = await prisma.attendanceRecord.groupBy({
    by: ["status"],
    where: { serviceId, date: dateObj, sessionType },
    _count: { id: true },
  });

  const attended = counts.find((c) => c.status === "present")?._count.id ?? 0;
  const absent = counts.find((c) => c.status === "absent")?._count.id ?? 0;
  const totalBooked = counts.reduce((sum, c) => sum + c._count.id, 0);

  await prisma.dailyAttendance.upsert({
    where: {
      serviceId_date_sessionType: {
        serviceId,
        date: dateObj,
        sessionType,
      },
    },
    update: {
      attended,
      absent,
      enrolled: totalBooked,
      recordedById: session.user.id,
    },
    create: {
      serviceId,
      date: dateObj,
      sessionType,
      attended,
      absent,
      enrolled: totalBooked,
      recordedById: session.user.id,
    },
  });

  return NextResponse.json(record, { status: 200 });
});
