/**
 * Recording a hand-over — a child signed in or out — and keeping the
 * session's DailyAttendance totals in step.
 *
 * ONE implementation for every place a child is handed over (2026-10-09):
 * the staff door screen (POST /api/attendance/roll-call) and the door
 * iPad's Parent mode (POST /api/door/sign). Two ways to sign a child in
 * is how a register stops being trustworthy.
 */
import type { Prisma, SessionType } from "@prisma/client";
import { ApiError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireRoomId } from "@/lib/room-resolver";
import { sendSignInNotification, sendSignOutNotification } from "@/lib/notifications/attendance";

export type SignMethod = "staff" | "parent_kiosk" | "parent_app";

export interface HandoverInput {
  childId: string;
  serviceId: string;
  /** UTC midnight of the centre's date (the `@db.Date` value). */
  date: Date;
  sessionType: SessionType;
  action: "sign_in" | "sign_out";
  at: Date;
  /** The staff User who recorded it — null on the door iPad (a parent did). */
  recordedById: string | null;
  /** Who dropped off / collected (Reg 158). */
  signedByName?: string;
  signMethod?: SignMethod;
  signature?: string;
  notes?: string;
}

export async function recordHandover(input: HandoverInput) {
  const { childId, serviceId, at, action } = input;
  if (action === "sign_in") {
    const result = await recordArrival(prisma, input);
    if (result.changed) {
      sendSignInNotification(childId, serviceId, at).catch((err) =>
        logger.error("Failed to send sign-in notification", { err, childId, serviceId }),
      );
    }
    return result.record;
  }

  const result = await recordDeparture(prisma, input);
  if (result.changed) {
    sendSignOutNotification(childId, serviceId, at).catch((err) =>
      logger.error("Failed to send sign-out notification", { err, childId, serviceId }),
    );
  }
  return result.record;
}

/**
 * First arrival wins, including simultaneous single/bulk taps. Creating with
 * ON CONFLICT DO NOTHING avoids a unique-key error aborting a bulk transaction.
 * Existing arrivals (including collected children) are never reopened here.
 */
export async function recordArrival(db: Prisma.TransactionClient, input: HandoverInput) {
  const { childId, serviceId, date, sessionType, at, recordedById, signedByName, signMethod, signature, notes } = input;
  const key = { childId, serviceId, date, sessionType };
  const data = {
    status: "present" as const,
    signInTime: at,
    signedInById: recordedById,
    absenceReason: null,
    ...(signedByName ? { signedInByName: signedByName } : {}),
    ...(signMethod ? { signedInMethod: signMethod } : {}),
    ...(signature ? { signedInSignature: signature } : {}),
    notes,
  };
  const created = await db.attendanceRecord.createMany({
    data: [{ ...key, roomId: await requireRoomId(serviceId, sessionType), ...data }],
    skipDuplicates: true,
  });
  const updated = created.count === 0
    ? await db.attendanceRecord.updateMany({
        where: { ...key, signInTime: null, signOutTime: null },
        data,
      })
    : { count: 0 };
  const record = await db.attendanceRecord.findUnique({
    where: { childId_serviceId_date_sessionType: key },
  });
  if (!record?.signInTime) {
    throw ApiError.conflict("This attendance record needs checking. Ask your Coordinator to review it before signing in.");
  }
  return { record, changed: created.count > 0 || updated.count > 0 };
}

/** Shared by individual and bulk collection. Never create an arrival as a side effect. */
export async function recordDeparture(db: Prisma.TransactionClient, input: HandoverInput) {
  const { childId, serviceId, date, sessionType, at, recordedById, signedByName, signMethod, signature } = input;
  const key = { childId, serviceId, date, sessionType };
  const changed = await db.attendanceRecord.updateMany({
    where: { ...key, signInTime: { not: null, lte: at }, signOutTime: null },
    data: {
      signOutTime: at,
      signedOutById: recordedById,
      ...(signedByName ? { signedOutByName: signedByName } : {}),
      ...(signMethod ? { signedOutMethod: signMethod } : {}),
      ...(signature ? { signedOutSignature: signature } : {}),
    },
  });
  const record = await db.attendanceRecord.findUnique({
    where: { childId_serviceId_date_sessionType: key },
  });
  if (!record?.signInTime || !record.signOutTime) {
    throw ApiError.conflict("An arrival record is missing or later than this collection. Ask your Coordinator to check the attendance record before signing out.");
  }
  return { record, changed: changed.count > 0 };
}

/** Recount a session's records into its DailyAttendance row. */
export async function syncDailyAttendance(
  serviceId: string,
  date: Date,
  sessionType: SessionType,
  recordedById: string | null,
) {
  const counts = await prisma.attendanceRecord.groupBy({
    by: ["status"],
    where: { serviceId, date, sessionType },
    _count: { id: true },
  });
  const attended = counts.find((c) => c.status === "present")?._count.id ?? 0;
  const absent = counts.find((c) => c.status === "absent")?._count.id ?? 0;
  const enrolled = counts.reduce((sum, c) => sum + c._count.id, 0);
  const roomId = await requireRoomId(serviceId, sessionType);
  await prisma.dailyAttendance.upsert({
    where: { serviceId_date_sessionType: { serviceId, date, sessionType } },
    update: { attended, absent, enrolled, recordedById },
    create: { serviceId, date, roomId, sessionType, attended, absent, enrolled, recordedById },
  });
}
