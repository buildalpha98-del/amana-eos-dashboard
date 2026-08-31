/**
 * POST /api/families/:id/remind — nudge a family to finish enrolling.
 *
 * 2026-07-30, per Daniel: the Families list shows "Enrolment not started",
 * and a status you can't act on isn't much use.
 *
 * Refuses to send if the family has already submitted — the list could be
 * stale in a staff member's browser, and emailing "please finish your
 * enrolment" to someone who finished yesterday reads badly.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { sendEmail } from "@/lib/email";
import { recordMarketingSends } from "@/lib/frequency-cap";
import { logger } from "@/lib/logger";
import { parentEnrolmentReminderEmail } from "@/lib/email-templates/parent-account";
import { findEnrolmentIdsForEmail } from "@/lib/parent-account";
import { getParentEnrolmentState } from "@/lib/parent-enrolment-state";

type Ctx = { params: Promise<{ id: string }> };

/** Don't let a second click (or a second staff member) double-send. */
const MIN_HOURS_BETWEEN_REMINDERS = 12;

export const POST = withApiAuth(
  async (_req, session, context) => {
    const { id } = await (context as unknown as Ctx).params;

    const account = await prisma.parentAccount.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        enrolmentReminderSentAt: true,
        enrolmentDraft: { select: { currentStep: true, submittedAt: true } },
      },
    });
    if (!account) throw ApiError.notFound("Parent account not found");

    // Re-check state server-side rather than trusting the client's view of
    // the list, which may have been open for a while.
    const enrolments = await prisma.enrolmentSubmission.findMany({
      where: { id: { in: (await findEnrolmentIdsForEmail(account.email)).enrolmentIds } },
      select: { status: true },
    });
    if (getParentEnrolmentState(enrolments) !== "needs_enrolment") {
      throw ApiError.badRequest(
        "This family has already submitted their enrolment.",
      );
    }

    const last = account.enrolmentReminderSentAt;
    if (last) {
      const hours = (Date.now() - last.getTime()) / 3_600_000;
      if (hours < MIN_HOURS_BETWEEN_REMINDERS) {
        throw ApiError.badRequest(
          `A reminder was already sent ${Math.round(hours)}h ago. Please wait before sending another.`,
        );
      }
    }

    const base = process.env.NEXTAUTH_URL ?? "https://amanaoshc.company";
    const { subject, html } = await parentEnrolmentReminderEmail({
      name: account.firstName ?? "there",
      link: `${base}/parent/enrol`,
      hasDraft: (account.enrolmentDraft?.currentStep ?? 0) > 0,
    });

    let sendResult: Awaited<ReturnType<typeof sendEmail>>;
    try {
      sendResult = await sendEmail({ to: account.email, subject, html });
    } catch (err) {
      logger.error("Family reminder email failed", { err, accountId: id });
      // Surfaced here, unlike signup — staff need to know it didn't go.
      throw new ApiError(502, "Couldn't send the reminder email. Please try again.");
    }

    // Frequency-cap ledger: lifecycle mail is 1:1 — RECORDED (it counts
    // toward the parent's weekly marketing-email volume so bulk sends see
    // it) but NEVER cap-blocked. Only actually-sent recipients count
    // (suppressed → sent: []); recordMarketingSends swallows its own errors,
    // so a ledger hiccup never fails a send that already went out.
    if (sendResult.sent.length > 0) {
      await recordMarketingSends(prisma, [{ email: account.email }], {
        source: "lifecycle",
      });
    }

    await prisma.parentAccount.update({
      where: { id },
      data: { enrolmentReminderSentAt: new Date() },
    });
    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "enrolment_reminder_sent",
        entityType: "ParentAccount",
        entityId: id,
        details: { email: account.email },
      },
    });

    return NextResponse.json({ ok: true, email: account.email });
  },
  { roles: ["owner", "head_office", "admin"] },
);
