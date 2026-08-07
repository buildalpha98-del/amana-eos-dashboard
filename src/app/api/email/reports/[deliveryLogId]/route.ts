import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";

const REPORT_ROLES = ["owner", "head_office", "admin", "marketing"] as const;

/**
 * GET /api/email/reports/:deliveryLogId — per-send engagement report.
 *
 * Aggregation happens in JS over a single emailEvent query — the webhook
 * dedupes events on (messageId, type, email), and per-recipient sends carry
 * one messageId per recipient, so volumes are bounded by recipient count
 * (small) and a groupBy round-trip per stat isn't worth it.
 *
 * Conventions the UI leans on:
 * - Rates are computed against `recipientCount` — the post-suppression
 *   attempted-recipient count stamped on the DeliveryLog at send time —
 *   NOT against delivered. Divide-by-zero → 0.
 * - `hourly` covers the first 24h after the send only; later events are
 *   EXCLUDED from the curve but still count in `stats` totals.
 * - `topLinks` groups clicked events by top-level `payload.link`. Because
 *   the webhook stores at most one clicked event per recipient, each entry
 *   counts recipients whose FIRST click was that link.
 */
export const GET = withApiAuth(
  async (req, session, context) => {
    const { deliveryLogId } = await context!.params!;

    const log = await prisma.deliveryLog.findUnique({
      where: { id: deliveryLogId },
      select: {
        id: true,
        subject: true,
        status: true,
        recipientCount: true,
        createdAt: true,
        messageType: true,
      },
    });
    if (!log) {
      return NextResponse.json({ error: "Send not found" }, { status: 404 });
    }

    const events = await prisma.emailEvent.findMany({
      where: { deliveryLogId },
      select: { type: true, email: true, createdAt: true, payload: true },
    });

    // Unique-recipient sets per event type
    const byType: Record<string, Set<string>> = {};
    for (const e of events) {
      (byType[e.type] ??= new Set()).add(e.email);
    }
    const delivered = byType.delivered?.size ?? 0;
    const uniqueOpens = byType.opened?.size ?? 0;
    const uniqueClicks = byType.clicked?.size ?? 0;
    const bounced = byType.bounced?.size ?? 0;

    const rate = (n: number) =>
      log.recipientCount > 0
        ? Math.round((n / log.recipientCount) * 1000) / 10
        : 0;

    // First-24h engagement curve. Events past 24h are totals-only — folding
    // them into bucket 23 would fake a late spike.
    const hourly = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      opens: 0,
      clicks: 0,
    }));
    for (const e of events) {
      if (e.type !== "opened" && e.type !== "clicked") continue;
      const hoursSinceSend =
        (e.createdAt.getTime() - log.createdAt.getTime()) / 3600000;
      if (hoursSinceSend >= 24) continue;
      const bucket = Math.max(0, Math.floor(hoursSinceSend));
      if (e.type === "opened") hourly[bucket].opens++;
      else hourly[bucket].clicks++;
    }

    // Top links — one clicked event per recipient means grouping by link
    // counts "recipients whose first click was this link". Dedupe by email
    // per link so replayed webhook events can't double-count.
    const linkClickers = new Map<string, Set<string>>();
    for (const e of events) {
      if (e.type !== "clicked") continue;
      const payload = e.payload as Record<string, unknown> | null;
      const link = payload?.link;
      if (typeof link !== "string" || !link) continue;
      let clickers = linkClickers.get(link);
      if (!clickers) {
        clickers = new Set();
        linkClickers.set(link, clickers);
      }
      clickers.add(e.email);
    }
    const topLinks = [...linkClickers.entries()]
      .map(([link, clickers]) => ({ link, clickers: clickers.size }))
      .sort((a, b) => b.clickers - a.clickers)
      .slice(0, 10);

    return NextResponse.json({
      log,
      hasEvents: events.length > 0,
      stats: {
        delivered,
        uniqueOpens,
        uniqueClicks,
        bounced,
        openRate: rate(uniqueOpens),
        clickRate: rate(uniqueClicks),
      },
      hourly,
      topLinks,
    });
  },
  { roles: [...REPORT_ROLES] },
);
