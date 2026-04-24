import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { classifyFreshness, daysSince } from "@/lib/centre-avatar/freshness";

/**
 * GET /api/centre-avatars
 *
 * Lists all Centre Avatars with freshness metadata and a preview of each
 * snapshot's Section-1 starter data (numbers, parentDrivers, programmeFocus).
 *
 * The list-level query returns the pending-insights count per Avatar so the
 * index cards can show a "N insights awaiting review" badge without a second
 * round trip.
 */
export const GET = withApiAuth(
  async () => {
    const avatars = await prisma.centreAvatar.findMany({
      include: {
        service: { select: { id: true, name: true, state: true } },
        lastUpdatedBy: { select: { id: true, name: true } },
        _count: {
          select: {
            insights: { where: { status: "pending_review" } },
          },
        },
      },
      orderBy: [{ service: { state: "asc" } }, { service: { name: "asc" } }],
    });

    const now = new Date();

    return NextResponse.json({
      avatars: avatars.map((a) => ({
        id: a.id,
        serviceId: a.serviceId,
        serviceName: a.service.name,
        state: a.service.state,
        lastUpdatedAt: a.lastUpdatedAt.toISOString(),
        lastUpdatedBy: a.lastUpdatedBy,
        lastReviewedAt: a.lastReviewedAt?.toISOString() ?? null,
        lastFullReviewAt: a.lastFullReviewAt?.toISOString() ?? null,
        lastOpenedAt: a.lastOpenedAt?.toISOString() ?? null,
        daysSinceUpdate: daysSince(a.lastUpdatedAt, now),
        freshness: classifyFreshness(a.lastUpdatedAt, now),
        snapshot: a.snapshot ?? null,
        pendingInsightsCount: a._count.insights,
      })),
    });
  },
  { roles: ["marketing", "owner", "admin", "head_office"] },
);
