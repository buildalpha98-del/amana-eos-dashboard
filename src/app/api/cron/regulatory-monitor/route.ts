import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAI } from "@/lib/ai";
import { AMANA_SYSTEM_PROMPT } from "@/lib/ai-system-prompt";
import { acquireCronLock } from "@/lib/cron-guard";
import { sendTeamsNotification } from "@/lib/teams-notify";
import { withApiHandler } from "@/lib/api-handler";

/**
 * GET /api/cron/regulatory-monitor
 *
 * Weekly cron (Mondays 8 AM UTC) — uses AI to scan for recent OSHC
 * regulatory changes in NSW and VIC and creates a CoworkReport.
 *
 * Auth: Bearer CRON_SECRET
 */
export const GET = withApiHandler(async (req) => {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const guard = await acquireCronLock("regulatory-monitor", "weekly");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const ai = getAI();
    if (!ai) {
      await guard.fail("AI not configured");
      return NextResponse.json({ error: "AI not configured" }, { status: 503 });
    }

    // ── Load template ────────────────────────────────────────
    const template = await prisma.aiPromptTemplate.findUnique({
      where: { slug: "compliance/regulatory-monitor" },
    });

    if (!template) {
      await guard.fail("Template not found");
      return NextResponse.json(
        { error: "AI template compliance/regulatory-monitor not found" },
        { status: 404 },
      );
    }

    // ── Generate ─────────────────────────────────────────────
    const now = new Date();
    const startMs = Date.now();

    const response = await ai.messages.create({
      model: template.model,
      max_tokens: template.maxTokens,
      system: AMANA_SYSTEM_PROMPT,
      messages: [{ role: "user", content: template.promptTemplate }],
    });

    const firstBlock = response.content[0];
    const text = firstBlock.type === "text" ? firstBlock.text : "";
    const durationMs = Date.now() - startMs;

    // ── Determine if there are actionable changes ────────────
    const hasHighImpact = /impact.*(high|critical)/i.test(text);
    const hasActionRequired = /action required/i.test(text);

    const alerts: Array<{ level: string; message: string }> = [];
    if (hasHighImpact) {
      alerts.push({ level: "warning", message: "High-impact regulatory changes detected" });
    }
    if (hasActionRequired) {
      alerts.push({ level: "info", message: "Action required on regulatory updates" });
    }

    // ── Save as CoworkReport ─────────────────────────────────
    const adminUser = await prisma.user.findFirst({
      where: { role: { in: ["owner", "admin"] }, active: true },
      select: { id: true },
    });

    await prisma.coworkReport.create({
      data: {
        seat: "operations",
        reportType: "regulatory-monitor",
        title: `Regulatory Change Monitor — ${now.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`,
        content: text,
        metrics: {
          hasHighImpact,
          hasActionRequired,
          alertCount: alerts.length,
        },
        alerts: alerts.length > 0 ? alerts : undefined,
        assignedToId: adminUser?.id,
      },
    });

    // ── Log AI usage ─────────────────────────────────────────
    if (adminUser) {
      await prisma.aiUsage.create({
        data: {
          userId: adminUser.id,
          templateSlug: "compliance/regulatory-monitor",
          model: template.model,
          inputTokens: response.usage?.input_tokens ?? 0,
          outputTokens: response.usage?.output_tokens ?? 0,
          durationMs,
          section: "compliance",
        },
      });
    }

    // ── Teams notification ───────────────────────────────────
    const summaryLine = alerts.length > 0
      ? `${alerts.length} regulatory alert(s) flagged — review required.`
      : "No significant regulatory changes detected this week.";

    await sendTeamsNotification({
      title: "Regulatory Change Monitor",
      body: summaryLine,
      facts: [
        { title: "Period", value: now.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) },
        { title: "Alerts", value: String(alerts.length) },
      ],
      actions: [
        {
          type: "Action.OpenUrl",
          title: "View in Queue",
          url: `${process.env.NEXTAUTH_URL || "https://dashboard.amanaoshc.com.au"}/queue`,
        },
      ],
    });

    await guard.complete({
      alertCount: alerts.length,
      reportLength: text.length,
    });

    return NextResponse.json({
      success: true,
      alertCount: alerts.length,
      reportLength: text.length,
    });
  } catch (err) {
    await guard.fail(err instanceof Error ? err.message : "Unknown error");
    return NextResponse.json(
      { error: "Failed to generate regulatory monitor report" },
      { status: 500 },
    );
  }
});
