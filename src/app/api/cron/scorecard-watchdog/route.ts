import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiHandler } from "@/lib/api-handler";
import { acquireCronLock } from "@/lib/cron-guard";
import { logger } from "@/lib/logger";
import { getOrgSettings } from "@/lib/org-settings";
import { NOTIFICATION_TYPES } from "@/lib/notification-types";

/**
 * GET /api/cron/scorecard-watchdog — weekly, Sunday 21:30 UTC (after
 * auto-measurables 20:30 and marketing-measurables 20:45 have filled the
 * week's numbers).
 *
 * EOS doctrine: a measurable off-track N consecutive weeks MUST hit IDS.
 * This makes the scorecard self-enforcing — for each weekly measurable
 * whose latest N entries are all off-track, raise a high-priority
 * short-term Issue owned by the measurable's owner. A standing open
 * policing issue suppresses re-raising; solving it re-arms the watchdog.
 *
 * Only filled-but-failing weeks count: missing entries are chased by the
 * scorecard-missing cron, not this one.
 */

export const GET = withApiHandler(async (req) => {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const guard = await acquireCronLock("scorecard-watchdog", "weekly");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const { measurableOffTrackWeeks: weeks } = (await getOrgSettings()).eos;

    // Measurable is a hard-deleted model — no `deleted` filter exists.
    const measurables = await prisma.measurable.findMany({
      where: { frequency: "weekly" },
      select: {
        id: true,
        title: true,
        goalValue: true,
        goalDirection: true,
        unit: true,
        ownerId: true,
        serviceId: true,
        entries: {
          orderBy: { weekOf: "desc" },
          take: weeks,
          select: { value: true, onTrack: true, weekOf: true },
        },
      },
    });

    let raised = 0;

    for (const m of measurables) {
      if (m.entries.length < weeks) continue;
      if (!m.entries.every((e) => e.onTrack === false)) continue;

      // A standing (non-deleted) policing issue keeps watch; solving or
      // closing it re-arms the watchdog for this measurable.
      const existing = await prisma.issue.findFirst({
        where: {
          measurableId: m.id,
          deleted: false,
          status: { in: ["open", "in_discussion"] },
        },
        select: { id: true },
      });
      if (existing) continue;

      const goal = `${m.goalDirection === "above" ? "≥" : m.goalDirection === "below" ? "≤" : "="} ${m.goalValue}${m.unit ? ` ${m.unit}` : ""}`;
      const history = m.entries
        .map(
          (e) =>
            `- w/c ${e.weekOf.toISOString().slice(0, 10)}: ${e.value}${m.unit ? ` ${m.unit}` : ""}`,
        )
        .join("\n");

      const issue = await prisma.issue.create({
        data: {
          title: `Scorecard off-track ${weeks}w: ${m.title}`,
          description: `Auto-raised by the scorecard watchdog — "${m.title}" has missed its goal (${goal}) for ${weeks} consecutive weeks:\n\n${history}\n\nSolving this issue re-arms the watchdog.`,
          priority: "high",
          category: "short_term",
          ownerId: m.ownerId,
          serviceId: m.serviceId,
          measurableId: m.id,
        },
      });

      if (m.ownerId) {
        try {
          await prisma.userNotification.createMany({
            data: [
              {
                userId: m.ownerId,
                type: NOTIFICATION_TYPES.SCORECARD_WATCHDOG,
                title: `Scorecard watchdog: ${m.title}`,
                body: `Off-track ${weeks} weeks running — an Issue has been raised into IDS.`,
                link: "/issues",
              },
            ],
          });
        } catch (err) {
          logger.error("scorecard-watchdog: notification failed", { err });
        }
      }

      await prisma.activityLog.create({
        data: {
          userId: m.ownerId,
          action: "create",
          entityType: "Issue",
          entityId: issue.id,
          details: { auto: true, measurableId: m.id, weeks },
        },
      });
      raised++;
    }

    return NextResponse.json({
      message: "Scorecard watchdog complete",
      scanned: measurables.length,
      raised,
    });
  } catch (err) {
    logger.error("scorecard-watchdog cron failed", { err });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron failed" },
      { status: 500 },
    );
  }
});
