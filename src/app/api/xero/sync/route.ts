import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { syncXeroFinancials } from "@/lib/xero-sync";

export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  try {
    const body = await req.json().catch(() => ({}));
    const months = typeof body.months === "number" && body.months > 0
      ? body.months
      : 1;

    const result = await syncXeroFinancials({ months });

    // Log the sync activity
    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "sync",
        entityType: "XeroSync",
        entityId: "xero",
        details: {
          centreCount: result.centreCount,
          periodCount: result.periodCount,
          months,
          errors: result.errors.length > 0 ? result.errors : undefined,
        },
      },
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("Xero sync failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 }
    );
  }
}
