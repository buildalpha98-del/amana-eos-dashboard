/**
 * Observed funnel rates from stage-transition events (2026-07-06).
 *
 * The pipeline forecast shipped with fixed per-stage multipliers
 * because only each enquiry's CURRENT stage was stored. #151 started
 * logging ParentEnquiryStageEvent rows; this module turns that history
 * into real rates: for each open stage s,
 *
 *   P(convert | passed through s) =
 *     resolved enquiries that touched s and converted
 *     ─────────────────────────────────────────────
 *     resolved enquiries that touched s
 *
 * "Touched" = any event with fromStage or toStage = s (creation events
 * count as touching their initial stage). "Resolved" = the enquiry's
 * current stage is a converted stage or cold.
 *
 * Rates only activate once MIN_RESOLVED_JOURNEYS journeys have both
 * events and a terminal stage — below that the caller keeps the
 * heuristic. The switch is automatic and per-deployment: no flag to
 * flip when the data matures.
 */

import { prisma } from "@/lib/prisma";
import {
  CONVERTED_STAGES,
  OPEN_PIPELINE_STAGES,
  type StageRates,
} from "@/lib/forecast";

export const MIN_RESOLVED_JOURNEYS = 30;
/** Ignore ancient history — behaviour from years ago isn't this year's funnel. */
const LOOKBACK_DAYS = 365;
const EVENT_CAP = 20_000;

export async function computeObservedStageRates(
  now: Date = new Date(),
): Promise<StageRates | null> {
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  // Events belonging to resolved enquiries only — unresolved journeys
  // can't teach us conversion odds yet.
  const events = await prisma.parentEnquiryStageEvent.findMany({
    where: {
      createdAt: { gte: since },
      enquiry: { stage: { in: [...CONVERTED_STAGES, "cold"] } },
    },
    select: {
      enquiryId: true,
      fromStage: true,
      toStage: true,
      enquiry: { select: { stage: true } },
    },
    orderBy: { createdAt: "asc" },
    take: EVENT_CAP,
  });

  if (events.length === 0) return null;

  const convertedSet = new Set<string>(CONVERTED_STAGES);
  // Per stage: distinct resolved enquiries that touched it, split by outcome.
  const touched = new Map<string, { converted: Set<string>; total: Set<string> }>();
  const resolvedEnquiries = new Set<string>();

  for (const e of events) {
    resolvedEnquiries.add(e.enquiryId);
    const isConverted = convertedSet.has(e.enquiry.stage);
    for (const stage of [e.fromStage, e.toStage]) {
      if (!stage) continue;
      let bucket = touched.get(stage);
      if (!bucket) {
        bucket = { converted: new Set(), total: new Set() };
        touched.set(stage, bucket);
      }
      bucket.total.add(e.enquiryId);
      if (isConverted) bucket.converted.add(e.enquiryId);
    }
  }

  if (resolvedEnquiries.size < MIN_RESOLVED_JOURNEYS) return null;

  const rates: StageRates = { sampleSize: resolvedEnquiries.size, byStage: {} };
  for (const stage of OPEN_PIPELINE_STAGES) {
    const bucket = touched.get(stage);
    // A stage nobody has journeyed through yet stays heuristic-priced
    // by the caller (undefined entry).
    if (!bucket || bucket.total.size < 5) continue;
    rates.byStage[stage] =
      Math.round((bucket.converted.size / bucket.total.size) * 100) / 100;
  }

  return Object.keys(rates.byStage).length > 0 ? rates : null;
}
