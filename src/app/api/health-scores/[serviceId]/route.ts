import { NextRequest, NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";
import { getHealthScoreData } from "@/lib/health-scores";

// ── GET /api/health-scores/[serviceId] ──────────────────────
export const GET = withApiAuth(async (req, session, context) => {
  const { serviceId } = await context!.params!;

  try {
    const data = await getHealthScoreData(serviceId);
    return NextResponse.json(data);
  } catch (err) {
    logger.error("health-scores/serviceId: Error", { err });
    return NextResponse.json(
      { error: "Failed to fetch health score" },
      { status: 500 }
    );
  }
});
