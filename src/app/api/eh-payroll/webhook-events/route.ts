/**
 * GET /api/eh-payroll/webhook-events
 *   ?limit=50            — number of events (max 200)
 *   ?eventType=leave_*   — filter by event type prefix
 *
 * Admin-only view of recent EH webhook activity. Surfaces the audit
 * trail so admins can see which leave/expense events EH has fired
 * at us, which we successfully processed, and which failed.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";

export const GET = withApiAuth(
  async (req) => {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") || "50", 10) || 50, 1),
      200,
    );
    const eventTypeFilter = searchParams.get("eventType");

    const where: Record<string, unknown> = {};
    if (eventTypeFilter) {
      where.eventType = { contains: eventTypeFilter };
    }

    const events = await prisma.ehWebhookEvent.findMany({
      where,
      orderBy: { receivedAt: "desc" },
      take: limit,
      select: {
        id: true,
        eventType: true,
        providerEventId: true,
        receivedAt: true,
        processedAt: true,
        error: true,
      },
    });

    // Lightweight summary at the head of the response so the UI
    // can render counters without a second query.
    const [last24h, last7d] = await Promise.all([
      prisma.ehWebhookEvent.count({
        where: {
          receivedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
      prisma.ehWebhookEvent.count({
        where: {
          receivedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    return NextResponse.json({
      events,
      summary: {
        last24h,
        last7d,
      },
    });
  },
  { roles: ["owner", "head_office", "admin"] },
);
