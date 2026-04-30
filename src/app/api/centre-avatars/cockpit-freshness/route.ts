import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { classifyFreshness } from "@/lib/centre-avatar/freshness";

/**
 * GET /api/centre-avatars/cockpit-freshness
 *
 * Aggregate used by the Sprint 2 cockpit "Centre Intel" tile. Returns:
 *   - freshness distribution across all Avatars (fresh / aging / stale)
 *   - total pending-review insights harvested by the cron but not yet triaged
 *   - list of stale centre names so the tile can annotate
 */
export const GET = withApiAuth(
  async () => {
    const [avatars, pendingInsightsCount] = await Promise.all([
      prisma.centreAvatar.findMany({
        select: {
          id: true,
          lastUpdatedAt: true,
          service: { select: { name: true } },
        },
        orderBy: { lastUpdatedAt: "asc" },
      }),
      prisma.centreAvatarInsight.count({ where: { status: "pending_review" } }),
    ]);

    const now = new Date();
    const counts = { fresh: 0, aging: 0, stale: 0 };
    const staleCentres: string[] = [];

    for (const a of avatars) {
      const bucket = classifyFreshness(a.lastUpdatedAt, now);
      counts[bucket] += 1;
      if (bucket === "stale") staleCentres.push(a.service.name);
    }

    return NextResponse.json({
      total: avatars.length,
      counts,
      pendingInsightsCount,
      staleCentres,
    });
  },
  { roles: ["marketing", "owner", "admin", "head_office"] },
);
