/**
 * GET /api/cron/vapi-sla-monitor
 *
 * Hourly cron that escalates unactioned urgent/critical VAPI calls.
 *
 * SLA thresholds:
 *  - critical urgency (safeguarding): escalate after 1 hour
 *  - urgent urgency: escalate after 4 hours
 *  - routine: no SLA tracking
 *
 * A call is considered "unactioned" when status is "new" or "in_progress".
 * Once escalated, we stamp `slaAlertedAt` to prevent duplicate alerts.
 *
 * Auth: Bearer CRON_SECRET
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { acquireCronLock } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { sendEmail } from "@/lib/email";
import { baseLayout } from "@/lib/email-templates/base";
import { sendTeamsNotification } from "@/lib/teams-notify";
import { logger } from "@/lib/logger";
import { findCoordinatorEmail } from "@/lib/vapi/centre-resolver";

const CRITICAL_SLA_MS = 60 * 60 * 1000; // 1 hour
const URGENT_SLA_MS = 4 * 60 * 60 * 1000; // 4 hours

const CALL_TYPE_LABELS: Record<string, string> = {
  new_enquiry: "New Enquiry",
  booking_change: "Booking Change",
  billing_issue: "Billing Issue",
  escalation: "Escalation",
  holiday_quest: "Holiday Quest",
  general_message: "General Message",
};

async function sendEscalationEmail(call: {
  id: string;
  parentName: string | null;
  parentPhone: string | null;
  centreName: string | null;
  callType: string;
  urgency: string;
  calledAt: Date;
  summary: string | null;
}): Promise<void> {
  const recipients = new Set<string>();
  // Head office escalation recipients — always include leadership on critical.
  if (call.urgency === "critical") {
    recipients.add("akram@amanaoshc.com.au");
    recipients.add("jayden@amanaoshc.com.au");
  } else {
    recipients.add("akram@amanaoshc.com.au");
  }
  const coordinator = findCoordinatorEmail(call.centreName);
  if (coordinator) recipients.add(coordinator);

  const baseUrl = process.env.NEXTAUTH_URL || "https://amanaoshc.company";
  const callTypeLabel = CALL_TYPE_LABELS[call.callType] ?? call.callType;
  const minutesSinceCall = Math.floor((Date.now() - call.calledAt.getTime()) / 60000);
  const urgencyColor = call.urgency === "critical" ? "#dc2626" : "#d97706";

  const subject = `[SLA BREACH] ${call.urgency.toUpperCase()} call unactioned for ${minutesSinceCall}min — ${call.parentName ?? "Unknown"}`;

  const html = baseLayout(`
    <div style="margin-bottom:16px;padding:12px 16px;background-color:${urgencyColor}10;border-left:4px solid ${urgencyColor};border-radius:4px;">
      <p style="margin:0;font-size:14px;font-weight:600;color:${urgencyColor};">
        SLA BREACH — ${call.urgency.toUpperCase()} call unactioned for ${minutesSinceCall} minutes
      </p>
    </div>

    <h2 style="margin:0 0 16px;color:#111827;font-size:18px;">Action required</h2>

    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      <tr><td style="padding:6px 12px 6px 0;color:#6b7280;font-size:14px;">Caller</td><td style="padding:6px 0;color:#111827;font-size:14px;font-weight:500;">${call.parentName ?? "Unknown"}</td></tr>
      ${call.parentPhone ? `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;font-size:14px;">Phone</td><td style="padding:6px 0;color:#111827;font-size:14px;"><a href="tel:${call.parentPhone}" style="color:#004E64;">${call.parentPhone}</a></td></tr>` : ""}
      <tr><td style="padding:6px 12px 6px 0;color:#6b7280;font-size:14px;">Centre</td><td style="padding:6px 0;color:#111827;font-size:14px;">${call.centreName ?? "Unknown"}</td></tr>
      <tr><td style="padding:6px 12px 6px 0;color:#6b7280;font-size:14px;">Call type</td><td style="padding:6px 0;color:#111827;font-size:14px;">${callTypeLabel}</td></tr>
      <tr><td style="padding:6px 12px 6px 0;color:#6b7280;font-size:14px;">Urgency</td><td style="padding:6px 0;color:${urgencyColor};font-size:14px;font-weight:600;">${call.urgency.toUpperCase()}</td></tr>
      <tr><td style="padding:6px 12px 6px 0;color:#6b7280;font-size:14px;">Called</td><td style="padding:6px 0;color:#111827;font-size:14px;">${minutesSinceCall} minutes ago</td></tr>
    </table>

    ${call.summary ? `<h3 style="margin:0 0 8px;color:#374151;font-size:14px;">Summary</h3><p style="margin:0 0 16px;color:#111827;font-size:14px;line-height:1.6;">${call.summary}</p>` : ""}

    <div style="margin-top:24px;text-align:center;">
      <a href="${baseUrl}/contact-centre?tab=calls&id=${call.id}"
         style="display:inline-block;padding:12px 32px;background-color:${urgencyColor};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;border-radius:8px;">
        Action in Contact Centre
      </a>
    </div>
  `);

  await sendEmail({ to: Array.from(recipients), subject, html });
}

export const GET = withApiHandler(async (req) => {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const guard = await acquireCronLock("vapi-sla-monitor", "hourly");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const now = new Date();
    const criticalThreshold = new Date(now.getTime() - CRITICAL_SLA_MS);
    const urgentThreshold = new Date(now.getTime() - URGENT_SLA_MS);

    const breaches = await prisma.vapiCall.findMany({
      where: {
        status: { in: ["new", "in_progress"] },
        slaAlertedAt: null,
        OR: [
          { urgency: "critical", calledAt: { lt: criticalThreshold } },
          { urgency: "urgent", calledAt: { lt: urgentThreshold } },
        ],
      },
      orderBy: { calledAt: "asc" },
      take: 50, // Safety cap
    });

    const results: { emails: number; teams: number; errors: number } = { emails: 0, teams: 0, errors: 0 };

    for (const call of breaches) {
      try {
        await sendEscalationEmail(call);
        results.emails += 1;
      } catch (err) {
        results.errors += 1;
        logger.error("VAPI SLA: escalation email failed", { callId: call.id, error: err });
      }

      try {
        const baseUrl = process.env.NEXTAUTH_URL || "https://amanaoshc.company";
        const minutesSinceCall = Math.floor((now.getTime() - call.calledAt.getTime()) / 60000);
        await sendTeamsNotification({
          title: `SLA BREACH — ${call.urgency.toUpperCase()} call unactioned`,
          body: `${call.parentName ?? "Unknown caller"} at ${call.centreName ?? "unknown centre"} — ${minutesSinceCall} minutes since call, still ${call.status.replace("_", " ")}.`,
          accentColor: call.urgency === "critical" ? "#dc2626" : "#d97706",
          facts: [
            { title: "Call type", value: CALL_TYPE_LABELS[call.callType] ?? call.callType },
            { title: "Urgency", value: call.urgency.toUpperCase() },
            { title: "Minutes since call", value: `${minutesSinceCall}` },
          ],
          actions: [
            { type: "Action.OpenUrl", title: "Open call", url: `${baseUrl}/contact-centre?tab=calls&id=${call.id}` },
          ],
        });
        results.teams += 1;
      } catch (err) {
        logger.error("VAPI SLA: teams notification failed", { callId: call.id, error: err });
      }

      // Stamp alerted-at so we don't re-alert on the next run.
      await prisma.vapiCall.update({
        where: { id: call.id },
        data: { slaAlertedAt: new Date() },
      });
    }

    await guard.complete({
      breaches: breaches.length,
      emails: results.emails,
      teams: results.teams,
      errors: results.errors,
    });

    return NextResponse.json({
      message: "SLA monitor complete",
      breaches: breaches.length,
      ...results,
    });
  } catch (err) {
    await guard.fail(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron failed" },
      { status: 500 },
    );
  }
});
