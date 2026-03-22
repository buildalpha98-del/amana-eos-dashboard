import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";
/**
 * Manual sync trigger — proxies to the cron endpoint with CRON_SECRET auth.
 * This allows the settings UI to trigger a sync without exposing the secret.
 */
export const POST = withApiAuth(async (req, session) => {
  if (!["owner", "admin"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }

  // Determine the base URL for the internal cron call
  const baseUrl =
    process.env.NEXTAUTH_URL ||
    process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

  try {
    const res = await fetch(`${baseUrl}/api/cron/owna-sync`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${cronSecret}`,
      },
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    logger.error("OWNA: Manual sync trigger failed", { err });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 },
    );
  }
});
