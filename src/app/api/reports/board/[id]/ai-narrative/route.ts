import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateSectionNarrative, type NarrativeSection } from "@/lib/ai-narratives";
import type { BoardReportData } from "@/lib/board-report-generator";
import { withApiAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";
import { z } from "zod";

import { parseJsonBody } from "@/lib/api-error";
const VALID_SECTIONS: NarrativeSection[] = [
  "executive",
  "financial",
  "operations",
  "compliance",
  "growth",
  "people",
  "rocks",
];

const bodySchema = z.object({
  section: z.enum(["executive", "financial", "operations", "compliance", "growth", "people", "rocks"]),
});

/**
 * POST /api/reports/board/[id]/ai-narrative — Generate AI narrative for a section
 *
 * Body: { section: NarrativeSection }
 */
export const POST = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  try {
    const raw = await parseJsonBody(req);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: `Invalid section. Must be one of: ${VALID_SECTIONS.join(", ")}` },
        { status: 400 },
      );
    }
    const section = parsed.data.section as NarrativeSection;

    const report = await prisma.boardReport.findUnique({ where: { id } });
    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    const data = report.data as unknown as BoardReportData;
    const narrative = await generateSectionNarrative(section, data, report.month, report.year);

    return NextResponse.json({ narrative });
  } catch (err) {
    logger.error("AI narrative generation failed", { err });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI generation failed" },
      { status: 500 },
    );
  }
}, { roles: ["owner", "head_office", "admin"] });
