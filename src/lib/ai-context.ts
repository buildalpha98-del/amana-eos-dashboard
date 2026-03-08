import { prisma } from "@/lib/prisma";

// ── In-memory cache with 5-minute TTL ────────────────────
let _cachedContext: string | null = null;
let _cachedAt = 0;
const TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Build a structured text summary of current dashboard data
 * for use as AI system prompt context.
 *
 * Cached in memory for 5 minutes to avoid repeated DB hits.
 */
export async function buildDashboardContext(): Promise<string> {
  const now = Date.now();
  if (_cachedContext && now - _cachedAt < TTL) {
    return _cachedContext;
  }

  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
  const currentQuarter = `Q${Math.ceil((today.getMonth() + 1) / 3)}-${today.getFullYear()}`;

  const [
    financials,
    staffCount,
    leadStats,
    rocks,
    services,
    recentReport,
  ] = await Promise.all([
    prisma.financialPeriod.findMany({
      where: { periodType: "monthly", periodStart: { gte: firstOfMonth, lte: lastOfMonth } },
      include: { service: { select: { name: true } } },
    }),
    prisma.user.count({ where: { active: true, role: { in: ["staff", "member"] } } }),
    prisma.lead.groupBy({
      by: ["pipelineStage"],
      where: { deleted: false },
      _count: { pipelineStage: true },
    }),
    prisma.rock.findMany({
      where: { deleted: false, quarter: currentQuarter },
      select: { title: true, status: true, percentComplete: true, owner: { select: { name: true } } },
    }),
    prisma.service.findMany({
      where: { status: "active" },
      select: { name: true, code: true, capacity: true },
    }),
    prisma.boardReport.findFirst({
      orderBy: [{ year: "desc" }, { month: "desc" }],
      select: { month: true, year: true, status: true, data: true },
    }),
  ]);

  // ── Build context string ─────────────────────────────────
  const lines: string[] = [
    `=== Amana OSHC Dashboard Context (as of ${today.toLocaleDateString("en-AU")}) ===`,
    "",
    `Organisation: Amana OSHC (Outside School Hours Care, Australia)`,
    `Active Services: ${services.length}`,
    services.map((s) => `  - ${s.name} (${s.code}${s.capacity ? `, ${s.capacity} places` : ""})`).join("\n"),
    "",
    `Active Staff: ${staffCount}`,
    "",
  ];

  // Financial summary
  if (financials.length > 0) {
    const totalRev = financials.reduce((s, f) => s + f.totalRevenue, 0);
    const totalCost = financials.reduce((s, f) => s + f.totalCosts, 0);
    const profit = totalRev - totalCost;
    lines.push(
      `Current Month Financials:`,
      `  Revenue: $${totalRev.toLocaleString()}`,
      `  Costs: $${totalCost.toLocaleString()}`,
      `  Profit: $${profit.toLocaleString()}`,
      `  Margin: ${totalRev > 0 ? Math.round((profit / totalRev) * 100) : 0}%`,
      `  By Centre: ${financials.map((f) => `${f.service.name}: $${f.totalRevenue.toLocaleString()}`).join(", ")}`,
      "",
    );
  }

  // Pipeline
  if (leadStats.length > 0) {
    const total = leadStats.reduce((s, l) => s + l._count.pipelineStage, 0);
    lines.push(
      `CRM Pipeline: ${total} leads`,
      leadStats.map((l) => `  ${l.pipelineStage}: ${l._count.pipelineStage}`).join("\n"),
      "",
    );
  }

  // Rocks
  if (rocks.length > 0) {
    const onTrack = rocks.filter((r) => r.status === "on_track").length;
    const complete = rocks.filter((r) => r.status === "complete").length;
    const offTrack = rocks.filter((r) => r.status === "off_track").length;
    lines.push(
      `Quarterly Rocks (${currentQuarter}): ${rocks.length} total`,
      `  On Track: ${onTrack}, Complete: ${complete}, Off Track: ${offTrack}`,
      rocks.map((r) => `  - ${r.title} (${r.owner.name}, ${r.percentComplete}%, ${r.status})`).join("\n"),
      "",
    );
  }

  // Latest board report summary
  if (recentReport) {
    const mName = new Date(recentReport.year, recentReport.month - 1).toLocaleDateString("en-AU", { month: "long" });
    lines.push(
      `Latest Board Report: ${mName} ${recentReport.year} (${recentReport.status})`,
      "",
    );
  }

  const context = lines.join("\n");
  _cachedContext = context;
  _cachedAt = now;

  return context;
}
