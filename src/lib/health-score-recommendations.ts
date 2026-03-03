import type {
  HealthScoreResult,
  ScoreInputMetrics,
  ScoreInputFinancials,
  ScoreInputEOS,
} from "./health-score";
import { PILLAR_LABELS } from "./health-score";

export interface Recommendation {
  pillar: string;
  pillarLabel: string;
  severity: "critical" | "warning" | "info";
  message: string;
  metric: string;
  currentValue: number;
  targetValue: number;
}

// ─── Recommendation Generator ───────────────────────────────────────────────

export function generateRecommendations(
  result: HealthScoreResult,
  metrics: ScoreInputMetrics | null,
  financials: ScoreInputFinancials | null,
  eos: ScoreInputEOS
): Recommendation[] {
  const recs: Recommendation[] = [];

  // ── Financial ─────────────────────────────────────────────
  if (financials) {
    if (financials.margin < 0) {
      recs.push({
        pillar: "financial",
        pillarLabel: PILLAR_LABELS.financial,
        severity: "critical",
        message: `Operating at a loss with ${financials.margin.toFixed(1)}% margin`,
        metric: "margin",
        currentValue: financials.margin,
        targetValue: 15,
      });
    } else if (financials.margin < 10) {
      recs.push({
        pillar: "financial",
        pillarLabel: PILLAR_LABELS.financial,
        severity: "warning",
        message: `Margin at ${financials.margin.toFixed(1)}% — target 15%+`,
        metric: "margin",
        currentValue: financials.margin,
        targetValue: 15,
      });
    }

    if (
      financials.budgetRevenue &&
      financials.budgetRevenue > 0
    ) {
      const variance =
        ((financials.totalRevenue - financials.budgetRevenue) /
          financials.budgetRevenue) *
        100;
      if (variance < -15) {
        recs.push({
          pillar: "financial",
          pillarLabel: PILLAR_LABELS.financial,
          severity: "warning",
          message: `Revenue ${Math.abs(variance).toFixed(0)}% below budget`,
          metric: "budgetVariance",
          currentValue: variance,
          targetValue: 0,
        });
      }
    }
  } else {
    recs.push({
      pillar: "financial",
      pillarLabel: PILLAR_LABELS.financial,
      severity: "warning",
      message: "No financial data available — connect Xero or enter manually",
      metric: "dataCompleteness",
      currentValue: 0,
      targetValue: 100,
    });
  }

  // ── Operational ───────────────────────────────────────────
  if (metrics) {
    if (metrics.bscOccupancy < 50) {
      recs.push({
        pillar: "operational",
        pillarLabel: PILLAR_LABELS.operational,
        severity: metrics.bscOccupancy < 35 ? "critical" : "warning",
        message: `BSC occupancy at ${metrics.bscOccupancy.toFixed(0)}% — target 70%+`,
        metric: "bscOccupancy",
        currentValue: metrics.bscOccupancy,
        targetValue: 70,
      });
    }
    if (metrics.ascOccupancy < 50) {
      recs.push({
        pillar: "operational",
        pillarLabel: PILLAR_LABELS.operational,
        severity: metrics.ascOccupancy < 35 ? "critical" : "warning",
        message: `ASC occupancy at ${metrics.ascOccupancy.toFixed(0)}% — target 70%+`,
        metric: "ascOccupancy",
        currentValue: metrics.ascOccupancy,
        targetValue: 70,
      });
    }
  }

  if (eos.todosOverdue > 5) {
    recs.push({
      pillar: "operational",
      pillarLabel: PILLAR_LABELS.operational,
      severity: eos.todosOverdue > 8 ? "critical" : "warning",
      message: `${eos.todosOverdue} overdue to-dos impacting operational score`,
      metric: "todosOverdue",
      currentValue: eos.todosOverdue,
      targetValue: 0,
    });
  }

  // ── Compliance ────────────────────────────────────────────
  if (metrics) {
    if (metrics.wwccCompliance < 100) {
      recs.push({
        pillar: "compliance",
        pillarLabel: PILLAR_LABELS.compliance,
        severity: metrics.wwccCompliance < 90 ? "critical" : "warning",
        message: `WWCC compliance at ${metrics.wwccCompliance.toFixed(0)}% — must be 100%`,
        metric: "wwccCompliance",
        currentValue: metrics.wwccCompliance,
        targetValue: 100,
      });
    }
    if (metrics.firstAidCompliance < 100) {
      recs.push({
        pillar: "compliance",
        pillarLabel: PILLAR_LABELS.compliance,
        severity: metrics.firstAidCompliance < 90 ? "critical" : "warning",
        message: `First Aid compliance at ${metrics.firstAidCompliance.toFixed(0)}% — must be 100%`,
        metric: "firstAidCompliance",
        currentValue: metrics.firstAidCompliance,
        targetValue: 100,
      });
    }
    if (metrics.ratioCompliance < 95) {
      recs.push({
        pillar: "compliance",
        pillarLabel: PILLAR_LABELS.compliance,
        severity: "critical",
        message: `Educator-to-child ratio compliance at ${metrics.ratioCompliance.toFixed(0)}%`,
        metric: "ratioCompliance",
        currentValue: metrics.ratioCompliance,
        targetValue: 100,
      });
    }
    if (metrics.incidentCount >= 3) {
      recs.push({
        pillar: "compliance",
        pillarLabel: PILLAR_LABELS.compliance,
        severity: metrics.incidentCount >= 5 ? "critical" : "warning",
        message: `${metrics.incidentCount} incidents recorded this period`,
        metric: "incidentCount",
        currentValue: metrics.incidentCount,
        targetValue: 0,
      });
    }
  }

  // ── Satisfaction ──────────────────────────────────────────
  if (metrics) {
    if (metrics.parentNps !== null && metrics.parentNps < 30) {
      recs.push({
        pillar: "satisfaction",
        pillarLabel: PILLAR_LABELS.satisfaction,
        severity: metrics.parentNps < 10 ? "critical" : "warning",
        message: `Parent NPS at ${metrics.parentNps} — target 50+`,
        metric: "parentNps",
        currentValue: metrics.parentNps,
        targetValue: 50,
      });
    }
    if (metrics.complaintCount >= 3) {
      recs.push({
        pillar: "satisfaction",
        pillarLabel: PILLAR_LABELS.satisfaction,
        severity: "warning",
        message: `${metrics.complaintCount} complaints this period`,
        metric: "complaintCount",
        currentValue: metrics.complaintCount,
        targetValue: 0,
      });
    }
  }

  // ── Team & Culture ────────────────────────────────────────
  if (metrics && metrics.educatorsTurnover > 15) {
    recs.push({
      pillar: "teamCulture",
      pillarLabel: PILLAR_LABELS.teamCulture,
      severity: metrics.educatorsTurnover > 25 ? "critical" : "warning",
      message: `Educator turnover at ${metrics.educatorsTurnover.toFixed(0)}% — target below 15%`,
      metric: "educatorsTurnover",
      currentValue: metrics.educatorsTurnover,
      targetValue: 15,
    });
  }

  if (eos.openIssues > 5) {
    recs.push({
      pillar: "teamCulture",
      pillarLabel: PILLAR_LABELS.teamCulture,
      severity: eos.openIssues > 8 ? "critical" : "warning",
      message: `${eos.openIssues} open issues — clear the backlog`,
      metric: "openIssues",
      currentValue: eos.openIssues,
      targetValue: 0,
    });
  }

  // ── Positive trends (info) ────────────────────────────────
  for (const [key, pillar] of Object.entries(result.pillars)) {
    if (pillar.score >= 85) {
      recs.push({
        pillar: key,
        pillarLabel: PILLAR_LABELS[key] || key,
        severity: "info",
        message: `${PILLAR_LABELS[key] || key} performing strongly at ${pillar.score}/100`,
        metric: "pillarScore",
        currentValue: pillar.score,
        targetValue: 100,
      });
    }
  }

  // Sort: critical → warning → info
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  recs.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return recs;
}
