/**
 * POST /api/services/[id]/stock/submit — "Send stocktake": the centre has
 * counted everything. Stamps today's count on every item and tells head
 * office, with what's running low — this replaces the stocktake email.
 */
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { assertServiceAccess } from "@/lib/authz-scope";
import { notifyUsers } from "@/lib/notify-user";
import { NOTIFICATION_TYPES } from "@/lib/notification-types";
import { needsReorder } from "@/lib/service-stock";
import { serviceTodayISO } from "@/lib/timezone";
import { logger } from "@/lib/logger";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withApiAuth(
  async (_req, session, context) => {
    const { id } = await (context as unknown as Ctx).params;
    assertServiceAccess(session, id);
    const service = await prisma.service.findUnique({ where: { id }, select: { name: true } });
    if (!service) throw ApiError.notFound("Service not found");
    const today = new Date(`${serviceTodayISO()}T00:00:00Z`);
    const { count } = await prisma.stockItem.updateMany({ where: { serviceId: id }, data: { lastCounted: today } });
    if (count === 0) throw ApiError.badRequest("Add your items before sending the stocktake");

    const items = await prisma.stockItem.findMany({
      where: { serviceId: id },
      select: { item: true, qtyOnHand: true, reorderAt: true, unit: true },
      orderBy: { item: "asc" },
    });
    const low = items.filter(needsReorder);
    const name = service.name.replace(/^Amana OSHC\s+/i, "");
    try {
      const recipients = await prisma.user.findMany({
        where: { active: true, isCentreAccount: false, role: { in: ["head_office", "admin"] } },
        select: { id: true },
      });
      await notifyUsers(
        prisma,
        recipients.map((u) => u.id).filter((u) => u !== session.user.id),
        {
          type: NOTIFICATION_TYPES.STOCKTAKE,
          title: `${name} sent their stocktake`,
          body: low.length
            ? `${low.length} to reorder: ${low.slice(0, 6).map((s) => s.item).join(", ")}${low.length > 6 ? "…" : ""}`
            : `${count} items counted — nothing to reorder.`,
          link: `/hq?tab=centres&centre=${id}`,
        },
      );
    } catch (err) {
      logger.error("Stocktake notification failed", { err, serviceId: id });
    }
    return NextResponse.json({ counted: count, toReorder: low.length });
  },
  { rateLimit: { max: 10, windowMs: 60_000 } },
);
