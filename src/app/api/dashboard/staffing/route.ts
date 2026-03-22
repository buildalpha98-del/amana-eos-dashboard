import { NextResponse } from "next/server";
import { getNetworkStaffingSummary } from "@/lib/staffing-analysis";
import { withApiAuth } from "@/lib/server-auth";

export const GET = withApiAuth(async (req, session) => {
// Only owner/admin get the full network staffing view
  const role = session.user.role;
  if (!["owner", "admin"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [todaySummary, tomorrowSummary] = await Promise.all([
    getNetworkStaffingSummary(today),
    getNetworkStaffingSummary(tomorrow),
  ]);

  return NextResponse.json({
    today: todaySummary,
    tomorrow: tomorrowSummary,
  });
});
