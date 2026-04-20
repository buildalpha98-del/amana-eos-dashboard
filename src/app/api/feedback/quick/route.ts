import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { getServiceScope } from "@/lib/service-scope";
import { withApiHandler } from "@/lib/api-handler";
import { withApiAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";

import { parseJsonBody } from "@/lib/api-error";
const feedbackSchema = z.object({
  serviceId: z.string().min(1),
  score: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional().nullable(),
  parentName: z.string().max(200).optional().nullable(),
  parentEmail: z.string().email().optional().nullable(),
});

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function hashIp(ip: string): string {
  return createHash("sha256").update(ip + (process.env.CRON_SECRET || "salt")).digest("hex").slice(0, 16);
}

// POST /api/feedback/quick — public, rate-limited
export const POST = withApiHandler(async (req) => {
    const body = await parseJsonBody(req);
    const data = feedbackSchema.parse(body);

    // Verify service exists
    const service = await prisma.service.findUnique({
      where: { id: data.serviceId },
      select: { id: true, name: true },
    });
    if (!service) {
      return NextResponse.json({ error: "Service not found" }, { status: 404 });
    }

    // Rate limit: max 3 submissions per IP per day
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
    const ipHashed = hashIp(ip);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayCount = await prisma.quickFeedback.count({
      where: {
        ipHash: ipHashed,
        createdAt: { gte: todayStart },
      },
    });

    if (todayCount >= 3) {
      return NextResponse.json(
        { error: "You have already submitted feedback today. Please try again tomorrow." },
        { status: 429 }
      );
    }

    const weekStart = getWeekStart(new Date());

    const feedback = await prisma.quickFeedback.create({
      data: {
        serviceId: data.serviceId,
        weekStart,
        score: data.score,
        comment: data.comment || null,
        parentName: data.parentName || null,
        parentEmail: data.parentEmail || null,
        ipHash: ipHashed,
      },
    });

    // Low score alert — create a CoworkAnnouncement for scores 1-2
    if (data.score <= 2) {
      try {
        await prisma.coworkAnnouncement.create({
          data: {
            title: `⚠️ Low Parent Feedback Alert — ${service.name}`,
            body: `A parent rated their child's experience ${data.score}/5 at ${service.name}.${data.comment ? `\n\nComment: "${data.comment}"` : ""}${data.parentName ? `\nParent: ${data.parentName}` : " (anonymous)"}\n\nPlease follow up with the coordinator.`,
            type: "parent-alert",
            targetCentres: [data.serviceId],
          },
        });
      } catch (e) {
        logger.error("QuickFeedback: Failed to create alert", { e });
      }
    }

    return NextResponse.json({ id: feedback.id, message: "Feedback submitted" }, { status: 201 });
  });

// GET /api/feedback/quick — auth required, returns aggregated feedback
export const GET = withApiAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  const weeks = parseInt(searchParams.get("weeks") || "8");

  const serviceScope = getServiceScope(session!);

  const weeksAgo = new Date();
  weeksAgo.setDate(weeksAgo.getDate() - weeks * 7);
  const weekStartCutoff = getWeekStart(weeksAgo);

  const where: Record<string, unknown> = {
    createdAt: { gte: weekStartCutoff },
  };

  // Filter by specific service or user's service scope
  if (serviceId) {
    where.serviceId = serviceId;
  } else if (serviceScope) {
    where.serviceId = serviceScope;
  }

  try {
    const feedback = await prisma.quickFeedback.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        service: { select: { id: true, name: true, code: true } },
      },
    });

    // Aggregate per service per week
    const byServiceWeek: Record<string, Record<string, { scores: number[]; comments: string[]; count: number }>> = {};

    for (const fb of feedback) {
      const sId = fb.serviceId;
      const wk = fb.weekStart.toISOString().split("T")[0];
      if (!byServiceWeek[sId]) byServiceWeek[sId] = {};
      if (!byServiceWeek[sId][wk]) byServiceWeek[sId][wk] = { scores: [], comments: [], count: 0 };
      byServiceWeek[sId][wk].scores.push(fb.score);
      byServiceWeek[sId][wk].count++;
      if (fb.comment) byServiceWeek[sId][wk].comments.push(fb.comment);
    }

    // Build response
    const services = Object.entries(byServiceWeek).map(([sId, weeks]) => {
      const svc = feedback.find((f) => f.serviceId === sId)?.service;
      const weeklyData = Object.entries(weeks)
        .map(([weekStart, data]) => {
          const avg = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
          const distribution = [0, 0, 0, 0, 0];
          data.scores.forEach((s) => distribution[s - 1]++);
          return {
            weekStart,
            averageScore: Math.round(avg * 10) / 10,
            count: data.count,
            distribution,
            comments: data.comments,
          };
        })
        .sort((a, b) => b.weekStart.localeCompare(a.weekStart));

      const allScores = Object.values(weeks).flatMap((w) => w.scores);
      const overallAvg = allScores.length > 0
        ? Math.round((allScores.reduce((a, b) => a + b, 0) / allScores.length) * 10) / 10
        : null;

      return {
        serviceId: sId,
        serviceName: svc?.name || "Unknown",
        serviceCode: svc?.code || "",
        overallAverage: overallAvg,
        totalResponses: allScores.length,
        weeklyData,
      };
    });

    return NextResponse.json({ services });
  } catch (err) {
    logger.error("QuickFeedback GET", { err });
    return NextResponse.json({ error: "Failed to fetch feedback" }, { status: 500 });
  }
});
