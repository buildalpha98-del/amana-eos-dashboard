/**
 * The centre's day in one call — the data behind the educator and
 * coordinator landing page.
 *
 * Deliberately ONE endpoint rather than the eight the page would
 * otherwise fire on load: this is the first screen after login, on a
 * centre iPad, often on school wifi. Everything here is today-scoped and
 * cheap; anything that needs history lives on the service tabs.
 *
 * Access is `assertServiceAccess` (fail-closed, primary service only for
 * floor staff) — the same gate the roll call uses, because this page
 * shows the same children.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { assertServiceAccess } from "@/lib/authz-scope";
import {
  activeSessionKeys,
  roomLabel,
  type SessionKey,
  type SessionTimes,
} from "@/lib/service-settings";

/** Local midnight → next local midnight, for "today" comparisons. */
function dayBounds(now: Date) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  // Date-only columns (`@db.Date`) are stored at UTC midnight; build the
  // matching value rather than passing a local-midnight Date, which
  // lands on the previous day for AEST.
  const dateOnly = new Date(
    Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()),
  );
  return { start, end, dateOnly };
}

const hhmm = (d: Date) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

export const GET = withApiAuth(async (req: NextRequest, session, context) => {
  const { id } = await context!.params!;
  assertServiceAccess(session as never, id);

  const now = new Date();
  const { start, end, dateOnly } = dayBounds(now);
  const nowHHmm = hhmm(now);

  const service = await prisma.service.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      code: true,
      capacity: true,
      sessionTimes: true,
    },
  });
  if (!service) throw ApiError.notFound("Service not found");

  const sessionTimes = (service.sessionTimes ?? null) as SessionTimes | null;
  const keys = activeSessionKeys(sessionTimes);

  const [
    attendance,
    bookings,
    responsiblePersons,
    shifts,
    medicationCount,
    checklists,
    pendingBookingRequests,
    openIncidents,
    expiringCerts,
    unreadHandovers,
  ] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { serviceId: id, date: dateOnly },
      select: {
        childId: true,
        sessionType: true,
        status: true,
        signInTime: true,
        signOutTime: true,
        child: { select: { id: true, firstName: true, surname: true } },
      },
    }),
    prisma.booking.findMany({
      where: {
        serviceId: id,
        date: dateOnly,
        status: { in: ["confirmed", "requested"] },
      },
      select: { childId: true, sessionType: true, type: true, status: true },
    }),
    prisma.responsiblePersonEntry.findMany({
      where: { serviceId: id, date: dateOnly },
      select: { sessionType: true, personName: true, personRole: true },
    }),
    prisma.rosterShift.findMany({
      where: { serviceId: id, date: dateOnly },
      select: {
        id: true,
        staffName: true,
        role: true,
        sessionType: true,
        shiftStart: true,
        shiftEnd: true,
        actualStart: true,
        actualEnd: true,
        user: { select: { id: true, name: true, avatar: true } },
      },
      orderBy: { shiftStart: "asc" },
    }),
    prisma.medicationAdministration.count({
      where: { serviceId: id, administeredAt: { gte: start, lt: end } },
    }),
    prisma.dailyChecklist.findMany({
      where: { serviceId: id, date: dateOnly },
      select: {
        id: true,
        sessionType: true,
        status: true,
        items: { select: { checked: true } },
      },
    }),
    prisma.booking.count({
      where: { serviceId: id, status: "requested" },
    }),
    prisma.incidentRecord.count({
      where: {
        serviceId: id,
        deleted: false,
        followUpRequired: true,
        followUpCompleted: false,
      },
    }),
    prisma.complianceCertificate.count({
      where: {
        serviceId: id,
        supersededAt: null,
        expiryDate: {
          not: null,
          lte: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        },
      },
    }),
    prisma.shiftHandover.count({
      where: { serviceId: id, createdAt: { gte: start, lt: end } },
    }),
  ]);

  // ── Per-programme snapshot ──────────────────────────────────────────
  // "In care" is the number that matters on the floor: signed in and not
  // yet signed out. Booked/absent give it context.
  const rpBySession = new Map(
    responsiblePersons.map((r) => [r.sessionType as string, r]),
  );
  const bookedBySession = new Map<string, Set<string>>();
  const casualBySession = new Map<string, number>();
  for (const b of bookings) {
    const k = b.sessionType as string;
    if (!bookedBySession.has(k)) bookedBySession.set(k, new Set());
    bookedBySession.get(k)!.add(b.childId);
    if (b.type === "casual") {
      casualBySession.set(k, (casualBySession.get(k) ?? 0) + 1);
    }
  }

  const programmes = keys.map((key: SessionKey) => {
    const k = key as string;
    const rows = attendance.filter((a) => (a.sessionType as string) === k);
    const inCare = rows.filter((a) => a.signInTime && !a.signOutTime);
    const wentHome = rows.filter((a) => a.signInTime && a.signOutTime);
    const absent = rows.filter((a) => a.status === "absent");
    const booked = bookedBySession.get(k)?.size ?? 0;

    // Educators on the floor for this programme right now — a rostered
    // shift covering the current time. Same approximation the ratio
    // widget makes, and labelled as such on screen.
    const onFloor = shifts.filter(
      (s) =>
        (s.sessionType as string) === k &&
        s.shiftStart <= nowHHmm &&
        nowHHmm < s.shiftEnd,
    );

    const rp = rpBySession.get(k);

    return {
      key: k,
      name: roomLabel(sessionTimes, key),
      booked,
      inCare: inCare.length,
      wentHome: wentHome.length,
      absent: absent.length,
      casual: casualBySession.get(k) ?? 0,
      educatorsOnFloor: onFloor.length,
      leader: rp?.personName ?? null,
      leaderRole: rp?.personRole ?? null,
      children: inCare
        .map((a) => ({
          id: a.child?.id ?? a.childId,
          name: a.child
            ? `${a.child.firstName} ${a.child.surname}`.trim()
            : "Child",
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  });

  // ── Staff ───────────────────────────────────────────────────────────
  // Not checked in = their shift has started, and no clock-in recorded.
  // Shifts later today are not late yet, so they're excluded.
  const notCheckedIn = shifts
    .filter((s) => !s.actualStart && s.shiftStart <= nowHHmm && nowHHmm < s.shiftEnd)
    .map((s) => ({
      id: s.id,
      name: s.user?.name ?? s.staffName,
      role: s.role,
      shiftStart: s.shiftStart,
    }));

  const onDuty = shifts
    .filter((s) => s.actualStart && !s.actualEnd)
    .map((s) => ({
      id: s.id,
      name: s.user?.name ?? s.staffName,
      role: s.role,
      avatar: s.user?.avatar ?? null,
      since: s.actualStart,
    }));

  const checklistsOutstanding = checklists.filter(
    (c) => c.status !== "completed",
  ).length;

  const totals = programmes.reduce(
    (acc, p) => ({
      booked: acc.booked + p.booked,
      inCare: acc.inCare + p.inCare,
      absent: acc.absent + p.absent,
      casual: acc.casual + p.casual,
    }),
    { booked: 0, inCare: 0, absent: 0, casual: 0 },
  );

  return NextResponse.json({
    service: {
      id: service.id,
      name: service.name,
      code: service.code,
      capacity: service.capacity,
    },
    asOf: now.toISOString(),
    totals,
    programmes,
    staff: {
      onDuty,
      notCheckedIn,
      rosteredToday: shifts.length,
    },
    attention: {
      medicationsGivenToday: medicationCount,
      checklistsOutstanding,
      pendingBookingRequests,
      openIncidents,
      expiringCerts,
      handoversToday: unreadHandovers,
    },
  });
});

export type ServiceDashboardResponse = {
  service: {
    id: string;
    name: string;
    code: string | null;
    capacity: number | null;
  };
  asOf: string;
  totals: { booked: number; inCare: number; absent: number; casual: number };
  programmes: Array<{
    key: string;
    name: string;
    booked: number;
    inCare: number;
    wentHome: number;
    absent: number;
    casual: number;
    educatorsOnFloor: number;
    leader: string | null;
    leaderRole: string | null;
    children: Array<{ id: string; name: string }>;
  }>;
  staff: {
    onDuty: Array<{
      id: string;
      name: string;
      role: string | null;
      avatar: string | null;
      since: string | null;
    }>;
    notCheckedIn: Array<{
      id: string;
      name: string;
      role: string | null;
      shiftStart: string;
    }>;
    rosteredToday: number;
  };
  attention: {
    medicationsGivenToday: number;
    checklistsOutstanding: number;
    pendingBookingRequests: number;
    openIncidents: number;
    expiringCerts: number;
    handoversToday: number;
  };
};
