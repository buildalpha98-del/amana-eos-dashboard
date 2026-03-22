import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCronSecret } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Weekly cron (Sundays) — auto-move stale nurturing enquiries to "cold".
 *
 * Criteria:
 * - Stage is "nurturing"
 * - stageChangedAt > 30 days ago
 * - No touchpoints sent in the last 14 days
 */
export const GET = withApiHandler(async (req) => {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * MS_PER_DAY);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * MS_PER_DAY);

  const staleEnquiries = await prisma.parentEnquiry.findMany({
    where: {
      deleted: false,
      stage: "nurturing",
      stageChangedAt: { lt: thirtyDaysAgo },
    },
    include: {
      touchpoints: {
        where: { createdAt: { gte: fourteenDaysAgo } },
        select: { id: true },
        take: 1,
      },
    },
  });

  // Filter to only those with no recent touchpoints
  const toCold = staleEnquiries.filter((eq) => eq.touchpoints.length === 0);

  if (toCold.length > 0) {
    await prisma.parentEnquiry.updateMany({
      where: { id: { in: toCold.map((eq) => eq.id) } },
      data: {
        stage: "cold",
        stageChangedAt: now,
      },
    });
  }

  if (process.env.NODE_ENV !== "production") console.log(`[enquiry-auto-cold] Moved ${toCold.length} enquiries to cold`);

  return NextResponse.json({
    ok: true,
    movedToCold: toCold.length,
  });
});
