import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { acquireCronLock, verifyCronSecret } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";

/**
 * GET /api/cron/audit-followup
 *
 * Daily cron — creates follow-up CoworkTodos from completed audits
 * with non-compliant items, and flags low-scoring audits.
 */
export const GET = withApiHandler(async (req) => {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;

  const guard = await acquireCronLock("audit-followup", "daily");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    // Find audits completed in last 24h that haven't been reviewed
    const recentAudits = await prisma.auditInstance.findMany({
      where: {
        status: "completed",
        completedAt: { gte: yesterday },
        reviewedAt: null,
      },
      include: {
        template: { select: { name: true, qualityArea: true, responseFormat: true } },
        service: { select: { id: true, name: true, code: true } },
        responses: {
          where: {
            OR: [
              { result: "no", actionRequired: { not: null } },
              { ratingValue: { lte: 3 }, actionRequired: { not: null } },
            ],
          },
          include: {
            templateItem: { select: { question: true, section: true } },
          },
        },
      },
    });

    let todosCreated = 0;
    let urgentAlerts = 0;

    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    for (const audit of recentAudits) {
      // Create follow-up todos for non-compliant items
      for (const response of audit.responses) {
        if (!response.actionRequired) continue;

        await prisma.coworkTodo.create({
          data: {
            centreId: audit.service.id,
            date: new Date(),
            title: `Audit Action: ${response.templateItem.question.substring(0, 80)}`,
            description: `From ${audit.template.name} (QA${audit.template.qualityArea})\nAction: ${response.actionRequired}\nDue within 7 days.`,
            category: "morning-prep",
            assignedRole: "coordinator",
          },
        });
        todosCreated++;
      }

      // Create urgent announcement for low-scoring audits
      if (audit.complianceScore != null && audit.complianceScore < 80) {
        await prisma.coworkAnnouncement.create({
          data: {
            title: `Low Compliance Score: ${audit.template.name}`,
            body: `${audit.service.name} scored ${audit.complianceScore.toFixed(1)}% on the ${audit.template.name} (QA${audit.template.qualityArea}). ${audit.responses.length} action items require follow-up. Please review and address immediately.`,
            type: "reminder",
            targetCentres: [audit.service.id],
            pinned: true,
          },
        });
        urgentAlerts++;
      }
    }

    await guard.complete({
      auditsProcessed: recentAudits.length,
      todosCreated,
      urgentAlerts,
    });

    return NextResponse.json({
      message: "Audit follow-up complete",
      auditsProcessed: recentAudits.length,
      todosCreated,
      urgentAlerts,
    });
  } catch (err) {
    await guard.fail(err);
    throw err;
  }
});
