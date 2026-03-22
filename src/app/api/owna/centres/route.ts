import { NextResponse } from "next/server";
import { getOwnaClient } from "@/lib/owna";
import { withApiAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";

export const GET = withApiAuth(async (req, session) => {
  const owna = getOwnaClient();
  if (!owna) {
    return NextResponse.json(
      { error: "OWNA API not configured. Set OWNA_API_URL and OWNA_API_KEY environment variables." },
      { status: 503 },
    );
  }

  try {
    const centres = await owna.getCentres();
    return NextResponse.json({
      centres: centres.map((c) => ({
        id: c.id,
        name: c.name,
        alias: c.alias,
        address: `${c.address}, ${c.suburb} ${c.state} ${c.postcode}`,
        serviceType: c.serviceType,
        childCount: c.children,
        openingTime: c.openingtime,
        closingTime: c.closingtime,
      })),
      count: centres.length,
    });
  } catch (err) {
    logger.error("OWNA: Failed to fetch centres", { err });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch OWNA centres" },
      { status: 502 },
    );
  }
}, { roles: ["owner", "admin", "head_office"] });
