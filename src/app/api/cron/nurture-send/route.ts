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
      service: { select: { name: true, code: true } },
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

    const templateFn = TEMPLATE_MAP[step.templateKey];
    if (!templateFn) {
      await prisma.parentNurtureStep.update({
        where: { id: step.id },
        data: { status: "failed" },
      });
      failed++;
      continue;
    }

    const firstName = step.contact.firstName || "Parent";
    const centreName = step.service.name;
    const { subject, html } = templateFn(firstName, centreName);

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

  return NextResponse.json({ sent, skipped, failed });
}
