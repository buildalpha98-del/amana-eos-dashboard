import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCronSecret } from "@/lib/cron-guard";
import { getResend, FROM_EMAIL } from "@/lib/email";
import {
  nurtureWelcomeEmail,
  nurtureHowToEnrolEmail,
  nurtureWhatToBringEmail,
  nurtureAppSetupEmail,
  nurtureFirstWeekEmail,
  nurtureNpsSurveyEmail,
  nurtureCcsAssistEmail,
  nurtureNudge1Email,
  nurtureFormSupportEmail,
  nurtureNudge2Email,
  nurtureFinalNudgeEmail,
  nurtureDay1CheckinEmail,
  nurtureDay3CheckinEmail,
  nurtureWeek2FeedbackEmail,
  nurtureMonth1ReferralEmail,
  nurtureSessionReminderEmail,
} from "@/lib/email-templates";
import { withApiHandler } from "@/lib/api-handler";
import { acquireCronLock } from "@/lib/cron-guard";
import { logger } from "@/lib/logger";

// LEGACY: Hardcoded template map for ParentNurtureStep records.
// The new SequenceStepExecution system uses emailTemplateId from the DB instead.
// Safe to remove once no pending legacy ParentNurtureStep records remain.
const TEMPLATE_MAP: Record<string, (firstName: string, centreName: string) => { subject: string; html: string }> = {
  welcome: nurtureWelcomeEmail,
  how_to_enrol: nurtureHowToEnrolEmail,
  what_to_bring: nurtureWhatToBringEmail,
  app_setup: nurtureAppSetupEmail,
  first_week: nurtureFirstWeekEmail,
  nps_survey: nurtureNpsSurveyEmail,
  ccs_assist: nurtureCcsAssistEmail,
  nudge_1: nurtureNudge1Email,
  form_support: nurtureFormSupportEmail,
  nudge_2: nurtureNudge2Email,
  final_nudge: nurtureFinalNudgeEmail,
  day1_checkin: nurtureDay1CheckinEmail,
  day3_checkin: nurtureDay3CheckinEmail,
  week2_feedback: nurtureWeek2FeedbackEmail,
  month1_referral: nurtureMonth1ReferralEmail,
};

const BATCH_SIZE = 15;

/**
 * POST /api/cron/nurture-send — Send pending nurture emails
 *
 * Runs every 2 hours during business hours. Finds pending steps where
 * scheduledFor <= now, sends via Resend, updates status, logs to DeliveryLog.
 *
 * No cron lock needed — each step has a unique constraint and status tracking,
 * so concurrent runs won't double-send.
 *
 * Processes in batches of 15 via Promise.allSettled to avoid Vercel 60s timeout.
 */
export const POST = withApiHandler(async (req) => {
  const authResult = verifyCronSecret(req);
  if (authResult) return authResult.error;

  // Idempotency guard — prevent double-sends on concurrent invocations
  const guard = await acquireCronLock("nurture-send", "2hourly");
  if (!guard.acquired) {
    return NextResponse.json({ skipped: true, reason: guard.reason });
  }

  const resend = getResend();
  if (!resend) {
    await guard.fail(new Error("Resend not configured"));
    return NextResponse.json({ error: "Resend not configured" }, { status: 503 });
  }

  try {

  const now = new Date();

  // Atomically claim pending legacy steps to prevent double-processing
  await prisma.parentNurtureStep.updateMany({
    where: { status: "pending", scheduledFor: { lte: now } },
    data: { status: "sending" },
  });

  // Find claimed steps ready to process
  const pendingSteps = await prisma.parentNurtureStep.findMany({
    where: {
      status: "sending",
    },
    include: {
      contact: { select: { email: true, firstName: true, subscribed: true } },
      service: { select: { name: true, code: true, address: true, suburb: true, state: true, orientationVideoUrl: true } },
    },
    orderBy: { scheduledFor: "asc" },
    take: 50, // Process in batches
  });

  if (pendingSteps.length === 0) {
    // Still process sequence executions even if no legacy steps
    const seqResult = await processSequenceExecutions(resend, now);
    await guard.complete({ legacy: { sent: 0, skipped: 0, failed: 0 }, sequences: seqResult });
    return NextResponse.json({
      sent: seqResult.sent,
      skipped: seqResult.skipped,
      failed: seqResult.failed,
      legacy: { sent: 0, skipped: 0, failed: 0 },
      sequences: seqResult,
    });
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  /** Process a single legacy ParentNurtureStep (already claimed with status="sending") */
  async function processLegacyStep(step: (typeof pendingSteps)[number]): Promise<"sent" | "skipped" | "failed"> {
    // Skip unsubscribed contacts
    if (!step.contact.subscribed) {
      await prisma.parentNurtureStep.update({
        where: { id: step.id },
        data: { status: "cancelled" },
      });
      return "skipped";
    }

    const firstName = step.contact.firstName || "Parent";
    const centreName = step.service.name;

    let subject: string;
    let html: string;

    if (step.templateKey === "session_reminder") {
      const serviceAddress = [step.service.address, step.service.suburb, step.service.state]
        .filter(Boolean)
        .join(", ");
      ({ subject, html } = nurtureSessionReminderEmail(
        firstName,
        centreName,
        serviceAddress || undefined,
        step.service.orientationVideoUrl || undefined,
      ));
    } else {
      const templateFn = TEMPLATE_MAP[step.templateKey];
      if (!templateFn) {
        await prisma.parentNurtureStep.update({
          where: { id: step.id },
          data: { status: "failed" },
        });
        return "failed";
      }
      ({ subject, html } = templateFn(firstName, centreName));
    }

    const result = await resend!.emails.send({
      from: FROM_EMAIL,
      to: step.contact.email,
      subject,
      html,
    });

    await prisma.parentNurtureStep.update({
      where: { id: step.id },
      data: { status: "sent", sentAt: new Date() },
    });

    // Log to DeliveryLog
    await prisma.deliveryLog.create({
      data: {
        channel: "email",
        serviceCode: step.service.code,
        messageType: "nurture_sequence",
        externalId: result.data?.id || null,
        recipientCount: 1,
        status: "sent",
      },
    });

    return "sent";
  }

  // Process legacy steps in batches of BATCH_SIZE via Promise.allSettled
  for (let i = 0; i < pendingSteps.length; i += BATCH_SIZE) {
    const batch = pendingSteps.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(step => processLegacyStep(step))
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      if (result.status === "fulfilled") {
        if (result.value === "sent") sent++;
        else if (result.value === "skipped") skipped++;
        else if (result.value === "failed") failed++;
      } else {
        // Promise rejected — log failure and revert to pending for retry
        const step = batch[j];
        logger.error("nurture-send: Failed to send step", { stepId: step.id, err: result.reason });
        try {
          await prisma.parentNurtureStep.update({
            where: { id: step.id },
            data: { status: "pending" },
          });
          await prisma.deliveryLog.create({
            data: {
              channel: "email",
              serviceCode: step.service.code,
              messageType: "nurture_sequence",
              recipientCount: 1,
              status: "failed",
              errorMessage: result.reason instanceof Error ? result.reason.message : String(result.reason),
            },
          });
        } catch (dbErr) {
          logger.error("nurture-send: Failed to record failure for step", { stepId: step.id, err: dbErr });
        }
        failed++;
      }
    }
  }

  // ── Also process SequenceStepExecution records (new system) ──
  const seqResult = await processSequenceExecutions(resend, now);

  const result = {
    sent: sent + seqResult.sent,
    skipped: skipped + seqResult.skipped,
    failed: failed + seqResult.failed,
    legacy: { sent, skipped, failed },
    sequences: seqResult,
  };
  await guard.complete(result);
  return NextResponse.json(result);

  } catch (err) {
    await guard.fail(err);
    throw err;
  }
});

/**
 * Process pending SequenceStepExecution records for both parent nurture
 * and CRM outreach sequences.
 *
 * Processes in batches of BATCH_SIZE via Promise.allSettled for parallelism.
 */
async function processSequenceExecutions(
  resend: ReturnType<typeof getResend>,
  now: Date,
) {
  if (!resend) return { sent: 0, skipped: 0, failed: 0 };

  // Atomically claim pending sequence executions to prevent double-processing
  await prisma.sequenceStepExecution.updateMany({
    where: { status: "pending", scheduledFor: { lte: now } },
    data: { status: "sending" },
  });

  const pending = await prisma.sequenceStepExecution.findMany({
    where: {
      status: "sending",
    },
    include: {
      step: {
        include: {
          emailTemplate: { select: { id: true, subject: true, blocks: true, htmlContent: true } },
          sequence: { select: { type: true } },
        },
      },
      enrolment: {
        include: {
          contact: { select: { email: true, firstName: true, subscribed: true } },
          lead: { select: { contactEmail: true, contactName: true, schoolName: true } },
          sequence: { select: { name: true } },
        },
      },
    },
    orderBy: { scheduledFor: "asc" },
    take: 50,
  });

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  // Pre-import email layout module once to avoid repeated dynamic imports
  const { renderBlocksToHtml, marketingLayout } = await import("@/lib/email-marketing-layout");

  /** Process a single SequenceStepExecution */
  async function processSequenceExec(exec: (typeof pending)[number]): Promise<"sent" | "skipped"> {
    const isParent = exec.step.sequence.type === "parent_nurture";
    const email = isParent
      ? exec.enrolment.contact?.email
      : exec.enrolment.lead?.contactEmail;

    if (!email) {
      await prisma.sequenceStepExecution.update({
        where: { id: exec.id },
        data: { status: "cancelled", error: "No email address" },
      });
      return "skipped";
    }

    // Check subscription for parent contacts
    if (isParent && exec.enrolment.contact && !exec.enrolment.contact.subscribed) {
      await prisma.sequenceStepExecution.update({
        where: { id: exec.id },
        data: { status: "cancelled", error: "Unsubscribed" },
      });
      return "skipped";
    }

    let subject: string;
    let html: string;

    // Try visual template first, fall back to hardcoded TEMPLATE_MAP
    if (exec.step.emailTemplate?.blocks) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const blocks = exec.step.emailTemplate.blocks as any;
      const name = isParent
        ? exec.enrolment.contact?.firstName || "Parent"
        : exec.enrolment.lead?.contactName || exec.enrolment.lead?.schoolName || "there";
      html = renderBlocksToHtml(blocks, { firstName: name, parentName: name, contactName: name, schoolName: exec.enrolment.lead?.schoolName || "", centreName: "" });
      subject = exec.step.emailTemplate.subject || exec.step.name;
    } else if (exec.step.emailTemplate?.htmlContent) {
      html = marketingLayout(exec.step.emailTemplate.htmlContent);
      subject = exec.step.emailTemplate.subject || exec.step.name;
    } else {
      // Fall back to hardcoded template
      const templateFn = TEMPLATE_MAP[exec.step.templateKey];
      if (!templateFn) {
        // For CRM steps without templates, generate a basic email
        subject = exec.step.name;
        html = marketingLayout(`<p style="margin:0;color:#374151;font-size:15px;line-height:1.6;">${exec.step.name} — this email template has not been configured yet.</p>`);
      } else {
        const name = isParent
          ? exec.enrolment.contact?.firstName || "Parent"
          : exec.enrolment.lead?.contactName || "there";
        ({ subject, html } = templateFn(name, exec.enrolment.sequence.name));
      }
    }

    await resend!.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject,
      html,
    });

    await prisma.sequenceStepExecution.update({
      where: { id: exec.id },
      data: { status: "sent", sentAt: new Date() },
    });

    // Update enrolment progress
    await prisma.sequenceEnrolment.update({
      where: { id: exec.enrolmentId },
      data: { currentStepNumber: exec.step.stepNumber },
    });

    // For CRM: create touchpoint log
    if (!isParent && exec.enrolment.lead) {
      await prisma.touchpointLog.create({
        data: {
          leadId: exec.enrolment.leadId!,
          type: "auto_email",
          subject,
        },
      });
    }

    return "sent";
  }

  // Process sequence executions in batches of BATCH_SIZE via Promise.allSettled
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(exec => processSequenceExec(exec))
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      if (result.status === "fulfilled") {
        if (result.value === "sent") sent++;
        else if (result.value === "skipped") skipped++;
      } else {
        const exec = batch[j];
        logger.error("nurture-send: Sequence exec failed", { execId: exec.id, err: result.reason });
        try {
          await prisma.sequenceStepExecution.update({
            where: { id: exec.id },
            data: { status: "pending", error: result.reason instanceof Error ? result.reason.message : String(result.reason) },
          });
        } catch (dbErr) {
          logger.error("nurture-send: Failed to record failure for exec", { execId: exec.id, err: dbErr });
        }
        failed++;
      }
    }
  }

  // Mark completed enrolments
  const activeEnrolments = [...new Set(pending.map((e) => e.enrolmentId))];
  for (const enrolmentId of activeEnrolments) {
    const remaining = await prisma.sequenceStepExecution.count({
      where: { enrolmentId, status: { in: ["pending", "sending"] } },
    });
    if (remaining === 0) {
      await prisma.sequenceEnrolment.update({
        where: { id: enrolmentId },
        data: { status: "completed", completedAt: new Date() },
      });
    }
  }

  return { sent, skipped, failed };
}
