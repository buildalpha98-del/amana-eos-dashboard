import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { acquireCronLock } from "@/lib/cron-guard";
import { getResend, FROM_EMAIL } from "@/lib/email";
import { applyMergeTags } from "@/lib/crm/merge-tags";
import type { PipelineStage } from "@prisma/client";

/**
 * GET /api/cron/touchpoint-scheduler
 *
 * Hourly cron — finds leads with nextTouchpointAt <= now, sends the
 * auto-email for the next pipeline stage, advances the stage, and
 * recalculates the next touchpoint time.
 *
 * Auth: Bearer CRON_SECRET
 */

// Stage delay map (in milliseconds) — how long after entering a stage
// before the next auto touchpoint fires
const STAGE_DELAYS: Partial<Record<PipelineStage, { nextStage: PipelineStage; delayMs: number }>> = {
  contact_made: { nextStage: "follow_up_1", delayMs: 72 * 3600 * 1000 },   // 3 days
  follow_up_1: { nextStage: "follow_up_2", delayMs: 120 * 3600 * 1000 },   // 5 days
  follow_up_2: { nextStage: "meeting_booked", delayMs: 168 * 3600 * 1000 }, // 7 days
  proposal_sent: { nextStage: "submitted", delayMs: 72 * 3600 * 1000 },     // 3 days check-in
};

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Use hourly lock — we use "daily" period since acquireCronLock generates
  // date-based keys. For hourly, we create a custom period key.
  const now = new Date();
  const hourKey = `${now.toISOString().split("T")[0]}-H${String(now.getUTCHours()).padStart(2, "0")}`;

  // Manual lock check to allow hourly runs
  const existingRun = await prisma.cronRun.findUnique({
    where: { cronName_period: { cronName: "touchpoint-scheduler", period: hourKey } },
  });

  if (existingRun && existingRun.status === "completed") {
    return NextResponse.json({
      message: `Touchpoint scheduler already completed for ${hourKey}`,
      skipped: true,
    });
  }

  // Create or overwrite stale lock
  if (existingRun) {
    const elapsed = Date.now() - existingRun.startedAt.getTime();
    if (existingRun.status === "running" && elapsed < 10 * 60 * 1000) {
      return NextResponse.json({
        message: `Touchpoint scheduler already running for ${hourKey}`,
        skipped: true,
      });
    }
    await prisma.cronRun.delete({
      where: { cronName_period: { cronName: "touchpoint-scheduler", period: hourKey } },
    });
  }

  const cronRun = await prisma.cronRun.create({
    data: { cronName: "touchpoint-scheduler", period: hourKey, status: "running" },
  });

  try {
    // Find leads due for next touchpoint
    const dueLeads = await prisma.lead.findMany({
      where: {
        deleted: false,
        nextTouchpointAt: { lte: now },
        pipelineStage: {
          notIn: ["won", "lost", "on_hold", "new_lead", "reviewing"],
        },
      },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
      },
    });

    const resend = getResend();
    let emailsSent = 0;
    let stagesAdvanced = 0;
    const errors: string[] = [];

    for (const lead of dueLeads) {
      try {
        const stageConfig = STAGE_DELAYS[lead.pipelineStage];

        // Find matching email template for the current stage
        const template = await prisma.crmEmailTemplate.findFirst({
          where: {
            triggerStage: lead.pipelineStage,
            OR: [
              { pipeline: lead.source },
              { pipeline: null },
            ],
          },
          orderBy: { sortOrder: "asc" },
        });

        // Send auto-email if template found and lead has contact email
        if (template && lead.contactEmail) {
          const mergeData: Record<string, string> = {
            schoolName: lead.schoolName,
            contactName: lead.contactName || "there",
            senderName: lead.assignedTo?.name || "Amana OSHC Team",
            companyName: "Amana OSHC",
          };

          const subject = applyMergeTags(template.subject, mergeData);
          const body = applyMergeTags(template.body, mergeData);

          if (resend) {
            try {
              await resend.emails.send({
                from: FROM_EMAIL,
                to: lead.contactEmail,
                subject,
                html: `<div style="font-family: sans-serif; line-height: 1.6;">${body.replace(/\n/g, "<br>")}</div>`,
              });
              emailsSent++;
            } catch (emailErr) {
              errors.push(
                `Email failed for ${lead.schoolName}: ${emailErr instanceof Error ? emailErr.message : "Unknown"}`
              );
            }
          } else {
            if (process.env.NODE_ENV !== "production") console.log(`[TouchpointScheduler] Would send email to ${lead.contactEmail}: ${subject}`);
            emailsSent++;
          }

          // Log the touchpoint
          await prisma.touchpointLog.create({
            data: {
              leadId: lead.id,
              type: "auto_email",
              subject,
              body,
              sentById: lead.assignedToId,
            },
          });
        }

        // Advance stage if we have a next stage mapping
        if (stageConfig) {
          const newNextTouchpoint = STAGE_DELAYS[stageConfig.nextStage]
            ? new Date(Date.now() + (STAGE_DELAYS[stageConfig.nextStage]?.delayMs || 0))
            : null;

          await prisma.lead.update({
            where: { id: lead.id },
            data: {
              pipelineStage: stageConfig.nextStage,
              stageChangedAt: now,
              nextTouchpointAt: newNextTouchpoint,
            },
          });

          // Log stage change
          await prisma.touchpointLog.create({
            data: {
              leadId: lead.id,
              type: "stage_change",
              subject: `Auto-advanced to ${stageConfig.nextStage.replace(/_/g, " ")}`,
            },
          });

          stagesAdvanced++;
        } else {
          // No next stage — clear the touchpoint timer
          await prisma.lead.update({
            where: { id: lead.id },
            data: { nextTouchpointAt: null },
          });
        }
      } catch (leadErr) {
        errors.push(
          `Lead ${lead.schoolName} failed: ${leadErr instanceof Error ? leadErr.message : "Unknown"}`
        );
      }
    }

    await prisma.cronRun.update({
      where: { id: cronRun.id },
      data: {
        status: "completed",
        completedAt: new Date(),
        details: { dueLeads: dueLeads.length, emailsSent, stagesAdvanced } as object,
      },
    });

    return NextResponse.json({
      message: "Touchpoint scheduler completed",
      dueLeads: dueLeads.length,
      emailsSent,
      stagesAdvanced,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    await prisma.cronRun.update({
      where: { id: cronRun.id },
      data: {
        status: "failed",
        completedAt: new Date(),
        details: { error: err instanceof Error ? err.message : String(err) } as object,
      },
    });

    console.error("[TouchpointScheduler] Cron failed:", err);

    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron failed" },
      { status: 500 }
    );
  }
}
