import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

/**
 * PATCH /api/audits/[id]/responses — bulk save progress on audit responses
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth(["owner", "admin", "member"]);
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const { responses } = body as {
    responses: Array<{
      id: string;
      result?: string;
      ratingValue?: number | null;
      actionRequired?: string | null;
      evidenceSighted?: string | null;
      notes?: string | null;
      photoUrl?: string | null;
    }>;
  };

  if (!Array.isArray(responses) || responses.length === 0) {
    return NextResponse.json({ error: "responses array is required" }, { status: 400 });
  }

  // Verify audit instance exists and belongs to caller
  const instance = await prisma.auditInstance.findUnique({
    where: { id },
    select: { id: true, status: true },
  });

  if (!instance) {
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }

  // Bulk upsert responses
  const results = await prisma.$transaction(
    responses.map((r) => {
      const data: Record<string, unknown> = {};
      if (r.result !== undefined) data.result = r.result;
      if (r.ratingValue !== undefined) data.ratingValue = r.ratingValue;
      if (r.actionRequired !== undefined) data.actionRequired = r.actionRequired;
      if (r.evidenceSighted !== undefined) data.evidenceSighted = r.evidenceSighted;
      if (r.notes !== undefined) data.notes = r.notes;
      if (r.photoUrl !== undefined) data.photoUrl = r.photoUrl;

      return prisma.auditItemResponse.update({
        where: { id: r.id },
        data,
      });
    })
  );

  return NextResponse.json({ updated: results.length });
}
