/**
 * The 24-hour reply promise on the thank-you page, kept (Daniel, 16 Oct 2026).
 *
 * An enrolment still at "submitted" (staff haven't moved it to Reviewing,
 * Confirmed…) gets:
 *   - at 20h: a reminder to the centre team + the centre mailbox;
 *   - at 24h: an "overdue" alert that also goes to head office.
 * Each is claimed (stamp set where null) BEFORE alerting, so an overlapping
 * run can't send it twice. Only enrolments from the last 72 hours are
 * considered — the first deploy must not fire alerts for an old backlog.
 */
import { prisma } from "@/lib/prisma";
import { alertCentreTeam, childNamesFrom } from "@/lib/centre-team-alerts";

const H = 3_600_000;
export const REPLY_HOURS = 24;
const REMIND_AT_HOURS = 20;
const LOOKBACK_HOURS = 72;

export async function runEnrolmentReplyClock(now = new Date()): Promise<{ reminded: number; overdue: number }> {
  const oldest = new Date(now.getTime() - LOOKBACK_HOURS * H);
  let reminded = 0;
  let overdue = 0;

  // Overdue first: something already past 24h gets the overdue alert only.
  const late = await prisma.enrolmentSubmission.findMany({
    where: {
      status: "submitted",
      serviceId: { not: null },
      slaOverdueSentAt: null,
      createdAt: { gte: oldest, lte: new Date(now.getTime() - REPLY_HOURS * H) },
    },
    select: { id: true, serviceId: true, children: true },
  });
  for (const s of late) {
    const claim = await prisma.enrolmentSubmission.updateMany({
      where: { id: s.id, slaOverdueSentAt: null, status: "submitted" },
      data: { slaOverdueSentAt: now, slaReminderSentAt: now },
    });
    if (claim.count === 0) continue;
    const kids = childNamesFrom(s.children);
    await alertCentreTeam({
      serviceId: s.serviceId!,
      type: "enrolment_reply_overdue",
      title: `Overdue: ${kids}'s family has waited over 24 hours`,
      body: "We promised a reply within 24 hours. Please call the family today, then mark the enrolment as contacted.",
      link: `/enrolments?id=${s.id}`,
      headOffice: true,
      email: {
        subject: `Overdue: ${kids}'s enrolment has waited over 24 hours`,
        lines: [
          `The family enrolling <strong>${kids}</strong> was told we'd be in touch within 24 hours, and the enrolment is still marked <strong>Submitted</strong>.`,
          "Please call them today, then open the enrolment and mark it as contacted.",
        ],
        button: "Open the enrolment",
      },
    });
    overdue++;
  }

  const due = await prisma.enrolmentSubmission.findMany({
    where: {
      status: "submitted",
      serviceId: { not: null },
      slaReminderSentAt: null,
      createdAt: { gte: oldest, lte: new Date(now.getTime() - REMIND_AT_HOURS * H) },
    },
    select: { id: true, serviceId: true, children: true },
  });
  for (const s of due) {
    const claim = await prisma.enrolmentSubmission.updateMany({
      where: { id: s.id, slaReminderSentAt: null, status: "submitted" },
      data: { slaReminderSentAt: now },
    });
    if (claim.count === 0) continue;
    const kids = childNamesFrom(s.children);
    await alertCentreTeam({
      serviceId: s.serviceId!,
      type: "enrolment_reply_due",
      title: `4 hours left to reply: ${kids}`,
      body: "This family was promised a reply within 24 hours. Give them a call, then mark the enrolment as contacted.",
      link: `/enrolments?id=${s.id}`,
      email: {
        subject: `Reminder: reply to ${kids}'s family within 4 hours`,
        lines: [
          `The family enrolling <strong>${kids}</strong> submitted their form about 20 hours ago and was promised a reply within 24 hours.`,
          "Give them a call, then open the enrolment and mark it as contacted.",
        ],
        button: "Open the enrolment",
      },
    });
    reminded++;
  }
  return { reminded, overdue };
}
