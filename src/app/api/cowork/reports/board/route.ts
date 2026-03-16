import { NextRequest, NextResponse } from "next/server";
import { authenticateCowork } from "@/app/api/_lib/auth";
import { generateBoardReport } from "@/lib/board-report-generator";

/**
 * POST /api/cowork/reports/board — Generate a board report via API key
 *
 * Auth: API key with `reports:write` scope
 * Body: { month: 1-12, year: number }
 */
export async function POST(req: NextRequest) {
  const authError = authenticateCowork(req);
  if (authError) return authError;

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
    console.error("Cowork board report generation failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status: 500 },
    );
  }
}
