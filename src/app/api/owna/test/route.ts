import { NextResponse } from "next/server";
import { getOwnaClient } from "@/lib/owna";
import { withApiAuth } from "@/lib/server-auth";
import { ADMIN_ROLES } from "@/lib/role-permissions";

export const GET = withApiAuth(async (req, session) => {
  const owna = getOwnaClient();
  if (!owna) {
    return NextResponse.json({
      connected: false,
      error: "OWNA API not configured. Set OWNA_API_URL and OWNA_API_KEY.",
    });
  }

  try {
    const centres = await owna.getCentres();
    return NextResponse.json({
      connected: true,
      centreCount: centres.length,
      centreNames: centres.map((c) => c.name),
    });
  } catch (err) {
    return NextResponse.json({
      connected: false,
      error: err instanceof Error ? err.message : "Connection failed",
    });
  }
}, { roles: [...ADMIN_ROLES] });
