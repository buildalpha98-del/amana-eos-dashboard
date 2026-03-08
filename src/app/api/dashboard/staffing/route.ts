import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/server-auth";
import { getNetworkStaffingSummary } from "@/lib/staffing-analysis";

export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;

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
}
