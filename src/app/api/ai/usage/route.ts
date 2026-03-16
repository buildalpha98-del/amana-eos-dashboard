import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { error } = await requireAuth(["owner", "head_office"]);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get("days") || "30", 10);
  const since = new Date(Date.now() - days * 86400000);

  // All usage rows in period
  const rows = await prisma.aiUsage.findMany({
    where: { createdAt: { gte: since } },
    select: {
      id: true,
      section: true,
      templateSlug: true,
      model: true,
      inputTokens: true,
      outputTokens: true,
      durationMs: true,
      createdAt: true,
      user: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Aggregate by section
  const bySection: Record<string, { calls: number; inputTokens: number; outputTokens: number }> = {};
  // Aggregate by user
  const byUser: Record<string, { name: string; calls: number; inputTokens: number; outputTokens: number }> = {};
  // Aggregate by template
  const byTemplate: Record<string, { calls: number; inputTokens: number; outputTokens: number }> = {};
  // Daily totals
  const byDay: Record<string, { calls: number; inputTokens: number; outputTokens: number }> = {};

  let totalInput = 0;
  let totalOutput = 0;

  for (const r of rows) {
    totalInput += r.inputTokens;
    totalOutput += r.outputTokens;

    // Section
    const sec = r.section || "unknown";
    if (!bySection[sec]) bySection[sec] = { calls: 0, inputTokens: 0, outputTokens: 0 };
    bySection[sec].calls++;
    bySection[sec].inputTokens += r.inputTokens;
    bySection[sec].outputTokens += r.outputTokens;

    // User
    const uid = r.user.id;
    if (!byUser[uid]) byUser[uid] = { name: r.user.name, calls: 0, inputTokens: 0, outputTokens: 0 };
    byUser[uid].calls++;
    byUser[uid].inputTokens += r.inputTokens;
    byUser[uid].outputTokens += r.outputTokens;

    // Template
    const tpl = r.templateSlug || "freeform";
    if (!byTemplate[tpl]) byTemplate[tpl] = { calls: 0, inputTokens: 0, outputTokens: 0 };
    byTemplate[tpl].calls++;
    byTemplate[tpl].inputTokens += r.inputTokens;
    byTemplate[tpl].outputTokens += r.outputTokens;

    // Daily
    const day = r.createdAt.toISOString().slice(0, 10);
    if (!byDay[day]) byDay[day] = { calls: 0, inputTokens: 0, outputTokens: 0 };
    byDay[day].calls++;
    byDay[day].inputTokens += r.inputTokens;
    byDay[day].outputTokens += r.outputTokens;
  }

  // Estimate cost: Sonnet input $3/M, output $15/M; Haiku input $0.25/M, output $1.25/M
  // Simplified: use blended estimate $5/M input, $15/M output
  const estimatedCost = (totalInput * 3 + totalOutput * 15) / 1_000_000;

  return NextResponse.json({
    totalCalls: rows.length,
    totalInput,
    totalOutput,
    estimatedCost: Math.round(estimatedCost * 100) / 100,
    bySection,
    byUser,
    byTemplate,
    byDay,
    days,
  });
}
