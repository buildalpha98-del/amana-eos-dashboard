import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

const updateStageSchema = z.object({
  stage: z.string().min(1, "Stage is required"),
});

/**
 * PATCH /api/cowork/enquiries/[id]/stage — Move an enquiry to a new stage
 * Auth: API key with "enquiries:write" scope
 */
export const PATCH = withApiHandler(async (req, context) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  const { id } = await context!.params!;

  try {
    const body = await req.json();
    const data = updateStageSchema.parse(body);

    const existing = await prisma.parentEnquiry.findUnique({
      where: { id },
      select: { stage: true, stageChangedAt: true },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Enquiry not found" },
        { status: 404 },
      );
    }

    const daysInStage = Math.round(
      (Date.now() - existing.stageChangedAt.getTime()) / (1000 * 60 * 60 * 24),
    );

    const enquiry = await prisma.parentEnquiry.update({
      where: { id },
      data: {
        stage: data.stage,
        stageChangedAt: new Date(),
      },
      include: {
        service: { select: { id: true, name: true, code: true } },
      },
    });

    return NextResponse.json({
      success: true,
      enquiry,
      previousStage: existing.stage,
      daysInPreviousStage: daysInStage,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: err.issues[0].message },
        { status: 400 },
      );
    }
    logger.error("Cowork Stage PATCH", { err });
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
});
