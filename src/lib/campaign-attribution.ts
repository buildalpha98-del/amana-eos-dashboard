import type { PrismaClient } from "@prisma/client";

/**
 * Campaign attribution funnel queries (Marketing Hub Phase 5).
 *
 * One lib owns window resolution + every funnel query so the performance
 * endpoint and the weekly measurables cron can never drift apart. All
 * functions are COUNT-shaped (no row fetching beyond tiny id lists) and take
 * an injected `db` for prisma-mock testability.
 *
 * Attribution semantics (keep the UI captions honest):
 * - "attributed" = traced via QR/activation links (`ParentEnquiry.sourceActivationId`)
 *   or tracked email sends. Phone/walk-in enquiries are NOT captured.
 * - "contextual" = everything at the campaign's linked services in the window —
 *   clearly labelled, never presented as campaign-caused.
 * - QR→campaign is transitive only: QrCode.activationId → activation.campaignId.
 *   QRs without an activation are unattributable.
 */

export type AttributionWindow = { start: Date; end: Date };

const DAY_MS = 24 * 60 * 60 * 1000;

/** Round to 1 decimal place (occupancy percentages). */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function windowedCreatedAt(window: AttributionWindow) {
  return { gte: window.start, lte: window.end };
}

/**
 * Resolve the effective measurement window for a campaign.
 * `startDate`/`endDate` are both nullable and unvalidated, so:
 *   start = startDate ?? createdAt
 *   end   = min(endDate ?? now, now), clamped to end >= start
 * (a future-dated campaign collapses to a zero-length window at its start).
 */
export function resolveCampaignWindow(
  campaign: { startDate: Date | null; endDate: Date | null; createdAt: Date },
  now: Date = new Date(),
): AttributionWindow {
  const start = campaign.startDate ?? campaign.createdAt;
  let end = campaign.endDate ?? now;
  if (end > now) end = now;
  if (end < start) end = start;
  return { start, end };
}

/**
 * All DeliveryLog ids "reached" by a campaign: direct campaign sends
 * (entityType "MarketingCampaign") ∪ transitive post sends (posts whose
 * campaignId matches — posts stamp entityType "MarketingPost", never both).
 * Returns the id list plus summed post-suppression recipientCount.
 */
export async function getCampaignSendIds(
  db: Pick<PrismaClient, "deliveryLog" | "marketingPost">,
  campaignId: string,
): Promise<{ sendIds: string[]; recipients: number }> {
  const posts = await db.marketingPost.findMany({
    where: { campaignId, deliveryLogId: { not: null } },
    select: { deliveryLogId: true },
  });
  const postLogIds = posts
    .map((p) => p.deliveryLogId)
    .filter((id): id is string => id !== null);

  const logs = await db.deliveryLog.findMany({
    where: {
      OR: [
        { entityType: "MarketingCampaign", entityId: campaignId },
        { id: { in: postLogIds } },
      ],
    },
    select: { id: true, recipientCount: true },
  });

  return {
    sendIds: logs.map((l) => l.id),
    recipients: logs.reduce((sum, l) => sum + l.recipientCount, 0),
  };
}

/**
 * Unique opens/clicks across a campaign's sends within the window.
 * Groups by [type, email] (NOT type alone — the webhook dedupes per
 * (messageId, type, email), so one recipient can still produce multiple
 * rows of a type across different sends in the id set) and counts DISTINCT
 * emails per type in JS. Bounded because it's sendIds-scoped.
 */
export async function getEmailEngagement(
  db: Pick<PrismaClient, "emailEvent">,
  sendIds: string[],
  window: AttributionWindow,
): Promise<{ uniqueOpens: number; uniqueClicks: number }> {
  if (sendIds.length === 0) return { uniqueOpens: 0, uniqueClicks: 0 };

  const groups = await db.emailEvent.groupBy({
    by: ["type", "email"],
    where: {
      deliveryLogId: { in: sendIds },
      createdAt: windowedCreatedAt(window),
      type: { in: ["opened", "clicked"] },
    },
  });

  const distinct = (type: string) =>
    new Set(groups.filter((g) => g.type === type).map((g) => g.email)).size;

  return { uniqueOpens: distinct("opened"), uniqueClicks: distinct("clicked") };
}

/**
 * QR scans in the window, attributed transitively via linked activations.
 * Uniques exclude null ipHash — null hashes would collapse into one bogus group.
 */
export async function getQrScans(
  db: Pick<PrismaClient, "qrScan">,
  campaignId: string,
  window: AttributionWindow,
): Promise<{ scans: number; uniqueScanners: number }> {
  const attributedScan = {
    scannedAt: { gte: window.start, lte: window.end },
    qrCode: { activation: { campaignId } },
  };

  const [scans, uniqueGroups] = await Promise.all([
    db.qrScan.count({ where: attributedScan }),
    db.qrScan.groupBy({
      by: ["ipHash"],
      where: { ...attributedScan, ipHash: { not: null } },
    }),
  ]);

  return { scans, uniqueScanners: uniqueGroups.length };
}

/**
 * Enquiries in the window: attributed (sourceActivation → campaign) vs
 * contextual (any enquiry at the campaign's linked services). Caller passes
 * linkedServiceIds (already loaded with the campaign) to avoid a re-query.
 */
export async function getAttributedEnquiries(
  db: Pick<PrismaClient, "parentEnquiry">,
  campaignId: string,
  linkedServiceIds: string[],
  window: AttributionWindow,
): Promise<{ attributed: number; contextual: number }> {
  const attributed = await db.parentEnquiry.count({
    where: {
      deleted: false,
      createdAt: windowedCreatedAt(window),
      sourceActivation: { campaignId },
    },
  });

  const contextual =
    linkedServiceIds.length === 0
      ? 0
      : await db.parentEnquiry.count({
          where: {
            deleted: false,
            createdAt: windowedCreatedAt(window),
            serviceId: { in: linkedServiceIds },
          },
        });

  return { attributed, contextual };
}

/**
 * Enrolments won in the window, via stage events entering "enrolled"
 * (indexed on [toStage, createdAt]). Attributed = the enquiry traces to the
 * campaign via sourceActivation; contextual = the enquiry is at a linked
 * service. NOTE: portal enrolments predating the Phase 5 stage-event fix are
 * missing from events — the caveat caption lives in the UI, not here.
 */
export async function getEnrolmentsWon(
  db: Pick<PrismaClient, "parentEnquiryStageEvent">,
  campaignId: string,
  linkedServiceIds: string[],
  window: AttributionWindow,
): Promise<{ attributed: number; contextual: number }> {
  const attributed = await db.parentEnquiryStageEvent.count({
    where: {
      toStage: "enrolled",
      createdAt: windowedCreatedAt(window),
      enquiry: { deleted: false, sourceActivation: { campaignId } },
    },
  });

  const contextual =
    linkedServiceIds.length === 0
      ? 0
      : await db.parentEnquiryStageEvent.count({
          where: {
            toStage: "enrolled",
            createdAt: windowedCreatedAt(window),
            enquiry: { deleted: false, serviceId: { in: linkedServiceIds } },
          },
        });

  return { attributed, contextual };
}

export type ServiceOccupancy = {
  serviceId: string;
  /** sum(attended)/sum(capacity) over start±7d, 1dp %, null when no rows or zero capacity. */
  startPct: number | null;
  endPct: number | null;
};

export type OccupancyDelta = {
  services: ServiceOccupancy[];
  /** Weighted across all linked services (total attended / total capacity). */
  overallStartPct: number | null;
  overallEndPct: number | null;
};

type OccupancySums = Map<string, { attended: number; capacity: number }>;

/**
 * Occupancy at each end of the campaign window, per linked service:
 * ±7-day DailyAttendance windowed sums around each endpoint
 * (sum(attended)/sum(capacity)). Services with no rows or zero capacity get
 * null (skipped from the weighted overall too) — "latest-ever" from the
 * occupancy route is deliberately NOT used here.
 */
export async function getOccupancyDelta(
  db: Pick<PrismaClient, "dailyAttendance">,
  serviceIds: string[],
  window: AttributionWindow,
): Promise<OccupancyDelta> {
  if (serviceIds.length === 0) {
    return { services: [], overallStartPct: null, overallEndPct: null };
  }

  const sumsAround = async (endpoint: Date): Promise<OccupancySums> => {
    const groups = await db.dailyAttendance.groupBy({
      by: ["serviceId"],
      where: {
        serviceId: { in: serviceIds },
        date: {
          gte: new Date(endpoint.getTime() - 7 * DAY_MS),
          lte: new Date(endpoint.getTime() + 7 * DAY_MS),
        },
      },
      _sum: { attended: true, capacity: true },
    });
    return new Map(
      groups.map((g) => [
        g.serviceId,
        { attended: g._sum.attended ?? 0, capacity: g._sum.capacity ?? 0 },
      ]),
    );
  };

  const [startSums, endSums] = await Promise.all([
    sumsAround(window.start),
    sumsAround(window.end),
  ]);

  const pct = (sums: OccupancySums, serviceId: string): number | null => {
    const s = sums.get(serviceId);
    if (!s || s.capacity <= 0) return null;
    return round1((s.attended / s.capacity) * 100);
  };

  const services: ServiceOccupancy[] = serviceIds.map((serviceId) => ({
    serviceId,
    startPct: pct(startSums, serviceId),
    endPct: pct(endSums, serviceId),
  }));

  const overall = (sums: OccupancySums): number | null => {
    let attended = 0;
    let capacity = 0;
    for (const s of sums.values()) {
      if (s.capacity <= 0) continue;
      attended += s.attended;
      capacity += s.capacity;
    }
    if (capacity <= 0) return null;
    return round1((attended / capacity) * 100);
  };

  return {
    services,
    overallStartPct: overall(startSums),
    overallEndPct: overall(endSums),
  };
}
