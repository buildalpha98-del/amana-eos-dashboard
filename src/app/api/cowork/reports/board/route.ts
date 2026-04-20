import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateCowork } from "@/app/api/_lib/auth";
import { generateBoardReport } from "@/lib/board-report-generator";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

import { parseJsonBody } from "@/lib/api-error";
const bodySchema = z.object({
  month: z.number().min(1).max(12),
  year: z.number().min(2000).max(2100),
});

/**
 * POST /api/cowork/reports/board — Generate a board report via API key
 *
 * Auth: API key with `reports:write` scope
 * Body: { month: 1-12, year: number }
 */
export const POST = withApiHandler(async (req) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  try {
    const body = await parseJsonBody(req);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { month, year } = parsed.data;

    const report = await generateBoardReport({ month, year });
    return NextResponse.json(report);
  } catch (err) {
    logger.error("Cowork board report generation failed", { err });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status: 500 },
    );
  }
});
