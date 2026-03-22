import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAI } from "@/lib/ai";
import { AMANA_SYSTEM_PROMPT } from "@/lib/ai-system-prompt";
import { acquireCronLock } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";

/**
 * GET /api/cron/compliance-risk-report
 *
 * Weekly cron — generates an AI-powered compliance risk report and saves it
 * as a CoworkReport for the head office queue.
 *
 * Auth: Bearer CRON_SECRET
 */
export const GET = withApiHandler(async (req) => {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const guard = await acquireCronLock("compliance-risk-report", "weekly");
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
    const in14d = new Date(now.getTime() + 14 * 86400000);
    const in90d = new Date(now.getTime() + 90 * 86400000);

    // ── Gather data ─────────────────────────────────────────

    // 1. Expiring certificates (next 90 days)
    const expiringCerts = await prisma.complianceCertificate.findMany({
      where: { expiryDate: { lte: in90d } },
      include: {
        user: { select: { name: true } },
        service: { select: { name: true, code: true } },
      },
      orderBy: { expiryDate: "asc" },
    });

    const expiringCertsText = expiringCerts.length > 0
      ? expiringCerts.map((c) => {
          const daysLeft = Math.ceil((new Date(c.expiryDate).getTime() - now.getTime()) / 86400000);
          const urgency = daysLeft <= 0 ? "EXPIRED" : daysLeft <= 14 ? "URGENT" : "upcoming";
          return `- [${urgency}] ${c.type} — ${c.user?.name ?? "Unknown"} at ${c.service.name} (${daysLeft <= 0 ? "expired" : `expires in ${daysLeft} days`})`;
        }).join("\n")
      : "No certificates expiring in next 90 days.";

    // 2. Overdue audits
    const overdueAudits = await prisma.auditInstance.findMany({
      where: { status: "overdue" },
      include: {
        template: { select: { name: true, qualityArea: true } },
        service: { select: { name: true, code: true } },
      },
    });

    const overdueAuditsText = overdueAudits.length > 0
      ? overdueAudits.map((a) => `- ${a.template.name} (QA${a.template.qualityArea}) — ${a.service.name}, due ${a.dueDate.toISOString().split("T")[0]}`).join("\n")
      : "No overdue audits.";

    // 3. Qualification ratio gaps
    const services = await prisma.service.findMany({
      where: { status: "active" },
      select: { id: true, name: true, code: true },
    });

    let qualificationGapsText = "No data available.";
    try {
      const ratioRes = await fetch(
        `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/api/compliance/qualification-ratios`,
        { headers: { cookie: "" } }
      );
      if (ratioRes.ok) {
        const ratios = await ratioRes.json();
        const gaps = (ratios as Array<{ serviceName: string; diplomaPct: number; below50: boolean }>)
          .filter((r) => r.below50);
        qualificationGapsText = gaps.length > 0
          ? gaps.map((g) => `- ${g.serviceName}: ${g.diplomaPct}% diploma-qualified (below 50% threshold)`).join("\n")
          : "All centres meet qualification ratio thresholds.";
      }
    } catch {
      qualificationGapsText = "Unable to fetch qualification ratios.";
    }

    const servicesText = services.map((s) => `${s.name} (${s.code})`).join(", ");

    // ── Load template ─────────────────────────────────────────

    const template = await prisma.aiPromptTemplate.findUnique({
      where: { slug: "compliance/risk-report" },
    });

    if (!template) {
      await guard.fail("Template not found");
      return NextResponse.json({ error: "AI template compliance/risk-report not found" }, { status: 404 });
    }

    // ── Interpolate ─────────────────────────────────────────

    let prompt = template.promptTemplate;
    prompt = prompt.replaceAll("{{expiringCerts}}", expiringCertsText);
    prompt = prompt.replaceAll("{{overdueAudits}}", overdueAuditsText);
    prompt = prompt.replaceAll("{{qualificationGaps}}", qualificationGapsText);
    prompt = prompt.replaceAll("{{servicesData}}", servicesText);

    // ── Generate ─────────────────────────────────────────────

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

    // ── Determine severity ──────────────────────────────────

    const hasExpired = expiringCerts.some((c) => new Date(c.expiryDate) <= now);
    const hasUrgent = expiringCerts.some((c) => new Date(c.expiryDate) <= in14d);
    const alerts: Array<{ level: string; message: string }> = [];
    if (hasExpired) alerts.push({ level: "critical", message: "Expired certificates require immediate action" });
    if (hasUrgent) alerts.push({ level: "warning", message: "Certificates expiring within 14 days" });
    if (overdueAudits.length > 0) alerts.push({ level: "warning", message: `${overdueAudits.length} overdue audit(s)` });

    // ── Save as CoworkReport ────────────────────────────────

    // Find admin user for assignment
    const adminUser = await prisma.user.findFirst({
      where: { role: { in: ["owner", "admin"] }, active: true },
      select: { id: true },
    });

    await prisma.coworkReport.create({
      data: {
        seat: "operations",
        reportType: "compliance-risk-report",
        title: `Weekly Compliance Risk Report — ${now.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`,
        content: text,
        metrics: {
          expiringCerts: expiringCerts.length,
          overdueAudits: overdueAudits.length,
          totalCentres: services.length,
        },
        alerts: alerts.length > 0 ? alerts : undefined,
        assignedToId: adminUser?.id,
      },
    });

    // ── Log AI usage ────────────────────────────────────────

    if (adminUser) {
      await prisma.aiUsage.create({
        data: {
          userId: adminUser.id,
          templateSlug: "compliance/risk-report",
          model: template.model,
          inputTokens: response.usage?.input_tokens ?? 0,
          outputTokens: response.usage?.output_tokens ?? 0,
          durationMs,
          section: "compliance",
        },
      });
    }

    await guard.complete({
      expiringCerts: expiringCerts.length,
      overdueAudits: overdueAudits.length,
      reportLength: text.length,
    });

    return NextResponse.json({
      success: true,
      expiringCerts: expiringCerts.length,
      overdueAudits: overdueAudits.length,
    });
  } catch (err) {
    await guard.fail(err instanceof Error ? err.message : "Unknown error");
    return NextResponse.json(
      { error: "Failed to generate compliance risk report" },
      { status: 500 },
    );
  }
});
