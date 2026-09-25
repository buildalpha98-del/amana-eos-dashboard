import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiHandler } from "@/lib/api-handler";
import { acquireCronLock } from "@/lib/cron-guard";
import { logger } from "@/lib/logger";
import { nextOccurrence, sameLocalDayRange } from "@/lib/meeting-series";

/**
 * GET /api/cron/meeting-series — daily (~4-5am Sydney).
 *
 * Materialises each active MeetingSeries' next occurrence (within a
 * 7-day window) as a `scheduled` Meeting, which the morning-briefing
 * cron then auto-preps on the day.
 *
 * Idempotency is SAME-LOCAL-DAY, any status: an occurrence that exists
 * for that Sydney calendar day — including one someone cancelled — is
 * never re-created. Day-window matching (not exact timestamp) so an
 * edited occurrence time or millisecond drift can't spawn a duplicate.
 */

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export const GET = withApiHandler(async (req) => {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const guard = await acquireCronLock("meeting-series", "daily");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const now = new Date();
    const seriesList = await prisma.meetingSeries.findMany({
      where: { active: true },
    });

    let created = 0;
    let skipped = 0;

    for (const series of seriesList) {
      const occ = nextOccurrence(series, now);
      if (occ.getTime() - now.getTime() > WINDOW_MS) {
        skipped++;
        continue;
      }

      const { start, end } = sameLocalDayRange(occ, series.timezone);
      const existing = await prisma.meeting.findFirst({
        where: { seriesId: series.id, date: { gte: start, lt: end } },
        select: { id: true },
      });
      if (existing) {
        skipped++;
        continue;
      }

      const title = `${series.name} — ${occ.toLocaleDateString("en-AU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: series.timezone,
      })}`;

      const meeting = await prisma.meeting.create({
        data: {
          title,
          date: occ,
          status: "scheduled",
          startedAt: null,
          createdById: series.createdById,
          serviceIds: series.serviceIds,
          isLeadership: series.isLeadership,
          scorecardId: series.scorecardId,
          seriesId: series.id,
        },
      });

      if (series.attendeeUserIds.length > 0) {
        const activeUsers = await prisma.user.findMany({
          where: { id: { in: series.attendeeUserIds }, active: true },
          select: { id: true },
        });
        if (activeUsers.length > 0) {
          await prisma.meetingAttendee.createMany({
            data: activeUsers.map((u) => ({
              meetingId: meeting.id,
              userId: u.id,
              status: "present" as const,
            })),
          });
        }
      }

      // ActivityLog.userId is required — attribute to the series creator
      // when they still exist; otherwise skip the log (cron-created).
      if (series.createdById) {
        await prisma.activityLog.create({
          data: {
            userId: series.createdById,
            action: "create",
            entityType: "Meeting",
            entityId: meeting.id,
            details: { seriesId: series.id, auto: true, title },
          },
        });
      }
      created++;
    }

    return NextResponse.json({ message: "Meeting series processed", created, skipped });
  } catch (err) {
    logger.error("meeting-series cron failed", { err });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron failed" },
      { status: 500 },
    );
  }
});
