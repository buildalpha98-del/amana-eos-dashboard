import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { computeCockpitSummary } from "@/lib/cockpit/summary";

/**
 * GET /api/marketing/cockpit/summary
 *
 * Returns the six-tile KPI payload + secondary-row data for the marketing
 * cockpit. Scoped to "this week" (Mon–Sun local time) and the current
 * Australian school term.
 */
export const GET = withApiAuth(
  async () => {
    const payload = await computeCockpitSummary();
    return NextResponse.json(payload);
  },
  { roles: ["marketing", "owner"] },
);
