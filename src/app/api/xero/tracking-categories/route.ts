import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server-auth";
import { xeroApiRequest } from "@/lib/xero";

export async function GET(req: NextRequest) {
  const { error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  try {
    const data = await xeroApiRequest("/TrackingCategories");

    return NextResponse.json(data.TrackingCategories);
  } catch (err) {
    console.error("Failed to fetch Xero tracking categories:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch tracking categories" },
      { status: 500 }
    );
  }
}
