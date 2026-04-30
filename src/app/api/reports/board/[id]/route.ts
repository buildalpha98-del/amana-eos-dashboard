import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { z } from "zod";

import { parseJsonBody } from "@/lib/api-error";
const patchSchema = z.object({
  executiveSummary: z.string().optional(),
  financialNarrative: z.string().optional(),
  operationsNarrative: z.string().optional(),
  complianceNarrative: z.string().optional(),
  growthNarrative: z.string().optional(),
  peopleNarrative: z.string().optional(),
  rocksNarrative: z.string().optional(),
  status: z.enum(["draft", "final", "sent"]).optional(),
});

/**
 * GET /api/reports/board/[id] — Get full board report
 */
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const report = await prisma.boardReport.findUnique({ where: { id } });

  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  return NextResponse.json(report);
}, { roles: ["owner", "head_office", "admin"] });

/**
 * PATCH /api/reports/board/[id] — Update narratives and/or status
 */
export const PATCH = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const existing = await prisma.boardReport.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const raw = await parseJsonBody(req);
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) {
      updates[key] = value;
    }
  }

  if (updates.status === "final") {
    updates.finalizedAt = new Date();
  }

  const report = await prisma.boardReport.update({
    where: { id },
    data: updates,
  });

  return NextResponse.json(report);
}, { roles: ["owner", "head_office", "admin"] });

/**
 * DELETE /api/reports/board/[id] — Delete a report (owner only)
 */
export const DELETE = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const existing = await prisma.boardReport.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  await prisma.boardReport.delete({ where: { id } });

  return NextResponse.json({ success: true });
}, { roles: ["owner"] });
