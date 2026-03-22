import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { z } from "zod";

const submitPulseSchema = z.object({
  surveyId: z.string().min(1, "surveyId required"),
  q1Happy: z.number().int().min(1).max(5),
  q2Supported: z.number().int().min(1).max(5),
  q3Schedule: z.number().int().min(1).max(5),
  q4Recommend: z.number().int().min(1).max(5),
  q5Feedback: z.string().optional(),
});

export const GET = withApiAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  const periodMonth = searchParams.get("periodMonth");
  const pending = searchParams.get("pending"); // "true" to get only unsubmitted
  const aggregate = searchParams.get("aggregate"); // "true" for summary stats

  const isStaff = session.user.role === "staff";

  const where: Record<string, unknown> = {};
  if (isStaff) {
    where.userId = session.user.id;
  }
  if (serviceId) where.serviceId = serviceId;
  if (periodMonth) where.periodMonth = periodMonth;
  if (pending === "true") where.submittedAt = null;

  if (aggregate === "true" && !isStaff) {
    // Aggregate stats for admins
    const surveys = await prisma.staffPulseSurvey.findMany({
      where: { ...where, submittedAt: { not: null } },
      select: {
        q1Happy: true,
        q2Supported: true,
        q3Schedule: true,
        q4Recommend: true,
        periodMonth: true,
      },
    });

    const count = surveys.length;
    if (count === 0) {
      return NextResponse.json({ count: 0, averages: null });
    }

    const sum = { q1: 0, q2: 0, q3: 0, q4: 0 };
    surveys.forEach((s) => {
      sum.q1 += s.q1Happy || 0;
      sum.q2 += s.q2Supported || 0;
      sum.q3 += s.q3Schedule || 0;
      sum.q4 += s.q4Recommend || 0;
    });

    return NextResponse.json({
      count,
      averages: {
        q1Happy: +(sum.q1 / count).toFixed(1),
        q2Supported: +(sum.q2 / count).toFixed(1),
        q3Schedule: +(sum.q3 / count).toFixed(1),
        q4Recommend: +(sum.q4 / count).toFixed(1),
        overall: +((sum.q1 + sum.q2 + sum.q3 + sum.q4) / (count * 4)).toFixed(1),
      },
    });
  }

  const surveys = await prisma.staffPulseSurvey.findMany({
    where,
    include: {
      user: { select: { id: true, name: true, email: true } },
      service: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json(surveys);
});

export const POST = withApiAuth(async (req, session) => {
  const body = await req.json();
  const parsed = submitPulseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const { surveyId, q1Happy, q2Supported, q3Schedule, q4Recommend, q5Feedback } = parsed.data;

  // Verify ownership for staff
  const survey = await prisma.staffPulseSurvey.findUnique({
    where: { id: surveyId },
  });

  if (!survey) {
    return NextResponse.json({ error: "Survey not found" }, { status: 404 });
  }

  if (session.user.role === "staff" && survey.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (survey.submittedAt) {
    return NextResponse.json(
      { error: "Survey already submitted" },
      { status: 400 },
    );
  }

  const updated = await prisma.staffPulseSurvey.update({
    where: { id: surveyId },
    data: {
      q1Happy,
      q2Supported,
      q3Schedule,
      q4Recommend,
      q5Feedback: q5Feedback || null,
      submittedAt: new Date(),
    },
  });

  return NextResponse.json(updated);
});
