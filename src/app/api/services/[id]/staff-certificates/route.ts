/**
 * GET /api/services/[id]/staff-certificates
 *
 * Lightweight endpoint returning every active (non-superseded)
 * compliance certificate for staff at this service. Used by the per-
 * service Weekly Roster grid to flag staff with expiring or expired
 * qualifications next to their name — first deliverable beyond the
 * ratio rollup in PR #50 toward the Connecteam-style roster the user
 * flagged in 2026-04-29 Nadia training.
 *
 * Returns: `{ userId, type, expiryDate }[]` keyed by `userId` on the
 * client. We deliberately don't pre-aggregate to a single status here
 * because the relevant date depends on which week the user is viewing
 * (a cert that expires in 14 days is fine for last week's roster but
 * red for next month's). The client computes that.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";

type RouteCtx = { params: Promise<{ id: string }> };

const ORG_WIDE_ROLES = new Set(["owner", "head_office", "admin"]);

export const GET = withApiAuth(async (_req, session, context) => {
  const { id: serviceId } = await (context as unknown as RouteCtx).params;

  // Service-scoping: org-wide roles see anything; member can read their own
  // service's certs (so they can roster themselves + co-workers without
  // breaching another centre's confidentiality).
  const role = session.user.role;
  const userServiceId =
    (session.user as { serviceId?: string | null }).serviceId ?? null;
  if (!ORG_WIDE_ROLES.has(role) && userServiceId !== serviceId) {
    throw ApiError.forbidden("You can only view certificates for your own service.");
  }

  const certs = await prisma.complianceCertificate.findMany({
    where: {
      serviceId,
      // Only "live" certs — a cert that's been superseded by a renewal
      // shouldn't trigger a stale expiry warning.
      supersededAt: null,
      // Optional: exclude rows missing a userId (centre-level certs the
      // expiry-row schema also stores). Roster cares about per-staff certs.
      userId: { not: null },
    },
    select: {
      userId: true,
      type: true,
      expiryDate: true,
    },
    orderBy: { expiryDate: "asc" },
  });

  return NextResponse.json({ certificates: certs });
});
