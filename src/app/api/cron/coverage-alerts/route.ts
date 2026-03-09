import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCronSecret, acquireCronLock } from "@/lib/cron-guard";

// ── Alert thresholds ────────────────────────────────────────
const NO_CONTENT_DAYS = 5;
const WEEKLY_TARGET = 3;
const WEEKLY_WINDOW_DAYS = 7;
const TIER3_OCCUPANCY_THRESHOLD = 25; // percent

// ── Task title key phrases (used for dedup) ─────────────────
const PHRASE_NO_CONTENT = "no content in 5+ days";
const PHRASE_BELOW_TARGET = "posts this week";
const PHRASE_NO_CAMPAIGN = "no active campaign";

interface AlertDetail {
  service: string;
  serviceCode: string;
  alert: "no_content_5_days" | "below_3_weekly" | "no_active_campaign";
  taskCreated: boolean;
  reason?: string;
}

/**
 * GET /api/cron/coverage-alerts
 *
 * Daily cron that checks marketing content coverage per centre and
 * auto-creates marketing tasks when centres go dark.
 *
 * Alert rules:
 * 1. 0 posts in last 5 days → high priority task
 * 2. < 3 posts in last 7 days → medium priority task
 * 3. Tier 3 centre (occupancy < 25%) with 0 active campaigns → medium priority task
 */
export async function GET(req: NextRequest) {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;

  const guard = await acquireCronLock("coverage-alerts", "daily");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const fiveDaysAgo = new Date(now);
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - NO_CONTENT_DAYS);

    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - WEEKLY_WINDOW_DAYS);

    // 1. Fetch all active services
    const services = await prisma.service.findMany({
      where: { status: "active" },
      select: { id: true, name: true, code: true },
    });

    // 2. Find a marketing coordinator to assign tasks to.
    //    Look for the first admin user who is not the owner.
    const assignee = await prisma.user.findFirst({
      where: { role: "admin", active: true },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    const assigneeId = assignee?.id || null;

    // 3. Identify Tier 3 centres (latest occupancy < 25%)
    //    Get the most recent CentreMetrics per service
    const tier3ServiceIds = new Set<string>();
    const latestMetrics = await prisma.centreMetrics.findMany({
      where: {
        serviceId: { in: services.map((s) => s.id) },
      },
      orderBy: { recordedAt: "desc" },
      distinct: ["serviceId"],
      select: {
        serviceId: true,
        bscOccupancy: true,
        ascOccupancy: true,
      },
    });

    for (const m of latestMetrics) {
      // Average of BSC and ASC occupancy; if both are below threshold, it's Tier 3
      const avgOccupancy = (m.bscOccupancy + m.ascOccupancy) / 2;
      if (avgOccupancy < TIER3_OCCUPANCY_THRESHOLD) {
        tier3ServiceIds.add(m.serviceId);
      }
    }

    const details: AlertDetail[] = [];
    let alertsCreated = 0;
    let alertsSkipped = 0;

    // 4. Check each service for coverage gaps
    for (const svc of services) {
      // Count posts in last 5 days and 7 days (via the join table)
      const [postsLast5Days, postsLast7Days, activeCampaigns] = await Promise.all([
        prisma.marketingPostService.count({
          where: {
            serviceId: svc.id,
            post: { deleted: false, createdAt: { gte: fiveDaysAgo } },
          },
        }),
        prisma.marketingPostService.count({
          where: {
            serviceId: svc.id,
            post: { deleted: false, createdAt: { gte: sevenDaysAgo } },
          },
        }),
        prisma.marketingCampaignService.count({
          where: {
            serviceId: svc.id,
            campaign: { deleted: false, status: "active" },
          },
        }),
      ]);

      // ── Rule 1: 0 posts in last 5 days → high priority ──────
      if (postsLast5Days === 0) {
        const created = await maybeCreateTask({
          serviceId: svc.id,
          serviceName: svc.name,
          dedupPhrase: PHRASE_NO_CONTENT,
          title: `⚠️ ${svc.name} has no content in 5+ days — create and schedule 2 posts today`,
          description: `Coverage alert: ${svc.name} (${svc.code}) has had zero marketing posts in the last ${NO_CONTENT_DAYS} days. Please create and schedule at least 2 posts today to maintain consistent presence.`,
          priority: "high",
          dueDate: today,
          assigneeId,
        });

        details.push({
          service: svc.name,
          serviceCode: svc.code,
          alert: "no_content_5_days",
          taskCreated: created,
          ...(!created ? { reason: "existing_task_open" } : {}),
        });

        if (created) alertsCreated++;
        else alertsSkipped++;
      }

      // ── Rule 2: < 3 posts in last 7 days → medium priority ──
      if (postsLast7Days < WEEKLY_TARGET && postsLast5Days > 0) {
        // Only fire this if rule 1 didn't already fire (avoid double-alerting)
        const remaining = WEEKLY_TARGET - postsLast7Days;
        const created = await maybeCreateTask({
          serviceId: svc.id,
          serviceName: svc.name,
          dedupPhrase: PHRASE_BELOW_TARGET,
          title: `${svc.name} only has ${postsLast7Days} posts this week — create ${remaining} more to hit the 3/week target`,
          description: `Coverage alert: ${svc.name} (${svc.code}) has only ${postsLast7Days} post(s) in the last 7 days, below the 3/week target. ${remaining} more post(s) needed.`,
          priority: "medium",
          dueDate: tomorrow,
          assigneeId,
        });

        details.push({
          service: svc.name,
          serviceCode: svc.code,
          alert: "below_3_weekly",
          taskCreated: created,
          ...(!created ? { reason: "existing_task_open" } : {}),
        });

        if (created) alertsCreated++;
        else alertsSkipped++;
      }

      // ── Rule 3: Tier 3 centre with 0 active campaigns → medium priority
      if (tier3ServiceIds.has(svc.id) && activeCampaigns === 0) {
        const created = await maybeCreateTask({
          serviceId: svc.id,
          serviceName: svc.name,
          dedupPhrase: PHRASE_NO_CAMPAIGN,
          title: `${svc.name} has no active campaign — brief CMO for campaign plan`,
          description: `Coverage alert: ${svc.name} (${svc.code}) is a Tier 3 centre (occupancy below ${TIER3_OCCUPANCY_THRESHOLD}%) and has zero active marketing campaigns. A targeted campaign is needed to boost enrolments.`,
          priority: "medium",
          dueDate: tomorrow,
          assigneeId,
        });

        details.push({
          service: svc.name,
          serviceCode: svc.code,
          alert: "no_active_campaign",
          taskCreated: created,
          ...(!created ? { reason: "existing_task_open" } : {}),
        });

        if (created) alertsCreated++;
        else alertsSkipped++;
      }
    }

    const result = {
      message: "Coverage alerts complete",
      servicesChecked: services.length,
      alertsCreated,
      alertsSkipped,
      details,
    };

    await guard.complete(result);

    return NextResponse.json(result);
  } catch (err) {
    await guard.fail(err);
    console.error("[Cron: coverage-alerts]", err);
    return NextResponse.json(
      { error: "Coverage alert cron failed", message: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

// ── Helpers ──────────────────────────────────────────────────

interface CreateTaskParams {
  serviceId: string;
  serviceName: string;
  dedupPhrase: string;
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  dueDate: Date;
  assigneeId: string | null;
}

/**
 * Create a marketing task only if no open (non-done) task already exists
 * for the same service with the same dedup phrase in the title.
 *
 * Returns true if a task was created, false if skipped (duplicate).
 */
async function maybeCreateTask(params: CreateTaskParams): Promise<boolean> {
  // Check for existing open task with the same key phrase
  const existing = await prisma.marketingTask.findFirst({
    where: {
      serviceId: params.serviceId,
      status: { not: "done" },
      deleted: false,
      title: { contains: params.dedupPhrase },
    },
    select: { id: true },
  });

  if (existing) return false;

  await prisma.marketingTask.create({
    data: {
      title: params.title,
      description: params.description,
      status: "todo",
      priority: params.priority,
      dueDate: params.dueDate,
      assigneeId: params.assigneeId,
      serviceId: params.serviceId,
    },
  });

  return true;
}
