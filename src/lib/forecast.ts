/**
 * Forward-looking analytics v1 (2026-07-06).
 *
 * Pure, deterministic projection math — no AI, no I/O. The API layer
 * feeds it weekly attendance aggregates and enquiry funnel counts;
 * this module owns the fitting and the judgement calls (trend labels,
 * capacity ETA, under-target detection) so they're unit-testable.
 *
 * Occupancy model: ordinary least squares over the last N weekly
 * points (average daily attendance per week), projected linearly.
 * Deliberately simple — OSHC demand moves in slow term-time trends,
 * and a transparent line beats an opaque model for operator trust.
 * Term-break weeks show up as low outliers; callers can exclude them
 * before fitting if they want (v1 does not).
 */

// ── Types ──────────────────────────────────────────────────────────

export interface WeekPoint {
  /** ISO date (Monday) of the week. */
  weekStart: string;
  /** Average daily attendance (attended + casual) across the week. */
  value: number;
}

export interface ForecastPoint {
  weekStart: string;
  projected: number;
}

export type OccupancyTrend = "growing" | "flat" | "declining";

export interface OccupancyForecast {
  /** Fitted weekly change in average daily attendance. */
  slopePerWeek: number;
  trend: OccupancyTrend;
  /** Last observed week's value. */
  current: number;
  /** current / capacity, null when capacity unknown. */
  utilisationNow: number | null;
  /** Projected utilisation at the final forecast week. */
  utilisationAtHorizon: number | null;
  /** Weeks until projected value reaches capacity; null if never/unknown. */
  weeksToCapacity: number | null;
  points: ForecastPoint[];
}

export const MIN_HISTORY_WEEKS = 4;
const DAY_MS = 24 * 60 * 60 * 1000;

// ── Fitting ────────────────────────────────────────────────────────

/** Ordinary least squares y = a + b·x over x = 0..n-1. */
export function linearFit(values: number[]): { slope: number; intercept: number } {
  const n = values.length;
  if (n === 0) return { slope: 0, intercept: 0 };
  if (n === 1) return { slope: 0, intercept: values[0] };
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (values[i] - meanY);
    den += (i - meanX) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  return { slope, intercept: meanY - slope * meanX };
}

/**
 * Project average daily attendance `weeksAhead` weeks forward.
 * Returns null when there's not enough history to say anything
 * honest (fewer than MIN_HISTORY_WEEKS observed weeks).
 */
export function forecastOccupancy(
  history: WeekPoint[],
  weeksAhead: number,
  capacity: number | null,
): OccupancyForecast | null {
  const sorted = [...history].sort((a, b) =>
    a.weekStart.localeCompare(b.weekStart),
  );
  if (sorted.length < MIN_HISTORY_WEEKS) return null;

  const values = sorted.map((p) => p.value);
  const { slope, intercept } = linearFit(values);
  const n = values.length;
  const current = values[n - 1];
  const lastWeekStart = new Date(`${sorted[n - 1].weekStart}T00:00:00.000Z`);

  const points: ForecastPoint[] = [];
  for (let k = 1; k <= weeksAhead; k++) {
    const raw = intercept + slope * (n - 1 + k);
    const projected =
      Math.round(
        Math.min(
          // A projection above physical capacity is noise, not insight.
          capacity && capacity > 0 ? capacity : Number.POSITIVE_INFINITY,
          Math.max(0, raw),
        ) * 10,
      ) / 10;
    points.push({
      weekStart: new Date(lastWeekStart.getTime() + k * 7 * DAY_MS)
        .toISOString()
        .slice(0, 10),
      projected,
    });
  }

  // Trend: material means moving more than ~2% of capacity (or 0.5
  // kids/week when capacity is unknown) each week.
  const materialSlope = capacity && capacity > 0 ? capacity * 0.02 : 0.5;
  const trend: OccupancyTrend =
    slope >= materialSlope ? "growing" : slope <= -materialSlope ? "declining" : "flat";

  let weeksToCapacity: number | null = null;
  if (capacity && capacity > 0 && slope > 0 && current < capacity) {
    const raw = Math.ceil((capacity - (intercept + slope * (n - 1))) / slope);
    weeksToCapacity = raw >= 0 ? raw : 0;
  } else if (capacity && capacity > 0 && current >= capacity) {
    weeksToCapacity = 0;
  }

  const horizon = points[points.length - 1]?.projected ?? current;
  return {
    slopePerWeek: Math.round(slope * 100) / 100,
    trend,
    current,
    utilisationNow:
      capacity && capacity > 0 ? Math.round((current / capacity) * 100) / 100 : null,
    utilisationAtHorizon:
      capacity && capacity > 0 ? Math.round((horizon / capacity) * 100) / 100 : null,
    weeksToCapacity,
    points,
  };
}

// ── Enquiry pipeline ───────────────────────────────────────────────

/** Stages that count as an open, workable pipeline. */
export const OPEN_PIPELINE_STAGES = [
  "new_enquiry",
  "info_sent",
  "nurturing",
  "form_started",
] as const;

/** Stages meaning the family converted (enrolled or beyond). */
export const CONVERTED_STAGES = [
  "enrolled",
  "first_session",
  "day3",
  "week2",
  "month1",
  "retained",
] as const;

/**
 * How much more likely an enquiry is to convert as it moves down the
 * funnel, relative to the blended historical rate. v1 heuristic — the
 * data model stores only each enquiry's current stage, not its
 * transition history, so true per-stage rates aren't computable yet.
 * Revisit once stage-transition events are logged.
 */
export const STAGE_PROGRESSION_MULTIPLIER: Record<
  (typeof OPEN_PIPELINE_STAGES)[number],
  number
> = {
  new_enquiry: 0.6,
  info_sent: 0.8,
  nurturing: 1.0,
  form_started: 1.6,
};

const MAX_STAGE_RATE = 0.95;

/**
 * Real per-stage conversion rates learned from ParentEnquiryStageEvent
 * journeys (lib/funnel-rates.ts). When supplied, they override the
 * fixed progression multipliers stage-by-stage.
 */
export interface StageRates {
  /** Distinct resolved journeys the rates were learned from. */
  sampleSize: number;
  byStage: Partial<Record<(typeof OPEN_PIPELINE_STAGES)[number], number>>;
}

export interface PipelineStageForecast {
  stage: (typeof OPEN_PIPELINE_STAGES)[number];
  open: number;
  rate: number;
  /** Where this stage's rate came from. */
  source: "observed" | "heuristic";
  expected: number;
}

export interface PipelineForecast {
  openTotal: number;
  /** Blended historical conversion rate (converted / resolved). */
  baseRate: number | null;
  expectedEnrolments: number;
  /** "observed" once enough stage-event journeys exist (per-stage
   *  fallback to heuristic still possible — see byStage[].source). */
  ratesSource: "observed" | "heuristic";
  observedSampleSize: number | null;
  byStage: PipelineStageForecast[];
}

/**
 * Expected enrolments from the current open pipeline.
 * `historicalConverted` / `historicalCold` are counts of RESOLVED
 * enquiries (reached a converted stage vs went cold). Returns
 * baseRate=null (and zero expectations) when there's no resolved
 * history to learn from.
 */
export function forecastPipeline(
  openByStage: Partial<Record<string, number>>,
  historicalConverted: number,
  historicalCold: number,
  observed: StageRates | null = null,
): PipelineForecast {
  const resolved = historicalConverted + historicalCold;
  const baseRate = resolved > 0 ? historicalConverted / resolved : null;

  const byStage: PipelineStageForecast[] = OPEN_PIPELINE_STAGES.map((stage) => {
    const open = openByStage[stage] ?? 0;
    const observedRate = observed?.byStage[stage];
    const rate =
      observedRate !== undefined
        ? Math.min(MAX_STAGE_RATE, observedRate)
        : baseRate === null
          ? 0
          : Math.min(MAX_STAGE_RATE, baseRate * STAGE_PROGRESSION_MULTIPLIER[stage]);
    return {
      stage,
      open,
      rate: Math.round(rate * 100) / 100,
      source: (observedRate !== undefined ? "observed" : "heuristic") as
        | "observed"
        | "heuristic",
      expected: Math.round(open * rate * 10) / 10,
    };
  });

  return {
    openTotal: byStage.reduce((s, x) => s + x.open, 0),
    baseRate: baseRate === null ? null : Math.round(baseRate * 100) / 100,
    expectedEnrolments:
      Math.round(byStage.reduce((s, x) => s + x.expected, 0) * 10) / 10,
    ratesSource: observed ? "observed" : "heuristic",
    observedSampleSize: observed?.sampleSize ?? null,
    byStage,
  };
}

// ── Alert derivation (shared by /performance + /leadership) ────────

export interface ForecastAlert {
  serviceId: string;
  serviceName: string;
  kind: "capacity" | "under_target";
  /** Weeks until the projected breach (0 = already there). */
  weeks: number;
  detail: string;
}

export const UNDER_TARGET_UTILISATION = 0.6;
export const NEAR_CAPACITY_UTILISATION = 0.95;

export function deriveAlerts(
  services: Array<{
    serviceId: string;
    serviceName: string;
    forecast: OccupancyForecast | null;
  }>,
  horizonWeeks: number,
): ForecastAlert[] {
  const alerts: ForecastAlert[] = [];
  for (const s of services) {
    const f = s.forecast;
    if (!f) continue;
    if (
      f.weeksToCapacity !== null &&
      f.weeksToCapacity <= horizonWeeks &&
      (f.utilisationAtHorizon ?? 0) >= NEAR_CAPACITY_UTILISATION
    ) {
      alerts.push({
        serviceId: s.serviceId,
        serviceName: s.serviceName,
        kind: "capacity",
        weeks: f.weeksToCapacity,
        detail:
          f.weeksToCapacity === 0
            ? "at capacity now — start the waitlist"
            : `projected to hit capacity in ~${f.weeksToCapacity} week${f.weeksToCapacity === 1 ? "" : "s"}`,
      });
    } else if (
      f.trend === "declining" &&
      f.utilisationAtHorizon !== null &&
      f.utilisationAtHorizon < UNDER_TARGET_UTILISATION
    ) {
      alerts.push({
        serviceId: s.serviceId,
        serviceName: s.serviceName,
        kind: "under_target",
        weeks: horizonWeeks,
        detail: `declining — projected ${Math.round(f.utilisationAtHorizon * 100)}% utilisation in ${horizonWeeks} weeks`,
      });
    }
  }
  // Capacity crunches first, soonest first.
  return alerts.sort((a, b) =>
    a.kind !== b.kind ? (a.kind === "capacity" ? -1 : 1) : a.weeks - b.weeks,
  );
}
