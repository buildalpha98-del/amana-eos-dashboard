import { NextRequest, NextResponse } from "next/server";
import { xeroApiRequest } from "@/lib/xero";
import { withApiAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";

export const GET = withApiAuth(async (req, session) => {
  try {
    const data = await xeroApiRequest("/TrackingCategories");

    return NextResponse.json(data.TrackingCategories);
  } catch (err) {
    logger.error("Failed to fetch Xero tracking categories", { err });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch tracking categories" },
      { status: 500 }
    );
  }
}, { roles: ["owner", "head_office", "admin"] });
