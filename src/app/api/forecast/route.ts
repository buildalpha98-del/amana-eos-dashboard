/**
 * GET /api/forecast — forward-looking analytics (2026-07-06).
 *
 * Per-centre occupancy forecast (linear projection over the last 12
 * weeks of average daily attendance, from DailyAttendance) plus an
 * enquiry-pipeline conversion forecast (historical funnel rate applied
 * to the current open pipeline). Powers the Forecast view on
 * /performance and the projection alert chips on /leadership.
 *
 * Admin tier only — cross-service revenue posture is leadership data.
 * ?weeks= sets the horizon (4–8, default 8).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";
import {
  forecastPipeline,
  deriveAlerts,
  CONVERTED_STAGES,
  OPEN_PIPELINE_STAGES,
} from "@/lib/forecast";
import { computeServiceForecasts } from "@/lib/forecast-data";

export const GET = withApiAuth(async (req, session) => {
  if (!isAdminRole(session.user.role ?? "")) {
    throw ApiError.forbidden("Forecasting is admin-tier only.");
  }

  const url = new URL(req.url);
  const weeksAhead = Math.min(
    8,
    Math.max(4, Number(url.searchParams.get("weeks")) || 8),
  );

  const [serviceForecasts, openEnquiries, convertedCount, coldCount] =
    await Promise.all([
      computeServiceForecasts(weeksAhead),
      prisma.parentEnquiry.groupBy({
        by: ["stage"],
        where: { stage: { in: [...OPEN_PIPELINE_STAGES] } },
        _count: { _all: true },
      }),
      prisma.parentEnquiry.count({
        where: { stage: { in: [...CONVERTED_STAGES] } },
      }),
      prisma.parentEnquiry.count({ where: { stage: "cold" } }),
    ]);

  const openByStage: Record<string, number> = {};
  for (const g of openEnquiries) {
    openByStage[g.stage] = g._count._all;
  }

  return NextResponse.json({
    weeksAhead,
    services: serviceForecasts,
    pipeline: forecastPipeline(openByStage, convertedCount, coldCount),
    alerts: deriveAlerts(serviceForecasts, weeksAhead),
  });
});
