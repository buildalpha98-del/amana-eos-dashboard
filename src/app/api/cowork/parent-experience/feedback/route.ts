import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api-key-auth";
import { checkApiKeyRateLimit } from "@/lib/rate-limit";

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

// GET /api/cowork/parent-experience/feedback — per-centre weekly averages for Cowork report
export async function GET(req: NextRequest) {
  const { apiKey, error: authError } = await authenticateApiKey(req, "parent-experience:read");
  if (authError) return authError;

  const { limited } = await checkApiKeyRateLimit(apiKey!.id);
  if (limited) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const serviceCode = searchParams.get("serviceCode");
  const weeks = parseInt(searchParams.get("weeks") || "4");

  const weeksAgo = new Date();
  weeksAgo.setDate(weeksAgo.getDate() - weeks * 7);
  const weekStartCutoff = getWeekStart(weeksAgo);

  const where: any = {
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
    console.error("[Cowork Feedback GET]", err);
    return NextResponse.json({ error: "Failed to fetch feedback" }, { status: 500 });
  }
}
