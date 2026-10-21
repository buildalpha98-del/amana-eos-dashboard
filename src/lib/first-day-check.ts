/**
 * The first-day check and call (Daniel, 21 Oct 2026).
 *
 * OWNA attendance isn't flowing at most centres, so the dashboard can't
 * tell on its own whether a child actually came on their first day — and
 * "how did day one go?" must never reach a family whose child didn't come.
 * So staff confirm it:
 *
 *   1. The morning after the first day, head office (+ the enrolments
 *      inbox) is asked "did Yusuf come?" (runFirstDayPrompts, once).
 *   2. Enrolments → Follow-ups → "First day — did they come?":
 *        Attended      → stamps the children's first attendance (so the
 *                        attendance gate opens) and releases the held
 *                        "how did it go?" email straight away.
 *        Didn't attend → the email stays held (dropped after 14 days; the
 *                        "anything stopping you?" email takes over).
 *   3. Either way the family moves to "Call after the first day" until
 *      staff tick "We called them".
 *
 * Where OWNA sign-ins DO arrive (attendance-journey.ts), a recorded first
 * attendance counts as "attended" with no button needed.
 *
 * Only families from OWNA_CHECKLIST_START on (19 Oct 2026); casual-only
 * families have no first day and aren't prompted.
 */
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { alertCentreTeam, childNamesFrom } from "@/lib/centre-team-alerts";
import { OWNA_CHECKLIST_START, readHandoff } from "@/lib/owna-handoff";
import { addDaysUTC, serviceDateISO, serviceTodayISO } from "@/lib/timezone";
import { ATTENDANCE_GATED, attendanceDataLive } from "@/lib/attendance-journey";
import { formatFirstDay } from "@/lib/email-templates/owna-handover";

const LOOKBACK_DAYS = 21;
const DAY = 24 * 3_600_000;

type Sub = {
  id: string;
  serviceId: string | null;
  createdAt: Date;
  children: unknown;
  primaryParent: unknown;
  firstDayAttendance: string | null;
  firstDayAttendanceAt: Date | null;
  firstDayCalledAt: Date | null;
  ownaHandoff: { state: unknown } | null;
  childRecords: { id: string; firstName: string; bookingPrefs: unknown; firstAttendedAt: Date | null }[];
};

const subSelect = {
  id: true,
  serviceId: true,
  createdAt: true,
  children: true,
  primaryParent: true,
  firstDayAttendance: true,
  firstDayAttendanceAt: true,
  firstDayCalledAt: true,
  ownaHandoff: { select: { state: true } },
  childRecords: { select: { id: true, firstName: true, bookingPrefs: true, firstAttendedAt: true } },
} as const;

/**
 * The family's first day ("YYYY-MM-DD", Sydney): the day staff confirmed on
 * the OWNA checklist, else the earliest start date on the form. Casual-only
 * → null.
 */
export function firstDayOf(sub: Pick<Sub, "ownaHandoff" | "childRecords">): string | null {
  const sessions = readHandoff(sub.ownaHandoff?.state)?.steps.sessions;
  if (sessions?.casual) return null;
  if (sessions?.firstDay) return sessions.firstDay;
  const dates = (sub.childRecords ?? [])
    .map((c) => (c.bookingPrefs as { startDate?: string } | null)?.startDate)
    .filter((d): d is string => !!d && !Number.isNaN(new Date(d).getTime()))
    .map((d) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? d : serviceDateISO(new Date(d))))
    .sort();
  return dates[0] ?? null;
}

/** An OWNA sign-in already recorded for one of the children. */
const recordedAttendance = (sub: Pick<Sub, "childRecords">) => (sub.childRecords ?? []).some((c) => c.firstAttendedAt);

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export interface FirstDayRow {
  id: string;
  childNames: string;
  parentName: string;
  phone: string | null;
  serviceName: string | null;
  firstDay: string;
  /** "attended" | "absent" — or null while waiting for the answer. */
  attendance: string | null;
}

async function candidates(serviceIds: string[] | null, now: Date) {
  return prisma.enrolmentSubmission.findMany({
    where: {
      status: "processed",
      createdAt: { gte: OWNA_CHECKLIST_START },
      processedAt: { gte: new Date(now.getTime() - 60 * DAY) },
      ...(serviceIds === null ? {} : { serviceId: { in: serviceIds } }),
    },
    select: subSelect,
    orderBy: { processedAt: "asc" },
    take: 300,
  });
}

/** The two Follow-ups lists: "did they come?" and "call after the first day". */
export async function firstDayFollowUps(
  serviceIds: string[] | null,
  serviceName: Map<string, string>,
  now = new Date(),
): Promise<{ firstDayCheck: FirstDayRow[]; firstDayCalls: FirstDayRow[] }> {
  const today = serviceTodayISO(now);
  const oldest = serviceDateISO(addDaysUTC(now, -LOOKBACK_DAYS));
  const firstDayCheck: FirstDayRow[] = [];
  const firstDayCalls: FirstDayRow[] = [];
  for (const s of await candidates(serviceIds, now)) {
    const day = firstDayOf(s);
    if (!day || day >= today || day < oldest) continue; // not happened yet, or long gone
    const p = (s.primaryParent ?? {}) as Record<string, unknown>;
    const row: FirstDayRow = {
      id: s.id,
      childNames: childNamesFrom(s.children),
      parentName: [text(p.firstName), text(p.surname)].filter(Boolean).join(" ") || "Parent",
      phone: text(p.mobile) || null,
      serviceName: s.serviceId ? serviceName.get(s.serviceId) ?? null : null,
      firstDay: day,
      attendance: s.firstDayAttendance ?? (recordedAttendance(s) ? "attended" : null),
    };
    if (!row.attendance) firstDayCheck.push(row);
    else if (!s.firstDayCalledAt) firstDayCalls.push(row);
  }
  return { firstDayCheck, firstDayCalls };
}

/** Daily: ask once, the morning after the first day, "did they come?". */
export async function runFirstDayPrompts(now = new Date()): Promise<{ prompted: number }> {
  const today = serviceTodayISO(now);
  const oldest = serviceDateISO(addDaysUTC(now, -7));
  let prompted = 0;
  const subs = await prisma.enrolmentSubmission.findMany({
    where: {
      status: "processed",
      createdAt: { gte: OWNA_CHECKLIST_START },
      firstDayPromptedAt: null,
      firstDayAttendance: null,
      serviceId: { not: null },
    },
    select: subSelect,
    take: 300,
  });
  for (const s of subs) {
    const day = firstDayOf(s);
    if (!day || day >= today || day < oldest || recordedAttendance(s)) continue;
    // A centre with live attendance (OWNA API or Cowork's twice-weekly run)
    // answers this itself: wait until the data covers the first day, and
    // only ask if it shows no sign-in (21 Oct 2026).
    if (await attendanceDataLive(s.serviceId!, now)) {
      const latest = await prisma.dailyAttendance.findFirst({
        where: { serviceId: s.serviceId! },
        orderBy: { date: "desc" },
        select: { date: true },
      });
      if (!latest || latest.date.toISOString().slice(0, 10) < day) continue;
    }
    const claim = await prisma.enrolmentSubmission.updateMany({
      where: { id: s.id, firstDayPromptedAt: null },
      data: { firstDayPromptedAt: now },
    });
    if (claim.count === 0) continue;
    const kids = childNamesFrom(s.children);
    const when = formatFirstDay(day);
    await alertCentreTeam({
      serviceId: s.serviceId!,
      type: "enrolment_first_day_check",
      title: `Did ${kids} come on ${when}?`,
      body: "Their first day was booked. Tell us if they came — that sends the \"how did it go?\" email — then give the family a call.",
      link: `/enrolments?id=${s.id}`,
      enrolmentsTeam: true,
      email: {
        subject: `First day check: did ${kids} come on ${when}?`,
        lines: [
          `<strong>${kids}</strong>'s first day was <strong>${when}</strong>.`,
          "Open Enrolments → Follow-ups and tap <strong>Attended</strong> or <strong>Didn't attend</strong>. Attended sends the family our \"how did it go?\" email.",
          "Then give the family a quick call to see how it went.",
        ],
        button: "Open Follow-ups",
      },
    });
    prompted++;
  }
  return { prompted };
}

/** "Attended" / "Didn't attend" / "We called them". */
export async function recordFirstDay(
  enrolmentId: string,
  action: "attended" | "absent" | "called",
  byId: string,
  now = new Date(),
): Promise<void> {
  if (action === "called") {
    await prisma.enrolmentSubmission.update({ where: { id: enrolmentId }, data: { firstDayCalledAt: now } });
    return;
  }
  const sub = await prisma.enrolmentSubmission.findUnique({ where: { id: enrolmentId }, select: subSelect });
  if (!sub) return;
  await prisma.enrolmentSubmission.update({
    where: { id: enrolmentId },
    data: { firstDayAttendance: action, firstDayAttendanceAt: now, firstDayAttendanceById: byId },
  });
  if (action !== "attended") return;

  // Stamp the first attendance so the "how did it go?" gate opens. The day
  // they came is the first day ("didn't attend" earlier, now here → today).
  const day = sub.firstDayAttendance === "absent" ? serviceTodayISO(now) : firstDayOf(sub) ?? serviceTodayISO(now);
  const when = new Date(`${day}T00:00:00Z`);
  await prisma.child.updateMany({
    where: { enrolmentId, firstAttendedAt: null },
    data: { firstAttendedAt: when, lastAttendedAt: when },
  });
  await releaseHeldCheckins(sub, now);
}

/**
 * The gate held "how did day one go?" (and any day-3 / week-2 already due)
 * a day at a time; send them on the next run instead of waiting.
 */
async function releaseHeldCheckins(sub: Sub, now: Date) {
  try {
    const email = text((sub.primaryParent as { email?: unknown } | null)?.email);
    if (!email || !sub.serviceId) return;
    const held = await prisma.sequenceStepExecution.findMany({
      where: {
        status: "pending",
        step: { templateKey: { in: [...ATTENDANCE_GATED] } },
        enrolment: { contact: { email: { equals: email, mode: "insensitive" }, serviceId: sub.serviceId } },
      },
      select: { id: true, step: { select: { delayHours: true } }, enrolment: { select: { anchorDate: true } } },
    });
    const due = held.filter((h) => h.enrolment.anchorDate.getTime() + h.step.delayHours * 3_600_000 <= now.getTime());
    if (due.length)
      await prisma.sequenceStepExecution.updateMany({ where: { id: { in: due.map((d) => d.id) } }, data: { scheduledFor: now } });
  } catch (err) {
    logger.error("Releasing held first-day check-ins failed", { enrolmentId: sub.id, err });
  }
}

/**
 * For the attendance gate where OWNA data ISN'T live: is this family one
 * whose first day staff confirm by hand (a recent enrolment here, no
 * attendance recorded yet)? Then hold the check-in until they do.
 */
export async function awaitingFirstDayConfirmation(email: string, serviceId: string): Promise<boolean> {
  const e = email.trim().toLowerCase();
  const subs = await prisma.enrolmentSubmission.findMany({
    where: { serviceId, status: "processed", createdAt: { gte: OWNA_CHECKLIST_START } },
    select: { primaryParent: true, secondaryParent: true, ownaHandoff: { select: { state: true } } },
    take: 500,
  });
  return subs.some(
    (s) =>
      !readHandoff(s.ownaHandoff?.state)?.steps.sessions?.casual &&
      [s.primaryParent, s.secondaryParent].some((p) => text((p as { email?: unknown } | null)?.email).toLowerCase() === e),
  );
}
