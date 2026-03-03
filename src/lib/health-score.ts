// ─── Centre Health Score Engine ──────────────────────────────────────────────
// Single source of truth for health score calculation across the entire app.
// Replaces duplicated scoring logic in dashboard, performance, and history APIs.

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PillarScore {
  score: number; // 0-100
  breakdown: Record<string, number>; // sub-metric name → score (0-100)
}

export interface HealthScoreResult {
  overallScore: number; // 0-100 weighted
  trend: "improving" | "declining" | "stable";
  status: "green" | "amber" | "red";
  pillars: {
    financial: PillarScore;
    operational: PillarScore;
    compliance: PillarScore;
    satisfaction: PillarScore;
    teamCulture: PillarScore;
  };
}

export interface ScoreInputMetrics {
  bscOccupancy: number;
  ascOccupancy: number;
  ratioCompliance: number;
  overallCompliance: number;
  wwccCompliance: number;
  firstAidCompliance: number;
  parentNps: number | null;
  incidentCount: number;
  complaintCount: number;
  educatorsTurnover: number;
  nqsRating: string | null;
}

export interface ScoreInputFinancials {
  margin: number;
  totalRevenue: number;
  budgetRevenue: number | null;
  bscEnrolments: number;
  ascEnrolments: number;
}

export interface ScoreInputEOS {
  rocksTotal: number;
  rocksOnTrack: number;
  rocksComplete: number;
  todosOverdue: number;
  openIssues: number;
  ticketsTotal: number;
  ticketsResolved: number;
}

// ─── Config ─────────────────────────────────────────────────────────────────

export const PILLAR_WEIGHTS = {
  financial: 0.3,
  operational: 0.25,
  compliance: 0.2,
  satisfaction: 0.15,
  teamCulture: 0.1,
} as const;

export const PILLAR_LABELS: Record<string, string> = {
  financial: "Financial Performance",
  operational: "Operational Excellence",
  compliance: "Compliance & Safety",
  satisfaction: "Family Satisfaction",
  teamCulture: "Team & Culture",
};

export const PILLAR_KEYS = [
  "financial",
  "operational",
  "compliance",
  "satisfaction",
  "teamCulture",
] as const;

// ─── Utilities ──────────────────────────────────────────────────────────────

export function clampedLinear(
  value: number,
  min: number,
  max: number
): number {
  if (max === min) return 100;
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
}

export function getScoreStatus(
  score: number
): "green" | "amber" | "red" {
  if (score >= 75) return "green";
  if (score >= 50) return "amber";
  return "red";
}

export function getTrend(
  current: number,
  previous: number | null
): "improving" | "declining" | "stable" {
  if (previous === null) return "stable";
  const delta = current - previous;
  if (delta > 3) return "improving";
  if (delta < -3) return "declining";
  return "stable";
}

function averageAvailable(scores: (number | null)[]): number {
  const valid = scores.filter((s): s is number => s !== null);
  if (valid.length === 0) return 0;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

// ─── Pillar Computations ────────────────────────────────────────────────────

export function computeFinancialPillar(
  f: ScoreInputFinancials | null
): PillarScore {
  if (!f) return { score: 0, breakdown: {} };

  const breakdown: Record<string, number> = {};
  const scores: (number | null)[] = [];

  // Margin: -10% → 0, 30% → 100
  breakdown.margin = Math.round(clampedLinear(f.margin, -10, 30));
  scores.push(breakdown.margin);

  // Budget variance (only if budget exists)
  if (f.budgetRevenue && f.budgetRevenue > 0) {
    const deviation =
      Math.abs(f.totalRevenue - f.budgetRevenue) / f.budgetRevenue;
    breakdown.budgetVariance = Math.round(
      100 - clampedLinear(deviation * 100, 0, 30)
    );
    scores.push(breakdown.budgetVariance);
  }

  // Revenue per enrolled child
  const totalEnrolments = f.bscEnrolments + f.ascEnrolments;
  if (totalEnrolments > 0) {
    const revPerChild = f.totalRevenue / totalEnrolments;
    // Target: ~$500/child/month is reasonable for OSHC
    breakdown.revenuePerChild = Math.round(
      clampedLinear(revPerChild, 0, 750)
    );
    scores.push(breakdown.revenuePerChild);
  }

  return {
    score: Math.round(averageAvailable(scores)),
    breakdown,
  };
}

export function computeOperationalPillar(
  m: ScoreInputMetrics | null,
  eos: ScoreInputEOS
): PillarScore {
  const breakdown: Record<string, number> = {};
  const scores: (number | null)[] = [];

  if (m) {
    // BSC Occupancy: 30% → 0, 90% → 100
    breakdown.bscOccupancy = Math.round(
      clampedLinear(m.bscOccupancy, 30, 90)
    );
    scores.push(breakdown.bscOccupancy);

    // ASC Occupancy: 30% → 0, 90% → 100
    breakdown.ascOccupancy = Math.round(
      clampedLinear(m.ascOccupancy, 30, 90)
    );
    scores.push(breakdown.ascOccupancy);
  }

  // Rocks completion: (onTrack + complete) / total
  if (eos.rocksTotal > 0) {
    breakdown.rocksCompletion = Math.round(
      ((eos.rocksOnTrack + eos.rocksComplete) / eos.rocksTotal) * 100
    );
  } else {
    breakdown.rocksCompletion = 50; // neutral if no rocks
  }
  scores.push(breakdown.rocksCompletion);

  // Overdue todos: 0 → 100, 10+ → 0
  breakdown.todosOnTime = Math.round(
    100 - clampedLinear(eos.todosOverdue, 0, 10)
  );
  scores.push(breakdown.todosOnTime);

  if (scores.filter((s) => s !== null).length === 0) {
    return { score: 0, breakdown };
  }

  return {
    score: Math.round(averageAvailable(scores)),
    breakdown,
  };
}

export function computeCompliancePillar(
  m: ScoreInputMetrics | null
): PillarScore {
  if (!m) return { score: 0, breakdown: {} };

  const breakdown: Record<string, number> = {};
  const scores: (number | null)[] = [];

  // Overall compliance: 70% → 0, 100% → 100
  breakdown.overallCompliance = Math.round(
    clampedLinear(m.overallCompliance, 70, 100)
  );
  scores.push(breakdown.overallCompliance);

  // WWCC compliance: 80% → 0, 100% → 100
  breakdown.wwccCompliance = Math.round(
    clampedLinear(m.wwccCompliance, 80, 100)
  );
  scores.push(breakdown.wwccCompliance);

  // First Aid compliance: 80% → 0, 100% → 100
  breakdown.firstAidCompliance = Math.round(
    clampedLinear(m.firstAidCompliance, 80, 100)
  );
  scores.push(breakdown.firstAidCompliance);

  // Ratio compliance: 80% → 0, 100% → 100
  breakdown.ratioCompliance = Math.round(
    clampedLinear(m.ratioCompliance, 80, 100)
  );
  scores.push(breakdown.ratioCompliance);

  // Incidents: 0 → 100, 5+ → 0
  breakdown.incidentFree = Math.round(
    100 - clampedLinear(m.incidentCount, 0, 5)
  );
  scores.push(breakdown.incidentFree);

  // NQS Rating
  const nqsMap: Record<string, number> = {
    Exceeding: 100,
    Meeting: 75,
    "Working Towards": 40,
  };
  breakdown.nqsRating = m.nqsRating ? (nqsMap[m.nqsRating] ?? 30) : 30;
  scores.push(breakdown.nqsRating);

  return {
    score: Math.round(averageAvailable(scores)),
    breakdown,
  };
}

export function computeSatisfactionPillar(
  m: ScoreInputMetrics | null,
  eos: ScoreInputEOS
): PillarScore {
  const breakdown: Record<string, number> = {};
  const scores: (number | null)[] = [];

  if (m) {
    // NPS: -20 → 0, 80 → 100
    if (m.parentNps !== null) {
      breakdown.parentNps = Math.round(
        clampedLinear(m.parentNps, -20, 80)
      );
      scores.push(breakdown.parentNps);
    }

    // Complaints: 0 → 100, 5+ → 0
    breakdown.complaintFree = Math.round(
      100 - clampedLinear(m.complaintCount, 0, 5)
    );
    scores.push(breakdown.complaintFree);
  }

  // Ticket resolution rate
  if (eos.ticketsTotal > 0) {
    breakdown.ticketResolution = Math.round(
      (eos.ticketsResolved / eos.ticketsTotal) * 100
    );
  } else {
    breakdown.ticketResolution = 80; // neutral if no tickets
  }
  scores.push(breakdown.ticketResolution);

  if (scores.filter((s) => s !== null).length === 0) {
    return { score: 0, breakdown };
  }

  return {
    score: Math.round(averageAvailable(scores)),
    breakdown,
  };
}

export function computeTeamCulturePillar(
  m: ScoreInputMetrics | null,
  eos: ScoreInputEOS
): PillarScore {
  const breakdown: Record<string, number> = {};
  const scores: (number | null)[] = [];

  if (m) {
    // Turnover: 0% → 100, 30%+ → 0
    breakdown.lowTurnover = Math.round(
      100 - clampedLinear(m.educatorsTurnover, 0, 30)
    );
    scores.push(breakdown.lowTurnover);
  }

  // Open issues: 0 → 100, 8+ → 0
  breakdown.issuesClear = Math.round(
    100 - clampedLinear(eos.openIssues, 0, 8)
  );
  scores.push(breakdown.issuesClear);

  if (scores.filter((s) => s !== null).length === 0) {
    return { score: 0, breakdown };
  }

  return {
    score: Math.round(averageAvailable(scores)),
    breakdown,
  };
}

// ─── Main Computation ───────────────────────────────────────────────────────

export function computeHealthScore(
  metrics: ScoreInputMetrics | null,
  financials: ScoreInputFinancials | null,
  eos: ScoreInputEOS,
  previousOverallScore: number | null
): HealthScoreResult {
  const pillars = {
    financial: computeFinancialPillar(financials),
    operational: computeOperationalPillar(metrics, eos),
    compliance: computeCompliancePillar(metrics),
    satisfaction: computeSatisfactionPillar(metrics, eos),
    teamCulture: computeTeamCulturePillar(metrics, eos),
  };

  const overallScore = Math.round(
    pillars.financial.score * PILLAR_WEIGHTS.financial +
      pillars.operational.score * PILLAR_WEIGHTS.operational +
      pillars.compliance.score * PILLAR_WEIGHTS.compliance +
      pillars.satisfaction.score * PILLAR_WEIGHTS.satisfaction +
      pillars.teamCulture.score * PILLAR_WEIGHTS.teamCulture
  );

  return {
    overallScore: Math.max(0, Math.min(100, overallScore)),
    trend: getTrend(overallScore, previousOverallScore),
    status: getScoreStatus(overallScore),
    pillars,
  };
}
