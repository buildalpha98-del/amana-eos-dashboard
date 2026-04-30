import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import {
  COORDINATOR_WEEKLY_FLOOR,
  NETWORK_TARGETS,
  NETWORK_WIDE_COORD_FLOOR,
  NETWORK_WIDE_COORD_TARGET,
  dayLabel,
  detectTwoWeekConcerns,
  formatIsoDate,
  getWeekBounds,
  getWeekdaysInWeek,
  resolveCoordinatorForService,
} from "@/lib/whatsapp-compliance";

export const GET = withApiAuth(
  async (req) => {
    const url = new URL(req.url);
    const weekStartParam = url.searchParams.get("weekStart");

    let referenceDate: Date;
    if (weekStartParam) {
      const parsed = new Date(`${weekStartParam}T00:00:00Z`);
      if (Number.isNaN(parsed.getTime())) {
        throw ApiError.badRequest("Invalid weekStart");
      }
      referenceDate = parsed;
    } else {
      referenceDate = new Date();
    }

    const week = getWeekBounds(referenceDate);
    const weekdays = getWeekdaysInWeek(week.start);

    const services = await prisma.service.findMany({
      where: { status: "active" },
      select: { id: true, name: true, state: true, code: true },
      orderBy: { name: "asc" },
    });

    const coordinators = await Promise.all(
      services.map(async (s) => ({
        serviceId: s.id,
        coord: await resolveCoordinatorForService(s.id),
      })),
    );
    const coordByService = new Map(coordinators.map((c) => [c.serviceId, c.coord]));

    const records = await prisma.whatsAppCoordinatorPost.findMany({
      where: {
        postedDate: { gte: weekdays[0], lte: weekdays[weekdays.length - 1] },
        serviceId: { in: services.map((s) => s.id) },
      },
      include: {
        recordedBy: { select: { id: true, name: true } },
      },
    });

    const recordKey = (sid: string, date: Date) => `${sid}__${formatIsoDate(date)}`;
    const recordMap = new Map(
      records.map((r) => [recordKey(r.serviceId, r.postedDate), r]),
    );

    const cells = services.flatMap((s) =>
      weekdays.map((d) => {
        const key = recordKey(s.id, d);
        const rec = recordMap.get(key);
        return {
          serviceId: s.id,
          date: formatIsoDate(d),
          record: rec
            ? {
                id: rec.id,
                posted: rec.posted,
                notPostingReason: rec.notPostingReason,
                notes: rec.notes,
                recordedAt: rec.updatedAt.toISOString(),
                recordedByName: rec.recordedBy?.name ?? "Unknown",
              }
            : null,
        };
      }),
    );

    let posted = 0;
    let notPosted = 0;
    let cellsChecked = 0;
    for (const c of cells) {
      if (c.record) {
        cellsChecked++;
        if (c.record.posted) posted++;
        else notPosted++;
      }
    }
    const totalCells = services.length * 5;
    const coverage = totalCells === 0 ? 0 : Math.round((cellsChecked / totalCells) * 100);

    const networkPostsRaw = await prisma.whatsAppNetworkPost.findMany({
      where: { postedAt: { gte: week.start, lte: week.end } },
      orderBy: { postedAt: "desc" },
      include: { recordedBy: { select: { id: true, name: true } } },
    });

    const summariseNetwork = (group: "engagement" | "announcements") => {
      const filtered = networkPostsRaw.filter((p) => p.group === group);
      return {
        count: filtered.length,
        target: NETWORK_TARGETS[group].target,
        floor: NETWORK_TARGETS[group].floor,
        posts: filtered.map((p) => ({
          id: p.id,
          postedAt: p.postedAt.toISOString(),
          topic: p.topic,
          notes: p.notes,
          recordedByName: p.recordedBy.name,
          marketingPostId: p.marketingPostId,
        })),
      };
    };

    const concerns = await detectTwoWeekConcerns({ now: referenceDate });

    return NextResponse.json({
      week: {
        start: formatIsoDate(week.start),
        end: formatIsoDate(week.end),
        weekNumber: week.weekNumber,
        year: week.year,
      },
      centres: services.map((s) => {
        const coord = coordByService.get(s.id) ?? null;
        return {
          id: s.id,
          name: s.name,
          state: s.state,
          code: s.code,
          coordinatorName: coord?.name ?? null,
          coordinatorUserId: coord?.id ?? null,
        };
      }),
      days: weekdays.map((d) => ({ date: formatIsoDate(d), dayLabel: dayLabel(d) })),
      cells,
      summary: {
        totalCells,
        cellsChecked,
        posted,
        notPosted,
        coverage,
        target: NETWORK_WIDE_COORD_TARGET,
        floor: NETWORK_WIDE_COORD_FLOOR,
        coordinatorWeeklyFloor: COORDINATOR_WEEKLY_FLOOR,
      },
      networkPosts: {
        engagement: summariseNetwork("engagement"),
        announcements: summariseNetwork("announcements"),
      },
      patterns: {
        twoWeekConcerns: concerns,
      },
    });
  },
  { roles: ["marketing", "owner"] },
);
