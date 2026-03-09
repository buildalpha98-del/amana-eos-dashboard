import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { generateSectionNarrative, type NarrativeSection } from "@/lib/ai-narratives";
import type { BoardReportData } from "@/lib/board-report-generator";

const VALID_SECTIONS: NarrativeSection[] = [
  "executive",
  "financial",
  "operations",
  "compliance",
  "growth",
  "people",
  "rocks",
];

/**
 * POST /api/reports/board/[id]/ai-narrative — Generate AI narrative for a section
 *
 * Body: { section: NarrativeSection }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const { id } = await params;

  try {
    const body = await req.json();
    const section = body.section as NarrativeSection;

    if (!section || !VALID_SECTIONS.includes(section)) {
      return NextResponse.json(
        { error: `Invalid section. Must be one of: ${VALID_SECTIONS.join(", ")}` },
        { status: 400 },
      );
    }

    const report = await prisma.boardReport.findUnique({ where: { id } });
    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    const data = report.data as unknown as BoardReportData;
    const narrative = await generateSectionNarrative(section, data, report.month, report.year);

    return NextResponse.json({ narrative });
  } catch (err) {
    console.error("AI narrative generation failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI generation failed" },
      { status: 500 },
    );
  }
}
