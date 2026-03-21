import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/server-auth";
import { getOwnaClient } from "@/lib/owna";

export async function GET() {
  const { error } = await requireAuth(["owner", "admin", "head_office"]);
  if (error) return error;

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
}
