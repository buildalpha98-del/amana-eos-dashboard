import { getAI } from "@/lib/ai";
import type { BoardReportData } from "@/lib/board-report-generator";

const SECTION_PROMPTS: Record<string, (d: BoardReportData, month: number, year: number) => string> = {
  executive: (d, month, year) => {
    const mName = new Date(year, month - 1).toLocaleDateString("en-AU", { month: "long" });
    return `Write a concise executive summary (3-4 sentences) for the ${mName} ${year} board report.

Key data:
- Revenue: $${d.financial.totalRevenue.toLocaleString()}, Margin: ${Math.round(d.financial.avgMargin)}%
- Revenue trend: ${d.financial.revenueTrend != null ? `${d.financial.revenueTrend >= 0 ? "+" : ""}${Math.round(d.financial.revenueTrend)}% vs prior month` : "No prior data"}
- BSC Occupancy: ${d.operations.avgBscOccupancy}%, ASC Occupancy: ${d.operations.avgAscOccupancy}%
- Active Staff: ${d.people.activeStaff}
- Compliance: ${d.compliance.expired} expired, ${d.compliance.expiringSoon} expiring soon
- Rocks: ${d.rocks.onTrack} on track, ${d.rocks.offTrack} off track, ${d.rocks.complete} complete out of ${d.rocks.total}
- Pipeline: ${d.growth.totalLeads} leads, ${d.growth.newThisMonth} new, ${d.growth.wonThisMonth} won

Highlight the most important metrics and any items needing board attention.`;
  },

  financial: (d, month, year) => {
    const mName = new Date(year, month - 1).toLocaleDateString("en-AU", { month: "long" });
    return `Write a concise financial narrative (2-3 sentences) for ${mName} ${year}.

Data:
- Total Revenue: $${d.financial.totalRevenue.toLocaleString()}
- Total Costs: $${d.financial.totalCosts.toLocaleString()}
- Gross Profit: $${d.financial.grossProfit.toLocaleString()}
- Average Margin: ${Math.round(d.financial.avgMargin)}%
- Revenue Trend: ${d.financial.revenueTrend != null ? `${d.financial.revenueTrend >= 0 ? "+" : ""}${Math.round(d.financial.revenueTrend)}% vs prior month` : "No prior data"}
- Budget Variance: ${d.financial.budgetVariance != null ? `${Math.round(d.financial.budgetVariance)}%` : "No budget set"}
- Revenue by centre: ${d.financial.revenueByService.map((s) => `${s.serviceName}: $${s.revenue.toLocaleString()} (${Math.round(s.margin)}% margin)`).join(", ")}

Focus on trends, notable variances, and any centres performing above or below expectations.`;
  },

  operations: (d, month, year) => {
    const mName = new Date(year, month - 1).toLocaleDateString("en-AU", { month: "long" });
    return `Write a concise operations narrative (2-3 sentences) for ${mName} ${year}.

Data:
- Average BSC Occupancy: ${d.operations.avgBscOccupancy}%
- Average ASC Occupancy: ${d.operations.avgAscOccupancy}%
- By centre: ${d.operations.occupancyByService.map((s) => `${s.serviceName}: BSC ${s.bsc}%, ASC ${s.asc}%`).join("; ")}
- Health Scores: ${d.operations.healthScores.length > 0 ? d.operations.healthScores.map((h) => `${h.serviceName}: ${h.overall} (${h.trend})`).join(", ") : "None recorded"}

Highlight occupancy trends and any centres needing attention.`;
  },

  compliance: (d, month, year) => {
    const mName = new Date(year, month - 1).toLocaleDateString("en-AU", { month: "long" });
    return `Write a concise compliance narrative (2-3 sentences) for ${mName} ${year}.

Data:
- Total Certificates tracked: ${d.compliance.totalCerts}
- Expired: ${d.compliance.expired}
- Expiring Soon: ${d.compliance.expiringSoon}
- Most urgent expiring: ${d.compliance.expiringList.slice(0, 5).map((c) => `${c.type} at ${c.service} (${new Date(c.expiryDate).toLocaleDateString("en-AU")})`).join(", ") || "None"}

Note any compliance risks and recommended actions.`;
  },

  growth: (d, month, year) => {
    const mName = new Date(year, month - 1).toLocaleDateString("en-AU", { month: "long" });
    const stages = Object.entries(d.growth.pipelineByStage).map(([k, v]) => `${k}: ${v}`).join(", ");
    return `Write a concise growth & pipeline narrative (2-3 sentences) for ${mName} ${year}.

Data:
- Total Pipeline Leads: ${d.growth.totalLeads}
- New This Month: ${d.growth.newThisMonth}
- Won: ${d.growth.wonThisMonth}
- Lost: ${d.growth.lostThisMonth}
- Pipeline by Stage: ${stages || "None"}

Focus on conversion trends and pipeline health.`;
  },

  people: (d, month, year) => {
    const mName = new Date(year, month - 1).toLocaleDateString("en-AU", { month: "long" });
    const contracts = Object.entries(d.people.contractBreakdown).map(([k, v]) => `${k}: ${v}`).join(", ");
    const quals = Object.entries(d.people.qualificationSummary).map(([k, v]) => `${k}: ${v}`).join(", ");
    return `Write a concise people narrative (2-3 sentences) for ${mName} ${year}.

Data:
- Active Staff: ${d.people.activeStaff}
- Contract Breakdown: ${contracts || "None recorded"}
- Qualification Summary: ${quals || "None recorded"}

Note staffing adequacy and any qualification gaps.`;
  },

  rocks: (d, month, year) => {
    const mName = new Date(year, month - 1).toLocaleDateString("en-AU", { month: "long" });
    return `Write a concise quarterly rocks narrative (2-3 sentences) for ${mName} ${year}.

Data:
- Quarter: ${d.rocks.quarter}
- Total Rocks: ${d.rocks.total}
- On Track: ${d.rocks.onTrack}, Off Track: ${d.rocks.offTrack}, Complete: ${d.rocks.complete}, Dropped: ${d.rocks.dropped}
- Average Completion: ${d.rocks.avgCompletion}%
- Rocks: ${d.rocks.rockList.slice(0, 10).map((r) => `"${r.title}" (${r.owner}, ${r.percentComplete}%, ${r.status})`).join("; ") || "None"}

Highlight progress, any off-track items, and recommended focus areas.`;
  },
};

export type NarrativeSection =
  | "executive"
  | "financial"
  | "operations"
  | "compliance"
  | "growth"
  | "people"
  | "rocks";

/**
 * Generate an AI narrative for a specific board report section.
 *
 * Uses Claude claude-sonnet-4-5-20250514 via the Anthropic SDK.
 */
export async function generateSectionNarrative(
  section: NarrativeSection,
  data: BoardReportData,
  month: number,
  year: number,
): Promise<string> {
  const ai = getAI();
  if (!ai) {
    throw new Error("AI is not configured. Set ANTHROPIC_API_KEY environment variable.");
  }

  const promptFn = SECTION_PROMPTS[section];
  if (!promptFn) {
    throw new Error(`Unknown section: ${section}`);
  }

  const response = await ai.messages.create({
    model: "claude-sonnet-4-5-20250514",
    max_tokens: 300,
    system:
      "You are a professional board report writer for Amana OSHC, an Australian Outside School Hours Care (OSHC) organisation. " +
      "Write clear, data-driven narratives suitable for board members and investors. " +
      "Use Australian English spelling. Be concise and factual. " +
      "Do not use bullet points — write in flowing prose. " +
      "Do not start with 'In [month]' — vary your opening.",
    messages: [{ role: "user", content: promptFn(data, month, year) }],
  });

  const block = response.content[0];
  if (block.type !== "text") {
    throw new Error("Unexpected AI response format");
  }

  return block.text;
}
