/**
 * GET /api/services/[id]/cert-expiry-summary
 *
 * Per-service rollup of compliance certificate health: how many certs
 * are expired / expiring critically / warning / upcoming, and which
 * staff are affected. Powers the `ServiceCertExpiryCard` mounted on
 * the per-service Compliance group.
 *
 * The cron at `/api/cron/compliance-alerts` already sends per-staff
 * emails and bell notifications. This endpoint surfaces the same
 * data on-screen at-a-glance — closes the "no proactive surface"
 * piece called out in next-priorities.md Tier 1.
 *
 * Service-scoping: org-wide roles see anything; member can read their
 * own service. Staff (educators) at the service can ALSO read this —
 * if their own cert is expiring, they should see the warning surfaced
 * in their portal too (a future hook target).
 *
 * 2026-05-04: introduced.
 */

import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";
import { bucketCertExpiry } from "@/lib/cert-expiry-summary";

type RouteCtx = { params: Promise<{ id: string }> };

export const GET = withApiAuth(async (_req, session, context) => {
  const { id: serviceId } = await (context as unknown as RouteCtx).params;
  if (!serviceId) throw ApiError.badRequest("Missing service id");

  const role = session.user.role ?? "";
  const callerServiceId =
    (session.user as { serviceId?: string | null }).serviceId ?? null;

  if (!isAdminRole(role) && callerServiceId !== serviceId) {
    throw ApiError.forbidden(
      "You can only view certificate health for your own service.",
    );
  }

  const asOf = new Date();
  // Look ahead 30d only — anything past that doesn't move the needle.
  const horizon = new Date(asOf.getTime() + 30 * 24 * 60 * 60 * 1000);

  const certs = await prisma.complianceCertificate.findMany({
    where: {
      serviceId,
      // Skip superseded certs (renewed) — they don't represent risk.
      supersededAt: null,
      // Anything that's expired (no upper bound) OR expires within 30d.
      // We can't compose "expired OR expires_in_30d" cleanly without
      // an OR clause, so just pull everything <= horizon and let the
      // bucket helper classify.
      expiryDate: { lte: horizon },
      userId: { not: null },
    },
    select: {
      userId: true,
      type: true,
      expiryDate: true,
      user: { select: { id: true, name: true, avatar: true } },
    },
    orderBy: { expiryDate: "asc" },
  });

  // Project to the bucket helper's input shape.
  const bucketed = bucketCertExpiry(
    certs.map((c) => ({
      userId: c.userId,
      type: c.type,
      expiryDate: c.expiryDate,
    })),
    asOf,
  );

  // Hydrate staff names back onto the affected list. The bucket helper
  // is pure (no DB) so it returns userIds only — pair them with the
  // names we already pulled for the email-style "Alice (WWCC expired
  // 2 days ago)" rendering on the card.
  const userInfoById = new Map<
    string,
    { name: string; avatar: string | null }
  >();
  for (const c of certs) {
    if (c.user && c.userId && !userInfoById.has(c.userId)) {
      userInfoById.set(c.userId, {
        name: c.user.name,
        avatar: c.user.avatar ?? null,
      });
    }
  }

  return NextResponse.json({
    asOf: bucketed.asOf,
    totals: bucketed.totals,
    affectedStaff: bucketed.affectedStaff.map((s) => ({
      ...s,
      name: userInfoById.get(s.userId)?.name ?? "Staff member",
      avatar: userInfoById.get(s.userId)?.avatar ?? null,
    })),
  });
});
