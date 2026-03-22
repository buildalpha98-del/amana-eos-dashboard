import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncXeroFinancials } from "@/lib/xero-sync";
import { withApiAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";
import { z } from "zod";

const bodySchema = z.object({
  months: z.number().int().min(1).max(24).default(1),
});

export const POST = withApiAuth(async (req, session) => {
try {
    const raw = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(raw);
    const months = parsed.success ? parsed.data.months : 1;

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
    logger.error("Xero sync failed", { err });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 }
    );
  }
}, { roles: ["owner", "head_office", "admin"] });
