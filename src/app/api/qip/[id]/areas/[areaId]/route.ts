import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

/**
 * PATCH /api/qip/[id]/areas/[areaId] — Update individual quality area content
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; areaId: string }> },
) {
  const { error } = await requireAuth(["owner", "head_office", "admin", "member"]);
  if (error) return error;
  const { areaId } = await params;

  try {
    const body = await req.json();
    const data: Record<string, unknown> = {};

    const fields = [
      "strengths",
      "areasForImprovement",
      "improvementGoal",
      "strategies",
      "timeline",
      "responsiblePerson",
      "evidenceIndicators",
      "evidenceCollected",
      "progressNotes",
      "progressStatus",
    ];
    for (const f of fields) {
      if (body[f] !== undefined) data[f] = body[f];
    }

    const area = await prisma.qIPQualityArea.update({
      where: { id: areaId },
      data,
    });

    return NextResponse.json(area);
  } catch (err) {
    console.error("[QIP Area PATCH]", err);
    return NextResponse.json({ error: "Failed to update quality area" }, { status: 500 });
  }
}
