/**
 * Builds and sends the school-specific welcome email at enrolment approval
 * (template: src/lib/email-templates/enrolment-welcome.ts).
 *
 * Sources, in order of precedence:
 *   1. The centre's Content tab (ServiceContent.welcome*, location, meeting points)
 *   2. What the website publishes for the centre (centre-welcome-defaults.ts)
 *   3. Left out of the email
 * Session times come from Service.sessionTimes; activities from the centre's
 * Program (ProgramActivity, synced nightly from SharePoint).
 */
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import { mergeServiceContent } from "@/lib/service-content-shared";
import { sessionTimesSchema } from "@/lib/service-settings";
import { centreWelcomeDefaults } from "@/lib/centre-welcome-defaults";
import { serviceWeekStart, serviceDateOnly, addDaysUTC } from "@/lib/timezone";
import {
  enrolmentWelcomeEmail,
  type EnrolmentWelcomeData,
  type WelcomeProgramWeek,
} from "@/lib/email-templates/enrolment-welcome";

/** Brands that are routine rather than "what's on" (meals, free play). */
const ROUTINE_BRANDS = new Set(["fuel_up", "free_play"]);
const ROUTINE_TITLE = /^(afternoon tea|breakfast|morning tea|snack|free play|sign[- ]?(in|out)|pack ?up|homework)$/i;
const WEEKS_AHEAD = 3;
const PER_WEEK = 4;
const DAY_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

function clock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h)) return hhmm;
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m ?? 0).padStart(2, "0")}${suffix}`;
}

export function describeSessionTimes(raw: unknown): string[] {
  const parsed = sessionTimesSchema.safeParse(raw ?? {});
  if (!parsed.success) return [];
  const out: string[] = [];
  const t = parsed.data;
  if (t.bsc?.start && t.bsc?.end) out.push(`Before school ${clock(t.bsc.start)} – ${clock(t.bsc.end)}`);
  if (t.asc?.start && t.asc?.end) out.push(`After school ${clock(t.asc.start)} – ${clock(t.asc.end)}`);
  return out;
}

/** The next few weeks of planned activities at a centre, highlights only. */
export async function upcomingProgram(serviceId: string, now = new Date()): Promise<WelcomeProgramWeek[]> {
  // Start from next week when today is Thursday or later — this week is nearly over.
  const thisWeek = serviceWeekStart(now);
  const dow = (serviceDateOnly(now).getUTCDay() + 6) % 7; // Mon = 0 (Sydney date)
  const from = dow >= 3 ? addDaysUTC(thisWeek, 7) : thisWeek;
  const to = addDaysUTC(from, 7 * WEEKS_AHEAD);
  const rows = await prisma.programActivity.findMany({
    where: { serviceId, weekStart: { gte: from, lt: to } },
    select: { weekStart: true, day: true, startTime: true, title: true, programmeBrand: true },
    orderBy: [{ weekStart: "asc" }, { startTime: "asc" }],
  });
  const byWeek = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = r.weekStart.toISOString().slice(0, 10);
    byWeek.set(k, [...(byWeek.get(k) ?? []), r]);
  }
  return [...byWeek.entries()].map(([iso, list]) => {
    const seen = new Set<string>();
    const activities = list
      .sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day) || a.startTime.localeCompare(b.startTime))
      .filter((r) => !ROUTINE_BRANDS.has(r.programmeBrand ?? "") && !ROUTINE_TITLE.test(r.title.trim()))
      .map((r) => r.title.trim())
      .filter((t) => (seen.has(t.toLowerCase()) ? false : (seen.add(t.toLowerCase()), true)))
      .slice(0, PER_WEEK);
    const label = `Week of ${new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "long", timeZone: "UTC" })}`;
    return { label, activities };
  });
}

/** Everything the welcome email shows for one centre (family details added by the caller). */
export async function centreWelcomeData(
  serviceId: string,
  now = new Date(),
): Promise<Omit<EnrolmentWelcomeData, "parentFirstName" | "childNames" | "verifyLink"> | null> {
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { name: true, code: true, phone: true, email: true, sessionTimes: true, content: true },
  });
  if (!service) return null;
  const c = mergeServiceContent(service.content);
  const web = centreWelcomeDefaults(service.code);
  const tips = c.firstSessionTips
    .split("\n")
    .map((l) => l.replace(/^[\s•\-*✓]+/, "").trim())
    .filter(Boolean);
  return {
    centreName: service.name.replace(/^Amana OSHC\s+/i, ""),
    coordinatorName: c.welcomeCoordinatorName.trim() || web.coordinatorName,
    coordinatorPhoto: c.welcomeCoordinatorPhoto.trim() || web.coordinatorPhoto,
    centrePhone: service.phone?.trim() || null,
    centreEmail: service.email?.trim() || null,
    sessionTimes: describeSessionTimes(service.sessionTimes),
    locationWithinSchool: c.locationWithinSchool.trim() || null,
    meetingPoints: c.meetingPoints.trim() || null,
    firstSessionTips: tips,
    welcomeNote: c.welcomeNote.trim() || null,
    welcomePackUrl: c.welcomePackUrl.trim() || web.welcomePackUrl,
    centrePageUrl: web.centrePageUrl,
    program: await upcomingProgram(serviceId, now),
  };
}

/**
 * Send the welcome email for an approved enrolment — at most once.
 * Claims `welcomeEmailSentAt` first; a second approval (or a double click)
 * finds it already set and sends nothing.
 */
export async function sendEnrolmentWelcome(
  enrolmentId: string,
  opts: { verifyLink: string | null },
): Promise<"sent" | "already_sent" | "skipped"> {
  const sub = await prisma.enrolmentSubmission.findUnique({
    where: { id: enrolmentId },
    select: { serviceId: true, primaryParent: true },
  });
  const primary = sub?.primaryParent as { email?: string; firstName?: string } | null;
  const email = primary?.email?.trim();
  if (!sub?.serviceId || !email) return "skipped";

  const claim = await prisma.enrolmentSubmission.updateMany({
    where: { id: enrolmentId, welcomeEmailSentAt: null },
    data: { welcomeEmailSentAt: new Date() },
  });
  if (claim.count === 0) return "already_sent";

  try {
    const centre = await centreWelcomeData(sub.serviceId);
    if (!centre) return "skipped";
    const kids = await prisma.child.findMany({ where: { enrolmentId }, select: { firstName: true } });
    const { subject, html } = await enrolmentWelcomeEmail({
      ...centre,
      parentFirstName: primary?.firstName?.trim() || "there",
      childNames: kids.map((k) => k.firstName).filter(Boolean),
      verifyLink: opts.verifyLink,
    });
    await sendEmail({ to: email, subject, html }, { idempotencyKey: `enrolment-welcome-${enrolmentId}` });
    return "sent";
  } catch (err) {
    // Release the claim so staff (or a retry) can send it.
    await prisma.enrolmentSubmission
      .update({ where: { id: enrolmentId }, data: { welcomeEmailSentAt: null } })
      .catch(() => undefined);
    logger.error("Enrolment welcome email failed", { enrolmentId, err });
    throw err;
  }
}
