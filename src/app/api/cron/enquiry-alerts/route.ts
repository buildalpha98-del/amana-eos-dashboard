import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCronSecret } from "@/lib/cron-guard";

const STUCK_STAGES = ["new_enquiry", "info_sent", "nurturing", "form_started"];
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const summary = { stuck: 0, formAbandonment: 0, atRisk: 0, retention: 0, total: 0 };

  // ── a) STUCK: enquiries in early stages for > 2 days ───────────
  const stuckEnquiries = await prisma.parentEnquiry.findMany({
    where: {
      deleted: false,
      stage: { in: STUCK_STAGES },
      stageChangedAt: { lt: new Date(now.getTime() - 2 * MS_PER_DAY) },
    },
    include: {
      service: { select: { id: true, name: true } },
    },
  });

  for (const eq of stuckEnquiries) {
    const daysInStage = Math.floor((now.getTime() - new Date(eq.stageChangedAt).getTime()) / MS_PER_DAY);
    const priority = daysInStage > 4 ? "high" : "high"; // both urgent/high map to "high"

    await createAlertTask({
      title: `STUCK: ${eq.parentName} at ${eq.service.name} – ${daysInStage} days in ${eq.stage.replace("_", " ")}`,
      serviceId: eq.serviceId,
      priority,
      dueDate: today,
    });
    summary.stuck++;
  }

  // ── b) FORM ABANDONMENT: formStarted=true, not completed, > 3 days ──
  const formAbandoned = await prisma.parentEnquiry.findMany({
    where: {
      deleted: false,
      formStarted: true,
      formCompleted: false,
      stageChangedAt: { lt: new Date(now.getTime() - 3 * MS_PER_DAY) },
    },
    include: {
      service: { select: { id: true, name: true } },
    },
  });

  for (const eq of formAbandoned) {
    await createAlertTask({
      title: `FORM ABANDONED: ${eq.parentName} at ${eq.service.name} – started but not completed`,
      serviceId: eq.serviceId,
      priority: "high",
      dueDate: today,
    });
    summary.formAbandonment++;
  }

  // ── c) AT RISK: enrolled/first_session with no touchpoint in 7 days ──
  const atRiskEnquiries = await prisma.parentEnquiry.findMany({
    where: {
      deleted: false,
      stage: { in: ["enrolled", "first_session"] },
    },
    include: {
      service: { select: { id: true, name: true } },
      touchpoints: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
    },
  });

  const sevenDaysAgo = new Date(now.getTime() - 7 * MS_PER_DAY);

  for (const eq of atRiskEnquiries) {
    const lastTouchpoint = eq.touchpoints[0]?.createdAt;
    if (!lastTouchpoint || new Date(lastTouchpoint) < sevenDaysAgo) {
      await createAlertTask({
        title: `AT RISK: ${eq.parentName} at ${eq.service.name} – no contact in 7+ days`,
        serviceId: eq.serviceId,
        priority: "high",
        dueDate: today,
      });
      summary.atRisk++;
    }
  }

  // ── d) RETENTION: attendance dropped > 20% week-on-week ──
  const services = await prisma.service.findMany({
    where: { status: "active" },
    select: { id: true, name: true },
  });

  const lastWeekStart = new Date(now.getTime() - 14 * MS_PER_DAY);
  const lastWeekEnd = new Date(now.getTime() - 7 * MS_PER_DAY);

  for (const svc of services) {
    const [prevWeek, currentWeek] = await Promise.all([
      prisma.dailyAttendance.aggregate({
        where: {
          serviceId: svc.id,
          date: { gte: lastWeekStart, lt: lastWeekEnd },
        },
        _sum: { attended: true },
      }),
      prisma.dailyAttendance.aggregate({
        where: {
          serviceId: svc.id,
          date: { gte: lastWeekEnd, lt: now },
        },
        _sum: { attended: true },
      }),
    ]);

    const prev = prevWeek._sum.attended ?? 0;
    const curr = currentWeek._sum.attended ?? 0;

    if (prev > 0 && curr < prev * 0.8) {
      const dropPercent = Math.round(((prev - curr) / prev) * 100);
      await createAlertTask({
        title: `RETENTION: ${svc.name} attendance dropped ${dropPercent}% week-on-week`,
        serviceId: svc.id,
        priority: "high",
        dueDate: today,
      });
      summary.retention++;
    }
  }

  summary.total = summary.stuck + summary.formAbandonment + summary.atRisk + summary.retention;

  if (process.env.NODE_ENV !== "production") console.log("[enquiry-alerts]", JSON.stringify(summary));

  return NextResponse.json({
    ok: true,
    summary,
  });
}

async function createAlertTask({
  title,
  serviceId,
  priority,
  dueDate,
}: {
  title: string;
  serviceId: string;
  priority: string;
  dueDate: Date;
}) {
  // Avoid duplicate tasks with the same title created today
  const existing = await prisma.marketingTask.findFirst({
    where: {
      title,
      createdAt: { gte: dueDate },
      deleted: false,
    },
  });

  if (existing) return;

  await prisma.marketingTask.create({
    data: {
      title,
      serviceId,
      priority: priority as any,
      status: "todo",
      dueDate,
    },
  });
}
