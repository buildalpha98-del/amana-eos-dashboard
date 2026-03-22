import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { aggregateDashboard } from "@/lib/dashboard-aggregator";

export const GET = withApiAuth(async (req, session) => {
  const data = await aggregateDashboard(session);
  return NextResponse.json(data);
});
