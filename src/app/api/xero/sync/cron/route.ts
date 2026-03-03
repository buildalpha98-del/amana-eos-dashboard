import { NextRequest, NextResponse } from "next/server";
import { syncXeroFinancials } from "@/lib/xero-sync";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncXeroFinancials({ months: 1 });
    return NextResponse.json(result);
  } catch (err) {
    console.error("Xero cron sync failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron sync failed" },
      { status: 500 }
    );
  }
}
