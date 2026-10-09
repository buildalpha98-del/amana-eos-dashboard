/**
 * Recording a hand-over — a child signed in or out — and keeping the
 * session's DailyAttendance totals in step.
 *
 * ONE implementation for every place a child is handed over (2026-10-09):
 * the staff door screen (POST /api/attendance/roll-call) and the door
 * iPad's Parent mode (POST /api/door/sign). Two ways to sign a child in
 * is how a register stops being trustworthy.
 */
import type { SessionType } from "@prisma/client";
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
  const { childId, serviceId, date, sessionType, action, at, recordedById, signedByName, signMethod, signature, notes } = input;
  const roomId = await requireRoomId(serviceId, sessionType);
  const where = {
    childId_serviceId_date_sessionType: { childId, serviceId, date, sessionType },
  };

  if (action === "sign_in") {
    const record = await prisma.attendanceRecord.upsert({
      where,
      update: {
        status: "present",
        signInTime: at,
        signedInById: recordedById,
        ...(signedByName ? { signedInByName: signedByName } : {}),
        ...(signMethod ? { signedInMethod: signMethod } : {}),
        ...(signature ? { signedInSignature: signature } : {}),
        notes,
      },
      create: {
        childId,
        serviceId,
        date,
        roomId,
        sessionType,
        status: "present",
        signInTime: at,
        signedInById: recordedById,
        ...(signedByName ? { signedInByName: signedByName } : {}),
        ...(signMethod ? { signedInMethod: signMethod } : {}),
        ...(signature ? { signedInSignature: signature } : {}),
        notes,
      },
    });
    sendSignInNotification(childId, serviceId, at).catch((err) =>
      logger.error("Failed to send sign-in notification", { err, childId, serviceId }),
    );
    return record;
  }

  const record = await prisma.attendanceRecord.upsert({
    where,
    update: {
      signOutTime: at,
      signedOutById: recordedById,
      ...(signedByName ? { signedOutByName: signedByName } : {}),
      ...(signMethod ? { signedOutMethod: signMethod } : {}),
      ...(signature ? { signedOutSignature: signature } : {}),
    },
    create: {
      childId,
      serviceId,
      date,
      roomId,
      sessionType,
      status: "present",
      signInTime: at, // auto sign-in if missing
      signedInById: recordedById,
      signOutTime: at,
      signedOutById: recordedById,
      ...(signedByName ? { signedOutByName: signedByName } : {}),
      ...(signMethod ? { signedOutMethod: signMethod } : {}),
      ...(signature ? { signedOutSignature: signature } : {}),
    },
  });
  sendSignOutNotification(childId, serviceId, at).catch((err) =>
    logger.error("Failed to send sign-out notification", { err, childId, serviceId }),
  );
  return record;
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
