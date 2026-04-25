import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { acquireCronLock, verifyCronSecret } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import {
  detectTwoWeekConcerns,
  formatIsoDate,
  getYesterdayCheckDate,
  isWeekday,
} from "@/lib/whatsapp-compliance";

export const GET = withApiHandler(async (req) => {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;

  const guard = await acquireCronLock("whatsapp-compliance-reminder", "daily");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const now = new Date();

    if (!isWeekday(now)) {
      await guard.complete({ skipped: true, reason: "weekend" });
      return NextResponse.json({ skipped: true, reason: "weekend" });
    }

    const yesterday = getYesterdayCheckDate(now);
    const yesterdayIso = formatIsoDate(yesterday);

    const services = await prisma.service.findMany({
      where: { status: "active" },
      select: { id: true },
    });

    const records = await prisma.whatsAppCoordinatorPost.findMany({
      where: { postedDate: yesterday, serviceId: { in: services.map((s) => s.id) } },
      select: { serviceId: true },
    });
    const recordedServiceIds = new Set(records.map((r) => r.serviceId));
    const missingCount = services.length - recordedServiceIds.size;

    let remindersCreated = 0;
    if (missingCount > 0) {
      const existingReminder = await prisma.aiTaskDraft.findFirst({
        where: {
          source: "whatsapp-compliance",
          targetId: yesterdayIso,
          status: "ready",
        },
        select: { id: true },
      });
      if (!existingReminder) {
        await prisma.aiTaskDraft.create({
          data: {
            source: "whatsapp-compliance",
            targetId: yesterdayIso,
            taskType: "admin",
            title: `Check yesterday's WhatsApp groups (${yesterdayIso}) — ${missingCount} centres unchecked`,
            content: `Akram, please review the parents' WhatsApp groups for the ${missingCount} centres still unchecked from ${yesterdayIso}. Open the compliance dashboard to log them.`,
            metadata: {
              kind: "daily_reminder",
              date: yesterdayIso,
              missingCount,
              link: "/communication/whatsapp-compliance?focus=yesterday",
            },
            status: "ready",
            model: "system",
          },
        });
        remindersCreated = 1;
      }
    }

    const concerns = await detectTwoWeekConcerns({ now });
    let patternsCreated = 0;
    for (const concern of concerns) {
      const existingPattern = await prisma.aiTaskDraft.findFirst({
        where: {
          source: "whatsapp-compliance",
          targetId: concern.serviceId,
          status: "ready",
          metadata: { path: ["kind"], equals: "two_week_pattern" },
        },
        select: { id: true },
      });
      if (existingPattern) continue;

      await prisma.aiTaskDraft.create({
        data: {
          source: "whatsapp-compliance",
          targetId: concern.serviceId,
          taskType: "admin",
          title: `Two-week WhatsApp pattern: ${concern.coordinatorName ?? "coordinator"} at ${concern.serviceName} — flag for Monday 1:1`,
          content: `${concern.serviceName} is below the weekly floor for two consecutive weeks. This week: ${concern.thisWeekPosted}/5 posted. Last week: ${concern.lastWeekPosted}/5 posted. Open the compliance dashboard to flag the coordinator or schedule a 1:1.`,
          metadata: {
            kind: "two_week_pattern",
            serviceId: concern.serviceId,
            serviceName: concern.serviceName,
            coordinatorName: concern.coordinatorName,
            thisWeekPosted: concern.thisWeekPosted,
            lastWeekPosted: concern.lastWeekPosted,
            link: `/communication/whatsapp-compliance?service=${concern.serviceId}`,
          },
          status: "ready",
          model: "system",
        },
      });
      patternsCreated++;
    }

    await guard.complete({ remindersCreated, patternsCreated, missingCount });
    return NextResponse.json({
      message: "WhatsApp compliance reminder cron complete",
      yesterday: yesterdayIso,
      missingCount,
      remindersCreated,
      patternsCreated,
    });
  } catch (err) {
    logger.error("whatsapp-compliance-reminder failed", { err });
    await guard.fail(err);
    throw err;
  }
});
