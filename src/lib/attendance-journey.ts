/**
 * Parent emails based on real attendance (Daniel, 16 Oct 2026) — stage 3.
 *
 * 1. MATCH: OWNA's attendance records name OWNA's own child ids, which the
 *    sync stores on separate Child rows. Each attended record is matched to
 *    the ENROLMENT child at the same centre by name + date of birth, and
 *    stamps firstAttendedAt / lastAttendedAt on it.
 * 2. FIRST ATTENDANCE re-times the first-session emails to the day the child
 *    actually came (day-1 "how did it go?" the next morning, and so on).
 * 3. GATE: "How did day one go?", day-3 and week-2 are held until the family
 *    has attended — never "how was the first day?" to a family who didn't come.
 * 4. NO-SHOW: approved 14+ days, nothing attended → "Is anything stopping
 *    you?" with one-tap answers, and the centre told the answer.
 * 5. EXTRA DAY: three weeks after the first attendance → what's on next week
 *    and "add an extra day".
 *
 * Everything here only switches on at a centre whose OWNA sync is actually
 * running (synced in the last 48 hours). Without attendance data, a family
 * who HAS been coming would look like a no-show.
 */
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/email";
import { syncParentJourney } from "@/lib/parent-journey";
import { alertCentreTeam, childNamesFrom } from "@/lib/centre-team-alerts";
import { centreWelcomeData, upcomingProgram } from "@/lib/enrolment-welcome";
import { extraDayEmail, noShowEmail } from "@/lib/email-templates/attendance-journey";
import { appendUnsubscribeFooter } from "@/lib/email-templates/base";
import type { OwnaAttendanceRecord } from "@/lib/owna";

const DAY = 24 * 3_600_000;
const LIVE_WITHIN_HOURS = 48;
export const NO_SHOW_AFTER_DAYS = 14;
export const EXTRA_DAY_AFTER_DAYS = 21;
/** Emails that only make sense once the child has actually attended. */
export const ATTENDANCE_GATED = new Set(["day1_checkin", "day3_checkin", "week2_feedback"]);
const GATE_GIVE_UP_DAYS = 14;

// ── 1. Matching ──────────────────────────────────────────────

const norm = (s: string | null | undefined) =>
  (s ?? "").normalize("NFKD").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
function sameDob(a: Date | null, b: Date | null) {
  if (!a || !b) return false;
  // Allow one day either way: OWNA's dates and ours can sit either side of UTC midnight.
  return Math.abs(a.getTime() - b.getTime()) <= DAY + 1;
}

/** Called by the OWNA sync with a centre's attendance records. Swallow-and-log. */
export async function recordOwnaAttendance(serviceId: string, records: OwnaAttendanceRecord[]): Promise<number> {
  try {
    const attended = records.filter((r) => r.attending || (r.signIn ?? "").trim());
    if (!attended.length) return 0;
    const ownaKids = await prisma.child.findMany({
      where: { ownaChildId: { in: [...new Set(attended.map((r) => r.childId))] } },
      select: { ownaChildId: true, firstName: true, surname: true, dob: true },
    });
    const enrolled = await prisma.child.findMany({
      where: { serviceId, enrolmentId: { not: null }, ownaChildId: null },
      select: { id: true, enrolmentId: true, firstName: true, surname: true, dob: true, firstAttendedAt: true, lastAttendedAt: true },
    });
    let matched = 0;
    for (const rec of attended) {
      const o = ownaKids.find((k) => k.ownaChildId === rec.childId);
      if (!o) continue;
      const byName = enrolled.filter((e) => norm(e.firstName) === norm(o.firstName) && norm(e.surname) === norm(o.surname));
      // Name AND date of birth; name alone only when it's unambiguous and a DOB is missing.
      const match =
        byName.find((e) => sameDob(e.dob, o.dob)) ?? (byName.length === 1 && (!byName[0].dob || !o.dob) ? byName[0] : undefined);
      if (!match) continue;
      const when = new Date(`${rec.attendanceDate}T00:00:00Z`);
      const first = !match.firstAttendedAt;
      await prisma.child.update({
        where: { id: match.id },
        data: {
          ...(first || when < match.firstAttendedAt! ? { firstAttendedAt: when } : {}),
          ...(!match.lastAttendedAt || when > match.lastAttendedAt ? { lastAttendedAt: when } : {}),
        },
      });
      match.firstAttendedAt = match.firstAttendedAt && when > match.firstAttendedAt ? match.firstAttendedAt : when;
      matched++;
      if (first && match.enrolmentId) await onFirstAttendance(match.enrolmentId, rec.attendanceDate);
    }
    return matched;
  } catch (err) {
    logger.error("Attendance matching failed", { serviceId, err });
    return 0;
  }
}

// ── 2. First attendance ─────────────────────────────────────

export async function onFirstAttendance(enrolmentId: string, dateISO: string): Promise<void> {
  const sub = await prisma.enrolmentSubmission.findUnique({
    where: { id: enrolmentId },
    select: { serviceId: true, primaryParent: true, childRecords: { select: { firstName: true, firstAttendedAt: true } } },
  });
  const parent = sub?.primaryParent as { email?: string; firstName?: string } | null;
  if (!sub?.serviceId || !parent?.email) return;
  // Siblings: only the family's FIRST child through the door re-times things.
  const earlier = sub.childRecords.some((c) => c.firstAttendedAt && day(c.firstAttendedAt)! < dateISO);
  if (earlier) return;
  await syncParentJourney({
    email: parent.email,
    serviceId: sub.serviceId,
    stage: "first_session",
    parentName: parent.firstName ?? null,
    firstSessionDate: new Date(`${dateISO}T00:00:00Z`),
  });
}

// ── 3. The gate for "how did day one go?" ───────────────────

export async function attendanceDataLive(serviceId: string, now = new Date()): Promise<boolean> {
  const s = await prisma.service.findUnique({ where: { id: serviceId }, select: { ownaServiceId: true, ownaSyncedAt: true } });
  return !!s?.ownaServiceId && !!s.ownaSyncedAt && now.getTime() - s.ownaSyncedAt.getTime() < LIVE_WITHIN_HOURS * 3_600_000;
}

/** Has any of this family's enrolled children at this centre attended? */
export async function familyHasAttended(email: string, serviceId: string): Promise<boolean> {
  const e = email.trim().toLowerCase();
  // Compared in code: emails in the enrolment JSON keep the family's casing.
  const kids = await prisma.child.findMany({
    where: { serviceId, firstAttendedAt: { not: null }, enrolmentId: { not: null } },
    select: { enrolment: { select: { primaryParent: true, secondaryParent: true } } },
  });
  return kids.some((k) =>
    [k.enrolment?.primaryParent, k.enrolment?.secondaryParent].some(
      (p) => typeof (p as { email?: unknown } | null)?.email === "string" && (p as { email: string }).email.trim().toLowerCase() === e,
    ),
  );
}

/**
 * For an attendance-gated nurture email: send it, hold it a day, or give up
 * (no attendance two weeks after the planned first day — the no-show email
 * takes over).
 */
export async function attendanceGate(
  templateKey: string,
  email: string,
  serviceId: string | null | undefined,
  anchorDate: Date | null,
  now = new Date(),
): Promise<"send" | "hold" | "cancel"> {
  if (!ATTENDANCE_GATED.has(templateKey) || !serviceId) return "send";
  if (!(await attendanceDataLive(serviceId, now))) return "send"; // no data → today's behaviour
  if (await familyHasAttended(email, serviceId)) return "send";
  if (anchorDate && now.getTime() - anchorDate.getTime() > GATE_GIVE_UP_DAYS * DAY) return "cancel";
  return "hold";
}

// ── 4. No-show ──────────────────────────────────────────────

export const NO_SHOW_REASONS = {
  not_booked: "We haven't booked any days yet",
  owna_trouble: "We're having trouble with OWNA",
  next_term: "We're starting next term",
  changed_plans: "Our plans have changed",
  other: "Something else — please call me",
} as const;
export type NoShowReason = keyof typeof NO_SHOW_REASONS;

const SECRET = () => process.env.NOTIFICATION_PREF_SECRET || process.env.NEXTAUTH_SECRET || "";
export function startCheckToken(enrolmentId: string): string {
  return createHmac("sha256", SECRET()).update(`start-check:${enrolmentId}`).digest("hex").slice(0, 32);
}
export function verifyStartCheckToken(enrolmentId: string, token: string): boolean {
  const want = Buffer.from(startCheckToken(enrolmentId));
  const got = Buffer.from(token || "");
  return want.length === got.length && timingSafeEqual(want, got);
}

export async function runNoShowChecks(now = new Date()): Promise<{ sent: number }> {
  const base = process.env.NEXTAUTH_URL ?? "https://amanaoshc.company";
  const subs = await prisma.enrolmentSubmission.findMany({
    where: {
      status: "processed",
      noShowSentAt: null,
      serviceId: { not: null },
      processedAt: { lte: new Date(now.getTime() - NO_SHOW_AFTER_DAYS * DAY), gte: new Date(now.getTime() - 60 * DAY) },
    },
    select: { id: true, serviceId: true, primaryParent: true, childRecords: { select: { firstName: true, firstAttendedAt: true } } },
  });
  let sent = 0;
  for (const s of subs) {
    if (s.childRecords.some((c) => c.firstAttendedAt)) continue;
    if (!(await attendanceDataLive(s.serviceId!, now))) continue;
    const parent = s.primaryParent as { email?: string; firstName?: string } | null;
    if (!parent?.email) continue;
    const claim = await prisma.enrolmentSubmission.updateMany({ where: { id: s.id, noShowSentAt: null }, data: { noShowSentAt: now } });
    if (claim.count === 0) continue;
    try {
      const centre = await centreWelcomeData(s.serviceId!, now);
      if (!centre) continue;
      const token = startCheckToken(s.id);
      const links = Object.fromEntries(
        (Object.keys(NO_SHOW_REASONS) as NoShowReason[]).map((r) => [r, `${base}/api/public/start-check?e=${s.id}&r=${r}&t=${token}`]),
      ) as Record<NoShowReason, string>;
      const { subject, html } = await noShowEmail({
        ...centre,
        parentFirstName: parent.firstName?.trim() || "there",
        childNames: s.childRecords.map((c) => c.firstName).filter(Boolean),
        links,
      });
      await sendEmail({ to: parent.email, subject, html }, { idempotencyKey: `no-show-${s.id}` });
      sent++;
    } catch (err) {
      logger.error("No-show email failed", { enrolmentId: s.id, err });
    }
  }
  return { sent };
}

/** The family tapped an answer. Records it (latest wins) and tells the centre. */
export async function recordNoShowReason(enrolmentId: string, reason: NoShowReason): Promise<boolean> {
  const sub = await prisma.enrolmentSubmission.findUnique({
    where: { id: enrolmentId },
    select: { id: true, serviceId: true, children: true, noShowReason: true },
  });
  if (!sub) return false;
  await prisma.enrolmentSubmission.update({ where: { id: enrolmentId }, data: { noShowReason: reason, noShowReasonAt: new Date() } });
  if (sub.serviceId && sub.noShowReason !== reason) {
    const kids = childNamesFrom(sub.children);
    await alertCentreTeam({
      serviceId: sub.serviceId,
      type: "no_show_reason",
      title: `${kids}'s family: "${NO_SHOW_REASONS[reason]}"`,
      body:
        reason === "changed_plans"
          ? "They may not be starting. A friendly call helps — and update the enrolment if they've withdrawn."
          : reason === "next_term"
            ? "Note their start term and check their OWNA bookings."
            : "Please give them a call today.",
      link: `/enrolments?id=${enrolmentId}`,
      email: {
        subject: `${kids}'s family hasn't started yet: "${NO_SHOW_REASONS[reason]}"`,
        lines: [
          `We asked the family enrolling <strong>${kids}</strong> whether anything was stopping them starting. They answered: <strong>${NO_SHOW_REASONS[reason]}</strong>.`,
          reason === "next_term" ? "Check their start date in OWNA." : "Please give them a call today.",
        ],
        button: "Open the enrolment",
      },
    });
  }
  return true;
}

// ── 5. Extra day ────────────────────────────────────────────

export async function runExtraDayOffers(now = new Date()): Promise<{ sent: number }> {
  const subs = await prisma.enrolmentSubmission.findMany({
    where: {
      status: "processed",
      extraDayOfferSentAt: null,
      serviceId: { not: null },
      childRecords: {
        some: {
          firstAttendedAt: { lte: new Date(now.getTime() - EXTRA_DAY_AFTER_DAYS * DAY), gte: new Date(now.getTime() - 60 * DAY) },
          status: "active",
        },
      },
    },
    select: { id: true, serviceId: true, primaryParent: true, childRecords: { select: { firstName: true, status: true } } },
  });
  let sent = 0;
  for (const s of subs) {
    const parent = s.primaryParent as { email?: string; firstName?: string } | null;
    if (!parent?.email) continue;
    // A promotional email: honour unsubscribe, and carry the family's own
    // unsubscribe link (their CentreContact, created at approval).
    const contact = await prisma.centreContact.findFirst({
      where: { email: { equals: parent.email.trim(), mode: "insensitive" }, serviceId: s.serviceId! },
      select: { id: true, subscribed: true },
    });
    if (!contact || !contact.subscribed) continue;
    const claim = await prisma.enrolmentSubmission.updateMany({ where: { id: s.id, extraDayOfferSentAt: null }, data: { extraDayOfferSentAt: now } });
    if (claim.count === 0) continue;
    try {
      const centre = await centreWelcomeData(s.serviceId!, now);
      if (!centre) continue;
      const nextWeek = (await upcomingProgram(s.serviceId!, now))[0] ?? null;
      const { subject, html } = await extraDayEmail({
        ...centre,
        parentFirstName: parent.firstName?.trim() || "there",
        childNames: s.childRecords.filter((c) => c.status === "active").map((c) => c.firstName).filter(Boolean),
        nextWeek,
      });
      const withFooter = appendUnsubscribeFooter(html, contact.id, process.env.NEXTAUTH_URL ?? "https://amanaoshc.company");
      await sendEmail({ to: parent.email, subject, html: withFooter }, { idempotencyKey: `extra-day-${s.id}` });
      sent++;
    } catch (err) {
      logger.error("Extra-day email failed", { enrolmentId: s.id, err });
    }
  }
  return { sent };
}
