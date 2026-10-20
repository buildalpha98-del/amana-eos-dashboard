/**
 * What the OWNA checklist does for the family (Daniel, 16 Oct 2026).
 *
 *   invitation ✓ (sent)     → "Your OWNA invitation is on its way" guide
 *   invitation ✓ (existing) → "You're all set in OWNA"
 *   sessions ✓ + first day  → "You're booked in! First day is …", and the
 *                              first-session emails are re-timed to that day
 *   invitation sent 3+ days, access not ticked → family nudge + centre alert
 *                              (cron owna-handover-nudge, once per invitation)
 *
 * Swallow-and-log throughout — a mail problem must never undo a checklist save.
 */
import { recordMarketingSends } from "@/lib/frequency-cap";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import { centreWelcomeData } from "@/lib/enrolment-welcome";
import { syncParentJourney } from "@/lib/parent-journey";
import { alertCentreTeam, childNamesFrom } from "@/lib/centre-team-alerts";
import { readHandoff, type HandoffStep } from "@/lib/owna-handoff";
import {
  firstDayConfirmedEmail,
  ownaExistingEmail,
  ownaInvitationEmail,
  ownaNudgeEmail,
  type HandoverEmailData,
} from "@/lib/email-templates/owna-handover";

const DAY = 24 * 3_600_000;
export const NUDGE_AFTER_DAYS = 3;

/** Family + centre details for a handover email, or null if there's no one to email. */
export async function handoverData(enrolmentId: string, firstDay?: string): Promise<HandoverEmailData | null> {
  const sub = await prisma.enrolmentSubmission.findUnique({
    where: { id: enrolmentId },
    select: { serviceId: true, primaryParent: true, childRecords: { select: { firstName: true } } },
  });
  const parent = sub?.primaryParent as { email?: string; firstName?: string; surname?: string } | null;
  const email = parent?.email?.trim();
  if (!sub?.serviceId || !email) return null;
  const centre = await centreWelcomeData(sub.serviceId);
  if (!centre) return null;
  return {
    ...centre,
    parentFirstName: parent?.firstName?.trim() || "there",
    parentEmail: email,
    childNames: sub.childRecords.map((c) => c.firstName).filter(Boolean),
    firstDay,
  };
}

/** Called after a checklist step is saved as complete. */
export async function onHandoffStepCompleted(
  enrolmentId: string,
  step: HandoffStep,
  completion: { at: string; mode?: "sent" | "existing"; firstDay?: string },
): Promise<void> {
  try {
    if (step !== "invitation" && step !== "sessions") return;
    const d = await handoverData(enrolmentId, completion.firstDay);
    if (!d) return;

    if (step === "invitation") {
      const { subject, html } = completion.mode === "existing" ? await ownaExistingEmail(d) : await ownaInvitationEmail(d);
      await sendEmail({ to: d.parentEmail, subject, html }, { idempotencyKey: `owna-invitation-${enrolmentId}-${completion.at}` });
      await recordMarketingSends(prisma, [{ email: d.parentEmail }], { source: "lifecycle" });
      return;
    }

    // sessions: confirm the day, then re-time the first-session series.
    if (!completion.firstDay) return;
    const { subject, html } = await firstDayConfirmedEmail(d);
    await sendEmail(
      {
        to: d.parentEmail,
        subject,
        html,
        // The centre's welcome pack PDF, attached (Daniel, 20 Oct 2026).
        ...(d.welcomePackUrl
          ? { attachments: [{ filename: `Amana OSHC welcome pack - ${d.centreName}.pdf`, path: d.welcomePackUrl }] }
          : {}),
      },
      { idempotencyKey: `first-day-${enrolmentId}-${completion.at}` },
    );
    await recordMarketingSends(prisma, [{ email: d.parentEmail }], { source: "lifecycle" });
    const sub = await prisma.enrolmentSubmission.findUnique({ where: { id: enrolmentId }, select: { serviceId: true } });
    await syncParentJourney({
      email: d.parentEmail,
      serviceId: sub?.serviceId,
      stage: "first_session",
      parentName: d.parentFirstName,
      childName: d.childNames[0] ?? null,
      // Same anchor convention as approval (UTC midnight of the date).
      firstSessionDate: new Date(`${completion.firstDay}T00:00:00Z`),
    });
  } catch (err) {
    logger.error("OWNA handover email failed", { enrolmentId, step, err });
  }
}

/**
 * Daily: invitations sent 3+ days ago where staff haven't ticked "Parent can
 * access the OWNA app". Each invitation is nudged once (inviteNudgedAt is
 * claimed first and compared with the invitation's own time).
 */
export async function runOwnaNudges(now = new Date()): Promise<{ nudged: number }> {
  const rows = await prisma.enrolmentOwnaHandoff.findMany({
    where: { enrolment: { status: "processed", processedAt: { gte: new Date(now.getTime() - 90 * DAY) } } },
    select: { enrolmentId: true, state: true, inviteNudgedAt: true, enrolment: { select: { serviceId: true, children: true } } },
  });
  let nudged = 0;
  for (const r of rows) {
    const state = readHandoff(r.state);
    const inv = state?.steps.invitation;
    if (!inv || inv.mode !== "sent" || state?.steps.access) continue;
    const sentAt = new Date(inv.at);
    if (now.getTime() - sentAt.getTime() < NUDGE_AFTER_DAYS * DAY) continue;
    if (r.inviteNudgedAt && r.inviteNudgedAt >= sentAt) continue;
    const claim = await prisma.enrolmentOwnaHandoff.updateMany({
      where: { enrolmentId: r.enrolmentId, OR: [{ inviteNudgedAt: null }, { inviteNudgedAt: { lt: sentAt } }] },
      data: { inviteNudgedAt: now },
    });
    if (claim.count === 0) continue;
    try {
      const d = await handoverData(r.enrolmentId);
      if (d) {
        const { subject, html } = await ownaNudgeEmail(d);
        await sendEmail({ to: d.parentEmail, subject, html }, { idempotencyKey: `owna-nudge-${r.enrolmentId}-${inv.at}` });
        await recordMarketingSends(prisma, [{ email: d.parentEmail }], { source: "lifecycle" });
      }
      if (r.enrolment.serviceId) {
        const kids = childNamesFrom(r.enrolment.children);
        await alertCentreTeam({
          serviceId: r.enrolment.serviceId,
          type: "owna_not_accepted",
          title: `${kids}'s family hasn't got into OWNA yet`,
          body: `Their invitation went ${Math.floor((now.getTime() - sentAt.getTime()) / DAY)} days ago. We've emailed them tips; a quick call usually sorts it.`,
          link: `/enrolments?id=${r.enrolmentId}`,
        });
      }
      nudged++;
    } catch (err) {
      logger.error("OWNA nudge failed", { enrolmentId: r.enrolmentId, err });
    }
  }
  return { nudged };
}
