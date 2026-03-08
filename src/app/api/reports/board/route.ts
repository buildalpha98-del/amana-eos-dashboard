import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server-auth";
import { generateBoardReport } from "@/lib/board-report-generator";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/reports/board — Generate (or regenerate) a board report
 *
 * Body: { month: 1-12, year: number }
 */
export async function POST(req: NextRequest) {
  const { error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  try {
    const body = await req.json();
    const { month, year } = body as { month: number; year: number };

    if (!month || !year || month < 1 || month > 12) {
      return NextResponse.json(
        { error: "Invalid month (1-12) or year" },
        { status: 400 },
      );
    }

    const report = await generateBoardReport({ month, year });
    return NextResponse.json(report);
  } catch (err) {
    console.error("Board report generation failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/reports/board — List all board reports (summary)
 */
export async function GET() {
  const { error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

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
    console.error("Failed to list board reports:", err);
    return NextResponse.json(
      { error: "Failed to fetch reports" },
      { status: 500 },
    );
  }
}
