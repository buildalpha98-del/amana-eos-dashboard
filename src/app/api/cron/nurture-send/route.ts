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

/**
 * POST /api/cron/nurture-send — Send pending nurture emails
 *
 * Runs every 2 hours during business hours. Finds pending steps where
 * scheduledFor <= now, sends via Resend, updates status, logs to DeliveryLog.
 *
 * No cron lock needed — each step has a unique constraint and status tracking,
 * so concurrent runs won't double-send.
 */
export async function POST(req: NextRequest) {
  const authResult = verifyCronSecret(req);
  if (authResult) return authResult.error;

  const resend = getResend();
  if (!resend) {
    return NextResponse.json({ error: "Resend not configured" }, { status: 503 });
  }

  const now = new Date();

  // Find pending steps ready to send
  const pendingSteps = await prisma.parentNurtureStep.findMany({
    where: {
      status: "pending",
      scheduledFor: { lte: now },
    },
    include: {
      contact: { select: { email: true, firstName: true, subscribed: true } },
      service: { select: { name: true, code: true, address: true, suburb: true, state: true, orientationVideoUrl: true } },
    },
    orderBy: { scheduledFor: "asc" },
    take: 50, // Process in batches
  });

  if (pendingSteps.length === 0) {
    return NextResponse.json({ sent: 0, skipped: 0, failed: 0 });
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const step of pendingSteps) {
    // Skip unsubscribed contacts
    if (!step.contact.subscribed) {
      await prisma.parentNurtureStep.update({
        where: { id: step.id },
        data: { status: "cancelled" },
      });
      skipped++;
      continue;
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
        failed++;
        continue;
      }
      ({ subject, html } = templateFn(firstName, centreName));
    }

    try {
      const result = await resend.emails.send({
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

      sent++;
    } catch (err) {
      console.error(`[nurture-send] Failed to send step ${step.id}:`, err);

      await prisma.parentNurtureStep.update({
        where: { id: step.id },
        data: { status: "failed" },
      });

      await prisma.deliveryLog.create({
        data: {
          channel: "email",
          serviceCode: step.service.code,
          messageType: "nurture_sequence",
          recipientCount: 1,
          status: "failed",
          errorMessage: err instanceof Error ? err.message : String(err),
        },
      });

      failed++;
    }
  }

  // ── Also process SequenceStepExecution records (new system) ──
  const seqResult = await processSequenceExecutions(resend, now);

  return NextResponse.json({
    sent: sent + seqResult.sent,
    skipped: skipped + seqResult.skipped,
    failed: failed + seqResult.failed,
    legacy: { sent, skipped, failed },
    sequences: seqResult,
  });
}

/**
 * Process pending SequenceStepExecution records for both parent nurture
 * and CRM outreach sequences.
 */
async function processSequenceExecutions(
  resend: ReturnType<typeof getResend>,
  now: Date,
) {
  if (!resend) return { sent: 0, skipped: 0, failed: 0 };

  const pending = await prisma.sequenceStepExecution.findMany({
    where: {
      status: "pending",
      scheduledFor: { lte: now },
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

  for (const exec of pending) {
    const isParent = exec.step.sequence.type === "parent_nurture";
    const email = isParent
      ? exec.enrolment.contact?.email
      : exec.enrolment.lead?.contactEmail;

    if (!email) {
      await prisma.sequenceStepExecution.update({
        where: { id: exec.id },
        data: { status: "cancelled", error: "No email address" },
      });
      skipped++;
      continue;
    }

    // Check subscription for parent contacts
    if (isParent && exec.enrolment.contact && !exec.enrolment.contact.subscribed) {
      await prisma.sequenceStepExecution.update({
        where: { id: exec.id },
        data: { status: "cancelled", error: "Unsubscribed" },
      });
      skipped++;
      continue;
    }

    let subject: string;
    let html: string;

    // Try visual template first, fall back to hardcoded TEMPLATE_MAP
    if (exec.step.emailTemplate?.blocks) {
      const { renderBlocksToHtml } = await import("@/lib/email-marketing-layout");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const blocks = exec.step.emailTemplate.blocks as any;
      const name = isParent
        ? exec.enrolment.contact?.firstName || "Parent"
        : exec.enrolment.lead?.contactName || exec.enrolment.lead?.schoolName || "there";
      html = renderBlocksToHtml(blocks, { firstName: name, parentName: name, contactName: name, schoolName: exec.enrolment.lead?.schoolName || "", centreName: "" });
      subject = exec.step.emailTemplate.subject || exec.step.name;
    } else if (exec.step.emailTemplate?.htmlContent) {
      const { marketingLayout } = await import("@/lib/email-marketing-layout");
      html = marketingLayout(exec.step.emailTemplate.htmlContent);
      subject = exec.step.emailTemplate.subject || exec.step.name;
    } else {
      // Fall back to hardcoded template
      const templateFn = TEMPLATE_MAP[exec.step.templateKey];
      if (!templateFn) {
        // For CRM steps without templates, generate a basic email
        subject = exec.step.name;
        const { marketingLayout } = await import("@/lib/email-marketing-layout");
        html = marketingLayout(`<p style="margin:0;color:#374151;font-size:15px;line-height:1.6;">${exec.step.name} — this email template has not been configured yet.</p>`);
      } else {
        const name = isParent
          ? exec.enrolment.contact?.firstName || "Parent"
          : exec.enrolment.lead?.contactName || "there";
        ({ subject, html } = templateFn(name, exec.enrolment.sequence.name));
      }
    }

    try {
      await resend.emails.send({
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

      sent++;
    } catch (err) {
      console.error(`[nurture-send] Sequence exec ${exec.id} failed:`, err);
      await prisma.sequenceStepExecution.update({
        where: { id: exec.id },
        data: { status: "failed", error: err instanceof Error ? err.message : String(err) },
      });
      failed++;
    }
  }

  // Mark completed enrolments
  const activeEnrolments = [...new Set(pending.map((e) => e.enrolmentId))];
  for (const enrolmentId of activeEnrolments) {
    const remaining = await prisma.sequenceStepExecution.count({
      where: { enrolmentId, status: "pending" },
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
