import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { getWeekWindow } from "@/lib/cockpit/week";

/**
 * GET /api/marketing/cockpit/weekly-report/current
 *
 * Returns the current week's WeeklyMarketingReport (or null if not yet drafted).
 */
export const GET = withApiAuth(
  async () => {
    const { start } = getWeekWindow();
    const report = await prisma.weeklyMarketingReport.findUnique({
      where: { weekStart: start },
      include: {
        reviewedBy: { select: { id: true, name: true, email: true } },
        sentBy: { select: { id: true, name: true, email: true } },
      },
    });
    return NextResponse.json({ report });
  },
  { roles: ["marketing", "owner"] },
);
