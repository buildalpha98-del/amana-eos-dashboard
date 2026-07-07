import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCronSecret } from "@/lib/cron-guard";
import { getResend, sendEmail } from "@/lib/email";
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
  retentionCasualReengageEmail,
  retentionDayChangeReminderEmail,
  retentionWithdrawalInterceptEmail,
  nurtureFormAbandonmentEmail,
} from "@/lib/email-templates";
import { appendUnsubscribeFooter } from "@/lib/email-templates/base";
import { withApiHandler } from "@/lib/api-handler";
import { acquireCronLock } from "@/lib/cron-guard";
import { logger } from "@/lib/logger";
import { sendSms } from "@/lib/sms";

/**
 * POST /api/cron/nurture-send — send due nurture / outreach emails.
 *
 * Runs every 2 hours during business hours. The parent nurture sequence and
 * CRM outreach are both driven by the DB-defined Sequence system
 * (SequenceStepExecution rows). The legacy ParentNurtureStep sender was retired
 * in the 2026-06 cutover — the two systems used to double-send.
 *
 * Idempotency: `acquireCronLock` guards concurrent invocations; each execution
 * is atomically claimed (pending → sending) before send.
 */

/**
 * Templates that also fan out as an SMS in parallel with the email (Amana Way
 * stage 7 — the "morning after" touch is a personal text). Limited to a tiny
 * set; expanding it means adding a corresponding SMS body builder below.
 */
const SMS_AUGMENTED_TEMPLATES = new Set<string>(["day1_checkin"]);

function buildSmsBody(templateKey: string, firstName: string, centreName: string): string | null {
  if (templateKey === "day1_checkin") {
    return (
      `Hi ${firstName}! 👋 We hope ${centreName} felt like home yesterday. ` +
      `If anything came up, just reply to this text — a real human reads them. — Team Amana`
    );
  }
  return null;
}

/**
 * Maps a step's `templateKey` to its hardcoded default template. Used when a
 * SequenceStep has no custom EmailTemplate override. `session_reminder` is
 * handled separately (it needs the service address + orientation video).
 */
const TEMPLATE_MAP: Record<
  string,
  (firstName: string, centreName: string, enrolUrl?: string) =>
    | { subject: string; html: string }
    | Promise<{ subject: string; html: string }>
> = {
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
  casual_reengage: retentionCasualReengageEmail,
  day_change_reminder: retentionDayChangeReminderEmail,
  withdrawal_intercept: retentionWithdrawalInterceptEmail,
  form_abandonment: nurtureFormAbandonmentEmail,
};

const BATCH_SIZE = 15;
/** Failed sends are retried until this many attempts, then marked terminally failed. */
const MAX_SEND_ATTEMPTS = 3;
const BASE_URL = process.env.NEXTAUTH_URL ?? "https://amanaoshc.company";

export const POST = withApiHandler(async (req) => {
  const authResult = verifyCronSecret(req);
  if (authResult) return authResult.error;

  // Idempotency guard — prevent double-sends on concurrent invocations
  const guard = await acquireCronLock("nurture-send", "2hourly");
  if (!guard.acquired) {
    return NextResponse.json({ skipped: true, reason: guard.reason });
  }

  // Fail fast if email isn't configured (sends go through the suppression wrapper).
  if (!getResend()) {
    await guard.fail(new Error("Resend not configured"));
    return NextResponse.json({ error: "Resend not configured" }, { status: 503 });
  }

  try {
    const result = await processSequenceExecutions(new Date());
    await guard.complete(result);
    return NextResponse.json(result);
  } catch (err) {
    await guard.fail(err);
    throw err;
  }
});

/**
 * Process pending SequenceStepExecution records for both parent nurture and
 * CRM outreach sequences, in batches of BATCH_SIZE via Promise.allSettled.
 */
async function processSequenceExecutions(now: Date) {
  // Atomically claim pending executions to prevent double-processing
  await prisma.sequenceStepExecution.updateMany({
    where: { status: "pending", scheduledFor: { lte: now } },
    data: { status: "sending" },
  });

  const pending = await prisma.sequenceStepExecution.findMany({
    where: { status: "sending" },
    include: {
      step: {
        include: {
          emailTemplate: { select: { id: true, subject: true, blocks: true, htmlContent: true } },
          sequence: { select: { type: true } },
        },
      },
      enrolment: {
        include: {
          contact: {
            select: {
              email: true,
              firstName: true,
              subscribed: true,
              mobile: true,
              smsOptIn: true,
              service: {
                select: {
                  name: true,
                  code: true,
                  address: true,
                  suburb: true,
                  state: true,
                  orientationVideoUrl: true,
                },
              },
            },
          },
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

  // Pre-import email layout + branding once
  const { renderBlocksToHtml, marketingLayout } = await import("@/lib/email-marketing-layout");
  const { getEmailBranding } = await import("@/lib/email-branding");
  const branding = await getEmailBranding();
  const layoutOpts = {
    headerText: branding.name,
    footerText: branding.name,
    headerColor: branding.primaryColor,
    footerUrl: branding.websiteUrl,
    footerUrlLabel: branding.websiteUrlLabel,
  };

  /** Process a single SequenceStepExecution. Throws on send failure (handled by the batch loop). */
  async function processSequenceExec(exec: (typeof pending)[number]): Promise<"sent" | "skipped"> {
    const isParent = exec.step.sequence.type === "parent_nurture";
    const contact = exec.enrolment.contact;
    const svc = contact?.service;
    const lead = exec.enrolment.lead;
    const email = isParent ? contact?.email : lead?.contactEmail;

    if (!email) {
      await prisma.sequenceStepExecution.update({
        where: { id: exec.id },
        data: { status: "cancelled", error: "No email address" },
      });
      return "skipped";
    }

    // Honour the unsubscribe flag for parent contacts.
    if (isParent && contact && !contact.subscribed) {
      await prisma.sequenceStepExecution.update({
        where: { id: exec.id },
        data: { status: "cancelled", error: "Unsubscribed" },
      });
      return "skipped";
    }

    const name = isParent
      ? contact?.firstName || "Parent"
      : lead?.contactName || lead?.schoolName || "there";
    // Centre name must be the service name — NOT the sequence name.
    const centreName = isParent ? svc?.name || exec.enrolment.sequence.name : exec.enrolment.sequence.name;

    let subject: string;
    let html: string;

    if (exec.step.emailTemplate?.blocks) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const blocks = exec.step.emailTemplate.blocks as any;
      html = renderBlocksToHtml(blocks, {
        firstName: name,
        parentName: name,
        contactName: name,
        schoolName: lead?.schoolName || "",
        centreName,
      });
      subject = exec.step.emailTemplate.subject || exec.step.name;
    } else if (exec.step.emailTemplate?.htmlContent) {
      html = marketingLayout(exec.step.emailTemplate.htmlContent, layoutOpts);
      subject = exec.step.emailTemplate.subject || exec.step.name;
    } else if (isParent && exec.step.templateKey === "session_reminder") {
      // Dedicated template: needs service address + orientation video.
      const serviceAddress = [svc?.address, svc?.suburb, svc?.state].filter(Boolean).join(", ");
      ({ subject, html } = nurtureSessionReminderEmail(
        name,
        centreName,
        serviceAddress || undefined,
        svc?.orientationVideoUrl || undefined,
      ));
    } else {
      const templateFn = TEMPLATE_MAP[exec.step.templateKey];
      if (!templateFn) {
        // No template configured — log loudly rather than silently shipping a stub.
        logger.error("nurture-send: no template for key", {
          execId: exec.id,
          templateKey: exec.step.templateKey,
        });
        subject = exec.step.name;
        html = marketingLayout(
          `<p style="margin:0;color:#374151;font-size:15px;line-height:1.6;">${exec.step.name} — this email template has not been configured yet.</p>`,
          layoutOpts,
        );
      } else {
        // Prefilled per-enquiry enrolment link: the parent's details carry
        // over and submission auto-advances their pipeline card to enrolled.
        const enrolUrl = isParent && exec.enrolment.enquiryId
          ? `${BASE_URL}/enrol/${exec.enrolment.enquiryId}`
          : `${BASE_URL}/enrol`;
        ({ subject, html } = await templateFn(name, centreName, enrolUrl));
      }
    }

    // Marketing unsubscribe footer for parent emails (Spam Act 2003).
    if (isParent && exec.enrolment.contactId) {
      html = appendUnsubscribeFooter(html, exec.enrolment.contactId, BASE_URL);
    }

    // Suppression-aware send — skips bounced/complained addresses.
    const sendResult = await sendEmail({ to: email, subject, html });
    if (sendResult.sent.length === 0) {
      await prisma.sequenceStepExecution.update({
        where: { id: exec.id },
        data: { status: "cancelled", error: "Suppressed (bounce/complaint)" },
      });
      return "skipped";
    }

    await prisma.sequenceStepExecution.update({
      where: { id: exec.id },
      data: { status: "sent", sentAt: new Date() },
    });
    await prisma.sequenceEnrolment.update({
      where: { id: exec.enrolmentId },
      data: { currentStepNumber: exec.step.stepNumber },
    });

    if (isParent && svc?.code) {
      await prisma.deliveryLog.create({
        data: {
          channel: "email",
          serviceCode: svc.code,
          messageType: "nurture_sequence",
          externalId: sendResult.messageId || null,
          recipientCount: 1,
          status: "sent",
        },
      });
    }

    // ── Optional SMS fan-out for select parent templates (Amana Way stage 7) ──
    if (
      isParent &&
      SMS_AUGMENTED_TEMPLATES.has(exec.step.templateKey) &&
      contact?.smsOptIn &&
      contact?.mobile
    ) {
      const smsBody = buildSmsBody(exec.step.templateKey, name, centreName);
      if (smsBody) {
        try {
          const smsResult = await sendSms({
            to: { number: contact.mobile, contactId: exec.enrolment.contactId ?? undefined },
            body: smsBody,
          });
          await prisma.deliveryLog.create({
            data: {
              channel: "sms",
              serviceCode: svc?.code ?? null,
              messageType: "nurture_sequence",
              externalId: smsResult.ok ? smsResult.messageIds[0] ?? null : null,
              recipientCount: 1,
              status: smsResult.ok ? "sent" : "failed",
              errorMessage: smsResult.ok ? null : smsResult.reason,
            },
          });
        } catch (smsErr) {
          // SMS is an augment, not a replacement — never fail the step on SMS error.
          logger.warn("nurture-send: SMS fan-out failed", {
            execId: exec.id,
            templateKey: exec.step.templateKey,
            err: smsErr,
          });
        }
      }
    }

    // CRM: log the auto-email as a touchpoint.
    if (!isParent && lead) {
      await prisma.touchpointLog.create({
        data: { leadId: exec.enrolment.leadId!, type: "auto_email", subject },
      });
    }

    return "sent";
  }

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(batch.map((exec) => processSequenceExec(exec)));

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      if (result.status === "fulfilled") {
        if (result.value === "sent") sent++;
        else skipped++;
      } else {
        const exec = batch[j];
        logger.error("nurture-send: Sequence exec failed", { execId: exec.id, err: result.reason });
        // Retry up to MAX_SEND_ATTEMPTS, then give up so a poison row can't loop forever.
        const willBe = (exec.attempts ?? 0) + 1;
        const nextStatus = willBe >= MAX_SEND_ATTEMPTS ? "failed" : "pending";
        try {
          await prisma.sequenceStepExecution.update({
            where: { id: exec.id },
            data: {
              status: nextStatus,
              attempts: { increment: 1 },
              error: result.reason instanceof Error ? result.reason.message : String(result.reason),
            },
          });
        } catch (dbErr) {
          logger.error("nurture-send: Failed to record failure for exec", { execId: exec.id, err: dbErr });
        }
        failed++;
      }
    }
  }

  // Mark fully-processed enrolments complete.
  const enrolmentIds = [...new Set(pending.map((e) => e.enrolmentId))];
  for (const enrolmentId of enrolmentIds) {
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
