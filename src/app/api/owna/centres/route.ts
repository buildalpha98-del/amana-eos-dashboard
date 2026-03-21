import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/server-auth";
import { getOwnaClient } from "@/lib/owna";

export async function GET() {
  const { error } = await requireAuth(["owner", "admin", "head_office"]);
  if (error) return error;

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
    console.error("[OWNA] Failed to fetch centres:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch OWNA centres" },
      { status: 502 },
    );
  }
}
