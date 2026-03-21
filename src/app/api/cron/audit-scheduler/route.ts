import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { acquireCronLock, verifyCronSecret } from "@/lib/cron-guard";

/**
 * GET /api/cron/audit-scheduler
 *
 * Monthly cron (1st of month, 5 AM AEST / 19:00 UTC prev day) — schedules
 * audit instances for the current month based on active templates.
 */
export async function GET(req: NextRequest) {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;

  const guard = await acquireCronLock("audit-scheduler", "monthly");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const now = new Date();
    const currentMonth = now.getMonth() + 1; // 1-12
    const currentYear = now.getFullYear();

    // Find templates scheduled for this month
    const templates = await prisma.auditTemplate.findMany({
      where: {
        isActive: true,
        scheduledMonths: { has: currentMonth },
      },
      include: {
        items: { select: { id: true }, orderBy: { sortOrder: "asc" } },
      },
    });

    if (templates.length === 0) {
      await guard.complete({ created: 0, month: currentMonth });
      return NextResponse.json({
        message: "No audits scheduled this month",
        month: currentMonth,
        year: currentYear,
      });
    }

    // Get all active services
    const services = await prisma.service.findMany({
      where: { status: "active" },
      select: { id: true, name: true, code: true, managerId: true },
    });

    // Due date = last day of current month
    const dueDate = new Date(currentYear, currentMonth, 0); // day 0 of next month = last day
    dueDate.setHours(23, 59, 59, 999);

    let created = 0;
    let skipped = 0;

    // Wrap all creates in a transaction so AuditInstance + CoworkTodo are atomic.
    // If CoworkTodo creation fails, AuditInstance is rolled back too (no orphans).
    await prisma.$transaction(async (tx) => {
      for (const template of templates) {
        for (const service of services) {
          // Upsert audit instance (idempotent)
          const existing = await tx.auditInstance.findUnique({
            where: {
              templateId_serviceId_scheduledMonth_scheduledYear: {
                templateId: template.id,
                serviceId: service.id,
                scheduledMonth: currentMonth,
                scheduledYear: currentYear,
              },
            },
          });

          if (existing) {
            skipped++;
            continue;
          }

          // Create instance + pre-create response records
          await tx.auditInstance.create({
            data: {
              templateId: template.id,
              serviceId: service.id,
              scheduledMonth: currentMonth,
              scheduledYear: currentYear,
              dueDate,
              status: "scheduled",
              totalItems: template.items.length,
              responses: {
                create: template.items.map((item) => ({
                  templateItemId: item.id,
                  result: "not_answered",
                })),
              },
            },
          });

          created++;

          // Create CoworkTodo for centre coordinator
          if (service.managerId) {
            const dueDateStr = dueDate.toLocaleDateString("en-AU", {
              day: "numeric",
              month: "short",
            });
            await tx.coworkTodo.create({
              data: {
                centreId: service.id,
                date: new Date(),
                title: `Complete ${template.name} — due ${dueDateStr}`,
                description: `NQS QA${template.qualityArea} audit scheduled for this month. ${template.items.length} checklist items.`,
                category: "morning-prep",
                assignedRole: "coordinator",
              },
            });
          }
        }
      }

      // Create summary announcement inside the transaction
      if (created > 0) {
        const serviceIds = services.map((s) => s.id);
        const monthName = new Date(currentYear, currentMonth - 1).toLocaleString("en-AU", { month: "long" });
        await tx.coworkAnnouncement.create({
          data: {
            title: `${monthName} Compliance Audits Scheduled`,
            body: `${templates.length} audit${templates.length === 1 ? "" : "s"} have been scheduled for ${monthName} ${currentYear} across ${services.length} centres. ${created} audit instances created. Please complete them by end of month.`,
            type: "reminder",
            targetCentres: serviceIds,
          },
        });
      }
    });

    await guard.complete({
      month: currentMonth,
      year: currentYear,
      templates: templates.length,
      services: services.length,
      created,
      skipped,
    });

    return NextResponse.json({
      message: "Audit scheduling complete",
      month: currentMonth,
      year: currentYear,
      templatesScheduled: templates.length,
      servicesProcessed: services.length,
      instancesCreated: created,
      instancesSkipped: skipped,
    });
  } catch (err) {
    await guard.fail(err);
    console.error("Audit scheduler cron failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron failed" },
      { status: 500 }
    );
  }
}
