import { NextRequest, NextResponse } from "next/server";
import { generateBoardReport } from "@/lib/board-report-generator";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";
import { z } from "zod";

import { parseJsonBody } from "@/lib/api-error";
const postSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2100),
});

/**
 * POST /api/reports/board — Generate (or regenerate) a board report
 *
 * Body: { month: 1-12, year: number }
 */
export const POST = withApiAuth(async (req, session) => {
  try {
    const raw = await parseJsonBody(req);
    const parsed = postSchema.safeParse(raw);
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
    logger.error("Board report generation failed", { err });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status: 500 },
    );
  }
}, { roles: ["owner", "head_office", "admin"] });

/**
 * GET /api/reports/board — List all board reports (summary)
 */
export const GET = withApiAuth(async (req, session) => {
  try {
    const reports = await prisma.boardReport.findMany({
      orderBy: [{ year: "desc" }, { month: "desc" }],
      select: {
        id: true,
        month: true,
        year: true,
        status: true,
        generatedAt: true,
        sentAt: true,
      },
    });

    return NextResponse.json(reports);
  } catch (err) {
    logger.error("Failed to list board reports", { err });
    return NextResponse.json(
      { error: "Failed to fetch reports" },
      { status: 500 },
    );
  }
}, { roles: ["owner", "head_office", "admin"] });
