import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

const completeSchema = z.object({
  reason: z.enum([
    "moved_schools",
    "no_longer_need_care",
    "cost",
    "unhappy_with_service",
    "child_did_not_enjoy",
    "schedule_change",
    "other",
  ]),
  reasonDetail: z.string().max(2000).optional().nullable(),
  satisfactionScore: z.number().int().min(1).max(5),
  enjoyedMost: z.string().max(2000).optional().nullable(),
  couldImprove: z.string().max(2000).optional().nullable(),
  wouldReturn: z.enum(["yes", "maybe", "no"]),
});

// GET /api/exit-survey/[token] — public, returns survey data if token valid
export const GET = withApiHandler(async (req, context) => {
  const { token } = await context!.params!;

  const survey = await prisma.exitSurvey.findUnique({
    where: { surveyToken: token },
    select: {
      id: true,
      childName: true,
      withdrawalDate: true,
      completedAt: true,
      tokenExpiresAt: true,
      service: { select: { name: true } },
    },
  });

  if (!survey) {
    return NextResponse.json({ error: "Survey not found" }, { status: 404 });
  }

  if (new Date() > survey.tokenExpiresAt) {
    return NextResponse.json({ error: "Survey link has expired" }, { status: 410 });
  }

  return NextResponse.json(survey);
});

// PATCH /api/exit-survey/[token] — public, completes the survey
export const PATCH = withApiHandler(async (req, context) => {
  const { token } = await context!.params!;

  try {
    const survey = await prisma.exitSurvey.findUnique({
      where: { surveyToken: token },
    });

    if (!survey) {
      return NextResponse.json({ error: "Survey not found" }, { status: 404 });
    }

    if (new Date() > survey.tokenExpiresAt) {
      return NextResponse.json({ error: "Survey link has expired" }, { status: 410 });
    }

    if (survey.completedAt) {
      return NextResponse.json({ error: "Survey already completed" }, { status: 400 });
    }

    const body = await req.json();
    const data = completeSchema.parse(body);

    const updated = await prisma.exitSurvey.update({
      where: { surveyToken: token },
      data: {
        reason: data.reason,
        reasonDetail: data.reasonDetail || null,
        satisfactionScore: data.satisfactionScore,
        enjoyedMost: data.enjoyedMost || null,
        couldImprove: data.couldImprove || null,
        wouldReturn: data.wouldReturn,
        completedAt: new Date(),
      },
    });

    return NextResponse.json({ message: "Survey completed", id: updated.id });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0].message }, { status: 400 });
    }
    logger.error("ExitSurvey PATCH", { err });
    return NextResponse.json({ error: "Failed to complete survey" }, { status: 500 });
  }
});
