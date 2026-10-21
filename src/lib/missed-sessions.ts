/**
 * "We've missed Yusuf" (Daniel, 16 Oct 2026) — a gentle check-in when a
 * regular child stops coming. Deliberately cautious, because OWNA records a
 * sick day the same as a no-show, and a family with an unwell child must
 * never feel chased. A child qualifies only when ALL of these hold:
 *
 *   - they have regular booked days in OWNA (casual families come and go —
 *     since 21 Oct 2026 they get a gentler "we're still here" instead, after
 *     CASUAL_GAP_DAYS without a session, while school's in);
 *   - they've attended before, but not for 14+ days;
 *   - that whole gap sits well inside one school term — 10+ days from any
 *     term start or end, which also covers the NSW/VIC calendar difference;
 *   - the centre's OWNA sync really ran on (nearly) every weekday of the
 *     gap, so a sync outage can't masquerade as an absence;
 *   - they're still enrolled in OWNA, and we haven't asked about this gap.
 *
 * The email says "no need to reply" up front; one-tap answers go to the
 * centre, and "thinking of stopping" to head office too.
 */
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/email";
import { recordMarketingSends } from "@/lib/frequency-cap";
import { alertCentreTeam } from "@/lib/centre-team-alerts";
import { centreWelcomeData } from "@/lib/enrolment-welcome";
import { attendanceDataLive } from "@/lib/attendance-journey";
import { getTermForDate, getTermsForYear } from "@/lib/school-terms";
import { missedSessionsEmail, stillHereEmail } from "@/lib/email-templates/attendance-journey";

const DAY = 24 * 3_600_000;
export const GAP_DAYS = 14;
/**
 * Casual-only families (21 Oct 2026): "we're still here" after this long
 * without a session, while school's in (10+ days into the current term).
 */
export const CASUAL_GAP_DAYS = 35;
const TERM_BUFFER_DAYS = 10;
const LOOKBACK_DAYS = 60;
const CASUAL_LOOKBACK_DAYS = 120;
const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;

export const MISSED_REASONS = {
  all_good: "All good — just taking a break",
  unwell: "They've been unwell",
  change_days: "We'd like to change our days",
  stopping: "We're thinking of stopping",
  call_me: "Please give me a call",
} as const;
export type MissedReason = keyof typeof MISSED_REASONS;

const SECRET = () => process.env.NOTIFICATION_PREF_SECRET || process.env.NEXTAUTH_SECRET || "";
export function missedCheckToken(childId: string): string {
  return createHmac("sha256", SECRET()).update(`missed-check:${childId}`).digest("hex").slice(0, 32);
}
export function verifyMissedCheckToken(childId: string, token: string): boolean {
  const want = Buffer.from(missedCheckToken(childId));
  const got = Buffer.from(token || "");
  return want.length === got.length && timingSafeEqual(want, got);
}

/** Today is inside a school term, 10+ days after it started. */
export function inTermWithBuffer(now: Date): boolean {
  const t = getTermForDate(now);
  if (!t) return false;
  const term = getTermsForYear(t.year).find((x) => x.term === t.number);
  return !!term && now.getTime() >= term.startsOn.getTime() + TERM_BUFFER_DAYS * DAY;
}

/** The whole gap sits inside ONE term, at least 10 days from either end. */
export function gapInsideTerm(from: Date, to: Date): boolean {
  const a = getTermForDate(from);
  const b = getTermForDate(to);
  if (!a || !b || a.year !== b.year || a.number !== b.number) return false;
  const term = getTermsForYear(a.year).find((t) => t.term === a.number);
  if (!term) return false;
  return from.getTime() >= term.startsOn.getTime() + TERM_BUFFER_DAYS * DAY && to.getTime() <= term.endsOn.getTime() - TERM_BUFFER_DAYS * DAY;
}

function weekdaysBetween(from: Date, to: Date): string[] {
  const out: string[] = [];
  for (let t = from.getTime() + DAY; t < to.getTime(); t += DAY) {
    const d = new Date(t);
    if (d.getUTCDay() >= 1 && d.getUTCDay() <= 5) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Did the OWNA sync record attendance on (nearly) every weekday of the gap? */
export async function syncCoveredGap(serviceId: string, from: Date, to: Date): Promise<boolean> {
  const days = weekdaysBetween(from, to);
  if (days.length === 0) return false;
  const rows = await prisma.dailyAttendance.findMany({
    where: { serviceId, date: { gt: from, lt: to } },
    select: { date: true },
  });
  const seen = new Set(rows.map((r) => r.date.toISOString().slice(0, 10)));
  return days.filter((d) => seen.has(d)).length >= days.length - 2;
}

function hasRegularDays(bookingPrefs: unknown): boolean {
  const p = (bookingPrefs ?? {}) as Record<string, unknown>;
  return WEEKDAYS.some((d) => p[d] === true);
}

export async function runMissedSessionChecks(now = new Date()): Promise<{ sent: number }> {
  const base = process.env.NEXTAUTH_URL ?? "https://amanaoshc.company";
  const kids = await prisma.child.findMany({
    where: {
      enrolmentId: { not: null },
      ownaMatchChildId: { not: null },
      status: "active",
      lastAttendedAt: { lte: new Date(now.getTime() - GAP_DAYS * DAY), gte: new Date(now.getTime() - CASUAL_LOOKBACK_DAYS * DAY) },
    },
    select: {
      id: true,
      firstName: true,
      serviceId: true,
      enrolmentId: true,
      lastAttendedAt: true,
      ownaMatchChildId: true,
      missedCheckInSentAt: true,
      enrolment: { select: { primaryParent: true } },
    },
  });
  let sent = 0;
  const emailedFamilies = new Set<string>();
  for (const k of kids) {
    if (!k.serviceId || !k.lastAttendedAt || !k.enrolmentId) continue;
    if (emailedFamilies.has(k.enrolmentId)) continue; // siblings: one email per family per run
    if (k.missedCheckInSentAt && k.missedCheckInSentAt >= k.lastAttendedAt) continue; // already asked about this gap
    if (!(await attendanceDataLive(k.serviceId, now))) continue;
    const owna = await prisma.child.findUnique({
      where: { ownaChildId: k.ownaMatchChildId! },
      select: { status: true, bookingPrefs: true },
    });
    if (!owna || owna.status !== "active") continue;
    const casual = !hasRegularDays(owna.bookingPrefs);
    if (casual) {
      // Casual-only: a longer gap, school in session, data covering it.
      if (now.getTime() - k.lastAttendedAt.getTime() < CASUAL_GAP_DAYS * DAY) continue;
      if (!inTermWithBuffer(now)) continue;
    } else {
      if (now.getTime() - k.lastAttendedAt.getTime() > LOOKBACK_DAYS * DAY) continue;
      if (!gapInsideTerm(k.lastAttendedAt, now)) continue;
    }
    if (!(await syncCoveredGap(k.serviceId, casual ? new Date(now.getTime() - GAP_DAYS * DAY) : k.lastAttendedAt, now))) continue;
    const parent = k.enrolment?.primaryParent as { email?: string; firstName?: string } | null;
    if (!parent?.email) continue;

    const claim = await prisma.child.updateMany({
      where: { id: k.id, missedCheckInSentAt: k.missedCheckInSentAt },
      data: { missedCheckInSentAt: now },
    });
    if (claim.count === 0) continue;
    try {
      const centre = await centreWelcomeData(k.serviceId, now);
      if (!centre) continue;
      const token = missedCheckToken(k.id);
      const links = Object.fromEntries(
        (Object.keys(MISSED_REASONS) as MissedReason[]).map((r) => [r, `${base}/api/public/check-in?c=${k.id}&r=${r}&t=${token}`]),
      );
      const lastSeen = k.lastAttendedAt.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
      const { subject, html } = await (casual ? stillHereEmail : missedSessionsEmail)({
        ...centre,
        parentFirstName: parent.firstName?.trim() || "there",
        childNames: [k.firstName],
        childFirstName: k.firstName,
        lastSeen,
        links,
      });
      await sendEmail({ to: parent.email, subject, html }, { idempotencyKey: `missed-${k.id}-${k.lastAttendedAt.toISOString().slice(0, 10)}` });
      await recordMarketingSends(prisma, [{ email: parent.email }], { source: "lifecycle" });
      emailedFamilies.add(k.enrolmentId);
      // A heads-up so the centre isn't surprised if the family rings.
      await alertCentreTeam({
        serviceId: k.serviceId,
        type: "missed_sessions_check_in",
        title: `We've checked in with ${k.firstName}'s family`,
        body: casual
          ? `Casual family, not seen since ${lastSeen}. We sent a "we're still here" email; you'll be told if they reply. It's in Follow-ups → Quiet families.`
          : `Not seen since ${lastSeen}. We sent a gentle "we've missed you" email; you'll be told if they reply. It's in Follow-ups → Quiet families.`,
        link: `/enrolments?id=${k.enrolmentId}`,
      });
      sent++;
    } catch (err) {
      logger.error("Missed-sessions email failed", { childId: k.id, err });
    }
  }
  return { sent };
}

/** The family tapped an answer. Latest wins; the centre hears (head office too for "stopping"). */
export async function recordMissedReason(childId: string, reason: MissedReason): Promise<boolean> {
  const child = await prisma.child.findUnique({
    where: { id: childId },
    select: { id: true, firstName: true, serviceId: true, enrolmentId: true, missedCheckInReason: true },
  });
  if (!child) return false;
  await prisma.child.update({ where: { id: childId }, data: { missedCheckInReason: reason, missedCheckInReasonAt: new Date() } });
  if (!child.serviceId || child.missedCheckInReason === reason) return true;
  const quiet = reason === "all_good" || reason === "unwell";
  await alertCentreTeam({
    serviceId: child.serviceId,
    type: "missed_sessions_reason",
    title: `${child.firstName}'s family: "${MISSED_REASONS[reason]}"`,
    body: quiet
      ? "No action needed — just so you know."
      : reason === "change_days"
        ? "Give them a call to sort out new days in OWNA."
        : reason === "stopping"
          ? "They may be leaving. A personal call today could make the difference."
          : "Please give them a call today.",
    link: child.enrolmentId ? `/enrolments?id=${child.enrolmentId}` : `/services/${child.serviceId}`,
    headOffice: reason === "stopping",
    ...(quiet
      ? {}
      : {
          email: {
            subject: `${child.firstName}'s family: "${MISSED_REASONS[reason]}"`,
            lines: [
              `We checked in with ${child.firstName}'s family after a couple of weeks without attending. They answered: <strong>${MISSED_REASONS[reason]}</strong>.`,
              reason === "change_days" ? "Please call them to sort out new days in OWNA." : "Please give them a call today.",
            ],
            button: "Open the enrolment",
          },
        }),
  });
  return true;
}
