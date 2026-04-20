import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "../../../_lib/auth";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

import { parseJsonBody } from "@/lib/api-error";
// ── Validation ──────────────────────────────────────────────

const NQS_RATINGS = ["exceeding", "meeting", "working_towards", "not_met"] as const;

const elementSchema = z.object({
  element: z.string().min(1, "element identifier is required"),
  rating: z.enum([...NQS_RATINGS], {
    error: `rating must be one of: ${NQS_RATINGS.join(", ")}`,
  }),
  evidence: z.string().min(1, "evidence is required"),
  notes: z.string().optional(),
});

const evidenceReviewSchema = z.object({
  centreId: z.string().min(1, "centreId is required"),
  qualityArea: z.number().int().min(1).max(7, "qualityArea must be 1-7 (NQS QA1-QA7)"),
  elements: z
    .array(elementSchema)
    .min(1, "At least one element is required"),
  overallRating: z.enum([...NQS_RATINGS], {
    error: `overallRating must be one of: ${NQS_RATINGS.join(", ")}`,
  }),
  reviewerNotes: z.string().max(2000).optional(),
  auditInstanceId: z.string().optional(),
});

/**
 * POST /api/cowork/audits/evidence-review — Submit NQS Quality Area evidence pack
 * Creates an AuditReview record with element-level ratings and evidence.
 */
export const POST = withApiHandler(async (req) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  try {
    const body = await parseJsonBody(req);
    const parsed = evidenceReviewSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          issues: parsed.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
        { status: 400 },
      );
    }

    const { centreId, qualityArea, elements, overallRating, reviewerNotes, auditInstanceId } =
      parsed.data;

    // Validate auditInstanceId if provided
    if (auditInstanceId) {
      const instance = await prisma.auditInstance.findUnique({
        where: { id: auditInstanceId },
      });
      if (!instance) {
        return NextResponse.json(
          { error: "Audit instance not found" },
          { status: 404 },
        );
      }
    }

    const review = await prisma.auditReview.create({
      data: {
        centreId,
        qualityArea,
        elements: elements as object[],
        overallRating,
        reviewerNotes: reviewerNotes ?? null,
        auditInstanceId: auditInstanceId ?? null,
      },
    });

    return NextResponse.json(
      {
        message: "Evidence review submitted successfully",
        review: {
          id: review.id,
          centreId,
          qualityArea: `QA${qualityArea}`,
          overallRating,
          elementCount: elements.length,
          createdAt: review.createdAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (err) {
    logger.error("Cowork Audit Evidence Review POST", { err });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
});

/**
 * GET /api/cowork/audits/evidence-review — Retrieve evidence reviews
 * Filters: ?centreId=, ?qualityArea=, ?limit=
 */
export const GET = withApiHandler(async (req) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const centreId = searchParams.get("centreId");
    const qualityArea = searchParams.get("qualityArea");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);

    const where: Record<string, unknown> = {};
    if (centreId) where.centreId = centreId;
    if (qualityArea) where.qualityArea = parseInt(qualityArea);

    const reviews = await prisma.auditReview.findMany({
      where,
      orderBy: { reviewedAt: "desc" },
      take: limit,
    });

    return NextResponse.json({ reviews, total: reviews.length });
  } catch (err) {
    logger.error("Cowork Audit Evidence Review GET", { err });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
});
