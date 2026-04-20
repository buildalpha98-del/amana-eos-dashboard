import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";

import { parseJsonBody } from "@/lib/api-error";
const updateQipSchema = z.object({
  status: z.string().optional(),
  documentType: z.string().optional(),
  markReviewed: z.boolean().optional(),
});
/**
 * GET /api/qip/[id] — Full QIP with all 7 quality areas
 */
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

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
    logger.error("QIP GET/:id", { err });
    return NextResponse.json({ error: "Failed to fetch QIP" }, { status: 500 });
  }
});

/**
 * PATCH /api/qip/[id] — Update QIP status/review info
 */
export const PATCH = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;

  try {
    const body = await parseJsonBody(req);
    const parsed = updateQipSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const data: Record<string, unknown> = {};

    if (parsed.data.status !== undefined) data.status = parsed.data.status;
    if (parsed.data.documentType !== undefined) data.documentType = parsed.data.documentType;
    if (parsed.data.markReviewed) {
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
    logger.error("QIP PATCH/:id", { err });
    return NextResponse.json({ error: "Failed to update QIP" }, { status: 500 });
  }
}, { roles: ["owner", "head_office", "admin"] });
