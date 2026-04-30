import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";
import { z } from "zod";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

import { parseJsonBody } from "@/lib/api-error";
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

// GET /api/cowork/parent-experience/feedback — per-centre weekly averages for Cowork report
export const GET = withApiHandler(async (req) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const serviceCode = searchParams.get("serviceCode");
  const weeks = parseInt(searchParams.get("weeks") || "4");

  const weeksAgo = new Date();
  weeksAgo.setDate(weeksAgo.getDate() - weeks * 7);
  const weekStartCutoff = getWeekStart(weeksAgo);

  const where: Record<string, unknown> = {
    createdAt: { gte: weekStartCutoff },
  };

  if (serviceCode) {
    const service = await prisma.service.findUnique({ where: { code: serviceCode }, select: { id: true } });
    if (!service) return NextResponse.json({ error: "Service not found" }, { status: 404 });
    where.serviceId = service.id;
  }

  try {
    const feedback = await prisma.quickFeedback.findMany({
      where,
      include: {
        service: { select: { id: true, name: true, code: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Aggregate per centre per week
    const centres: Record<string, {
      serviceName: string;
      serviceCode: string;
      weeks: Record<string, { scores: number[]; lowScoreCount: number }>;
    }> = {};

    for (const fb of feedback) {
      const code = fb.service.code;
      if (!centres[code]) {
        centres[code] = {
          serviceName: fb.service.name,
          serviceCode: code,
          weeks: {},
        };
      }
      const wk = fb.weekStart.toISOString().split("T")[0];
      if (!centres[code].weeks[wk]) centres[code].weeks[wk] = { scores: [], lowScoreCount: 0 };
      centres[code].weeks[wk].scores.push(fb.score);
      if (fb.score <= 2) centres[code].weeks[wk].lowScoreCount++;
    }

    const result = Object.entries(centres).map(([code, data]) => ({
      serviceCode: code,
      serviceName: data.serviceName,
      weeklyAverages: Object.entries(data.weeks)
        .map(([weekStart, w]) => ({
          weekStart,
          average: Math.round((w.scores.reduce((a, b) => a + b, 0) / w.scores.length) * 10) / 10,
          responseCount: w.scores.length,
          lowScoreAlerts: w.lowScoreCount,
        }))
        .sort((a, b) => b.weekStart.localeCompare(a.weekStart)),
    }));

    return NextResponse.json({ centres: result });
  } catch (err) {
    logger.error("Cowork Feedback GET", { err });
    return NextResponse.json({ error: "Failed to fetch feedback" }, { status: 500 });
  }
});

const singleFeedbackSchema = z.object({
  serviceCode: z.string(),
  surveyType: z.enum(["quarterly_survey", "nps", "complaint", "compliment", "suggestion", "exit_survey"]),
  parentName: z.string().optional(),
  parentEmail: z.string().email().optional(),
  childName: z.string().optional(),
  overallRating: z.number().int().min(1).max(5).optional(),
  npsScore: z.number().int().min(0).max(10).optional(),
  responses: z.record(z.string(), z.any()).optional(),
  comments: z.string().optional(),
  sentiment: z.enum(["positive", "neutral", "negative"]).optional(),
  category: z.enum(["safety", "programming", "communication", "food", "staff", "facilities", "booking", "other"]).optional(),
  actionRequired: z.boolean().default(false),
});

const batchFeedbackSchema = z.object({
  feedback: z.array(singleFeedbackSchema).max(100),
});

// POST /api/cowork/parent-experience/feedback — create single or batch ParentFeedback records
export const POST = withApiHandler(async (req) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await parseJsonBody(req);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Detect batch vs single
  const isBatch = typeof body === "object" && body !== null && "feedback" in body;

  if (isBatch) {
    const parsed = batchFeedbackSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 422 });
    }

    const items = parsed.data.feedback;

    // Resolve all unique service codes up front
    const uniqueCodes = [...new Set(items.map((i) => i.serviceCode))];
    const services = await prisma.service.findMany({
      where: { code: { in: uniqueCodes } },
      select: { id: true, code: true },
    });
    const codeToId = Object.fromEntries(services.map((s) => [s.code, s.id]));

    const data = items.map((item) => ({
      serviceId: codeToId[item.serviceCode] ?? null,
      serviceCode: item.serviceCode,
      surveyType: item.surveyType,
      parentName: item.parentName ?? null,
      parentEmail: item.parentEmail ?? null,
      childName: item.childName ?? null,
      overallRating: item.overallRating ?? null,
      npsScore: item.npsScore ?? null,
      responses: item.responses ?? Prisma.DbNull,
      comments: item.comments ?? null,
      sentiment: item.sentiment ?? null,
      category: item.category ?? null,
      actionRequired: item.actionRequired,
    }));

    try {
      const result = await prisma.parentFeedback.createMany({ data });
      return NextResponse.json({ success: true, count: result.count }, { status: 201 });
    } catch (err) {
      logger.error("Cowork Feedback POST batch", { err });
      return NextResponse.json({ error: "Failed to create feedback" }, { status: 500 });
    }
  } else {
    const parsed = singleFeedbackSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 422 });
    }

    const item = parsed.data;
    const service = await prisma.service.findUnique({ where: { code: item.serviceCode }, select: { id: true } });

    try {
      await prisma.parentFeedback.create({
        data: {
          serviceId: service?.id ?? null,
          serviceCode: item.serviceCode,
          surveyType: item.surveyType,
          parentName: item.parentName ?? null,
          parentEmail: item.parentEmail ?? null,
          childName: item.childName ?? null,
          overallRating: item.overallRating ?? null,
          npsScore: item.npsScore ?? null,
          responses: item.responses ?? Prisma.DbNull,
          comments: item.comments ?? null,
          sentiment: item.sentiment ?? null,
          category: item.category ?? null,
          actionRequired: item.actionRequired,
        },
      });
      return NextResponse.json({ success: true, count: 1 }, { status: 201 });
    } catch (err) {
      logger.error("Cowork Feedback POST single", { err });
      return NextResponse.json({ error: "Failed to create feedback" }, { status: 500 });
    }
  }
});
