/**
 * GET /api/parent/today — where each of the family's children is RIGHT NOW.
 *
 * Reassurance is the reason parents open this app at 3:30pm: did he get
 * signed in, has she been picked up. That answer existed only inside a
 * child's attendance history, three screens deep and framed as a record
 * rather than a status. This returns today's sign-ins per child so Home
 * can say it in one line.
 */
import { NextResponse } from "next/server";
import { withParentAuth } from "@/lib/parent-auth";
import { prisma } from "@/lib/prisma";
import { getLocalDateParts, SERVICE_TZ } from "@/lib/timezone";

export const GET = withParentAuth(async (_req, { parent }) => {
  if (parent.enrolmentIds.length === 0) {
    return NextResponse.json({ children: [] });
  }

  const enrolments = await prisma.enrolmentSubmission.findMany({
    where: { id: { in: parent.enrolmentIds }, status: { not: "draft" } },
    select: {
      childRecords: {
        where: { status: { not: "withdrawn" } },
        select: { id: true, firstName: true },
      },
    },
  });
  const children = enrolments.flatMap((e) => e.childRecords);
  if (children.length === 0) {
    return NextResponse.json({ children: [] });
  }

  // "Today" in the centre's timezone, as the UTC-midnight date the
  // attendance rows are keyed by — a raw `new Date()` here would roll
  // the day over at 10am local.
  const local = getLocalDateParts(new Date(), SERVICE_TZ);
  const today = new Date(
    Date.UTC(local.year, local.month - 1, local.day),
  );

  const records = await prisma.attendanceRecord.findMany({
    where: {
      childId: { in: children.map((c) => c.id) },
      date: today,
    },
    select: {
      childId: true,
      sessionType: true,
      signInTime: true,
      signOutTime: true,
      // The names typed at the door — who dropped off and picked up.
      signedInByName: true,
      signedOutByName: true,
    },
    orderBy: { signInTime: "asc" },
  });

  return NextResponse.json({
    children: children.map((c) => ({
      id: c.id,
      firstName: c.firstName,
      sessions: records
        .filter((r) => r.childId === c.id)
        .map((r) => ({
          sessionType: r.sessionType,
          signInTime: r.signInTime,
          signOutTime: r.signOutTime,
          signedInByName: r.signedInByName,
          signedOutByName: r.signedOutByName,
        })),
    })),
  });
});
