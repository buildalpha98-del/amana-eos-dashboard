import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

/**
 * GET /api/qip/[id] — Full QIP with all 7 quality areas
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAuth();
  if (error) return error;
  const { id } = await params;

  try {
    const qip = await prisma.qualityImprovementPlan.findUnique({
      where: { id },
      include: {
        service: { select: { id: true, name: true, code: true, state: true } },
        reviewedBy: { select: { id: true, name: true } },
        qualityAreas: { orderBy: { qualityArea: "asc" } },
      },
    });
    if (!qip) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(qip);
  } catch (err) {
    console.error("[QIP GET/:id]", err);
    return NextResponse.json({ error: "Failed to fetch QIP" }, { status: 500 });
  }
}

/**
 * PATCH /api/qip/[id] — Update QIP status/review info
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;
  const { id } = await params;

  try {
    const body = await req.json();
    const data: Record<string, unknown> = {};

    if (body.status !== undefined) data.status = body.status;
    if (body.documentType !== undefined) data.documentType = body.documentType;
    if (body.markReviewed) {
      data.lastReviewDate = new Date();
      data.reviewedById = session!.user.id;
    }

    const qip = await prisma.qualityImprovementPlan.update({
      where: { id },
      data,
      include: {
        service: { select: { id: true, name: true } },
        qualityAreas: { orderBy: { qualityArea: "asc" } },
      },
    });

    return NextResponse.json(qip);
  } catch (err) {
    console.error("[QIP PATCH/:id]", err);
    return NextResponse.json({ error: "Failed to update QIP" }, { status: 500 });
  }
}
