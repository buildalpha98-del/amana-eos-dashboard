import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/reports/board/[id] — Get full board report
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const { id } = await params;
  const report = await prisma.boardReport.findUnique({ where: { id } });

  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  return NextResponse.json(report);
}

const VALID_STATUSES = ["draft", "final", "sent"] as const;

/**
 * PATCH /api/reports/board/[id] — Update narratives and/or status
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const { id } = await params;
  const existing = await prisma.boardReport.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const body = await req.json();

  const allowedFields = [
    "executiveSummary",
    "financialNarrative",
    "operationsNarrative",
    "complianceNarrative",
    "growthNarrative",
    "peopleNarrative",
    "rocksNarrative",
    "status",
  ] as const;

  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in body) {
      updates[field] = body[field];
    }
  }

  // Validate status enum
  if (updates.status != null && !VALID_STATUSES.includes(updates.status as typeof VALID_STATUSES[number])) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` },
      { status: 400 },
    );
  }

  if (updates.status === "final") {
    updates.finalizedAt = new Date();
  }

  const report = await prisma.boardReport.update({
    where: { id },
    data: updates,
  });

  return NextResponse.json(report);
}

/**
 * DELETE /api/reports/board/[id] — Delete a report (owner only)
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAuth(["owner"]);
  if (error) return error;

  const { id } = await params;
  const existing = await prisma.boardReport.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  await prisma.boardReport.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
