import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAI } from "@/lib/ai";
import { AMANA_SYSTEM_PROMPT } from "@/lib/ai-system-prompt";
import { acquireCronLock } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";

/**
 * GET /api/cron/sentiment-analysis
 *
 * Weekly cron — analyses NPS responses and QuickFeedback from the past week,
 * scores sentiment for each, and generates a summary CoworkReport.
 *
 * Auth: Bearer CRON_SECRET
 */
export const GET = withApiHandler(async (req) => {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const guard = await acquireCronLock("sentiment-analysis", "weekly");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const ai = getAI();
    if (!ai) {
      await guard.fail("AI not configured");
      return NextResponse.json({ error: "AI not configured" }, { status: 503 });
    }

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);

    // Gather NPS responses from past week
    const npsResponses = await prisma.npsSurveyResponse.findMany({
      where: { createdAt: { gte: weekAgo } },
      include: { service: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });

    // Gather QuickFeedback from past week
    const quickFeedback = await prisma.quickFeedback.findMany({
      where: { createdAt: { gte: weekAgo } },
      include: { service: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });

    if (npsResponses.length === 0 && quickFeedback.length === 0) {
      await guard.complete({ message: "No feedback to analyse" });
      return NextResponse.json({ success: true, message: "No feedback this week" });
    }

    const services = await prisma.service.findMany({
      where: { status: "active" },
      select: { name: true },
    });

    const npsText =
      npsResponses
        .map(
          (r) =>
            `- [${r.category}] Score: ${r.score}/10 | Centre: ${r.service?.name ?? "Unknown"} | Comment: "${r.comment ?? "No comment"}" | ID: ${r.id}`,
        )
        .join("\n") || "No NPS responses this week.";

    const feedbackText =
      quickFeedback
        .map(
          (f) =>
            `- Score: ${f.score}/5 | Centre: ${f.service?.name ?? "Unknown"} | Comment: "${f.comment ?? "No comment"}" | ID: ${f.id}`,
        )
        .join("\n") || "No quick feedback this week.";

    // Load template
    const template = await prisma.aiPromptTemplate.findUnique({
      where: { slug: "sentiment/weekly-analysis" },
    });

    if (!template) {
      await guard.fail("Template not found");
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    let prompt = template.promptTemplate;
    prompt = prompt.replaceAll("{{npsResponses}}", npsText);
    prompt = prompt.replaceAll("{{quickFeedback}}", feedbackText);
    prompt = prompt.replaceAll(
      "{{period}}",
      `${weekAgo.toLocaleDateString("en-AU")} — ${now.toLocaleDateString("en-AU")}`,
    );
    prompt = prompt.replaceAll(
      "{{serviceNames}}",
      services.map((s) => s.name).join(", "),
    );

    const startMs = Date.now();
    const response = await ai.messages.create({
      model: template.model,
      max_tokens: template.maxTokens,
      system: AMANA_SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });

    const firstBlock = response.content[0];
    const text = firstBlock.type === "text" ? firstBlock.text : "";
    const durationMs = Date.now() - startMs;

    // Parse AI response
    let parsed: {
      scores?: Array<{
        sourceType: string;
        sourceId: string;
        score: number;
        label: string;
        keywords: string[];
        summary: string;
      }>;
      reportMarkdown?: string;
    } = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      // If JSON parsing fails, use raw text as report
      parsed = { reportMarkdown: text, scores: [] };
    }

    // Save individual sentiment scores
    if (parsed.scores && Array.isArray(parsed.scores)) {
      for (const s of parsed.scores) {
        const npsMatch = npsResponses.find((r) => r.id === s.sourceId);
        const feedbackMatch = quickFeedback.find((f) => f.id === s.sourceId);
        const serviceId = npsMatch?.serviceId ?? feedbackMatch?.serviceId ?? null;

        await prisma.sentimentScore.upsert({
          where: {
            sourceType_sourceId: {
              sourceType: s.sourceType,
              sourceId: s.sourceId,
            },
          },
          update: {
            score: s.score,
            label: s.label,
            keywords: s.keywords,
            summary: s.summary,
            serviceId,
          },
          create: {
            sourceType: s.sourceType,
            sourceId: s.sourceId,
            score: s.score,
            label: s.label,
            keywords: s.keywords,
            summary: s.summary,
            serviceId,
          },
        });
      }
    }

    // Save CoworkReport
    const adminUser = await prisma.user.findFirst({
      where: { role: { in: ["owner", "admin"] }, active: true },
      select: { id: true },
    });

    const positiveCount = (parsed.scores ?? []).filter((s) => s.label === "positive").length;
    const negativeCount = (parsed.scores ?? []).filter((s) => s.label === "negative").length;

    await prisma.coworkReport.create({
      data: {
        seat: "parent-experience",
        reportType: "sentiment-analysis",
        title: `Weekly Sentiment Report — ${now.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`,
        content: parsed.reportMarkdown ?? text,
        metrics: {
          npsCount: npsResponses.length,
          feedbackCount: quickFeedback.length,
          positiveCount,
          negativeCount,
        },
        alerts:
          negativeCount > 0
            ? [{ level: "warning", message: `${negativeCount} negative sentiment response(s) this week` }]
            : undefined,
        assignedToId: adminUser?.id,
      },
    });

    // Log AI usage
    if (adminUser) {
      await prisma.aiUsage.create({
        data: {
          userId: adminUser.id,
          templateSlug: "sentiment/weekly-analysis",
          model: template.model,
          inputTokens: response.usage?.input_tokens ?? 0,
          outputTokens: response.usage?.output_tokens ?? 0,
          durationMs,
          section: "sentiment",
        },
      });
    }

    await guard.complete({
      npsCount: npsResponses.length,
      feedbackCount: quickFeedback.length,
      scoresCreated: parsed.scores?.length ?? 0,
    });

    return NextResponse.json({
      success: true,
      npsCount: npsResponses.length,
      feedbackCount: quickFeedback.length,
    });
  } catch (err) {
    await guard.fail(err instanceof Error ? err.message : "Unknown error");
    return NextResponse.json({ error: "Failed to run sentiment analysis" }, { status: 500 });
  }
});
