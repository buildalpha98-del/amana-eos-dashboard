/**
 * GET /api/compliance/cert-expiry-rollup
 *
 * Org-wide compliance certificate health rollup. Returns one row per
 * service that has at least one expiring/expired cert, plus org-level
 * totals. Powers `LeadershipCertExpiryCard` on `/leadership`.
 *
 * Companion to the per-service `/api/services/[id]/cert-expiry-summary`
 * (PR #69). That surface shows ONE centre's detail; this is the State
 * Manager's at-a-glance view of all 11 centres.
 *
 * Auth: admin tier only (owner / head_office / admin). The cross-
 * service shape inherently leaks "service A has 5 expired certs" to
 * the caller, which member/staff at service B shouldn't see. Members
 * who need to see their own centre's detail can use the per-service
 * card on the Compliance tab.
 *
 * 2026-05-04: introduced.
 */

import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";
import { bucketCertExpiryByService } from "@/lib/cert-expiry-summary";

export const GET = withApiAuth(async (_req, session) => {
  const role = session.user.role ?? "";
  if (!isAdminRole(role)) {
    throw ApiError.forbidden(
      "Org-wide compliance rollup is admin-tier only.",
    );
  }

  const asOf = new Date();
  const horizon = new Date(asOf.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Pull every staff-level non-superseded cert whose expiryDate is
  // within the 30-day horizon (or already past). Same query shape as
  // the per-service endpoint (PR #69), just without the serviceId
  // filter so we get all centres at once.
  const certs = await prisma.complianceCertificate.findMany({
    where: {
      supersededAt: null,
      expiryDate: { lte: horizon },
      userId: { not: null },
    },
    select: {
      userId: true,
      serviceId: true,
      type: true,
      expiryDate: true,
    },
    orderBy: { expiryDate: "asc" },
  });

  const rollup = bucketCertExpiryByService(
    certs.map((c) => ({
      userId: c.userId,
      serviceId: c.serviceId,
      type: c.type,
      expiryDate: c.expiryDate,
    })),
    asOf,
  );

  // Hydrate service names for the row labels. Only fetch services
  // that actually appear in the rollup — saves a full Service.findMany
  // when most centres have clean compliance.
  const affectedServiceIds = rollup.services.map((s) => s.serviceId);
  const serviceMeta =
    affectedServiceIds.length === 0
      ? []
      : await prisma.service.findMany({
          where: { id: { in: affectedServiceIds } },
          select: { id: true, name: true, code: true, state: true },
        });
  const metaById = new Map(serviceMeta.map((s) => [s.id, s]));

  return NextResponse.json({
    asOf: rollup.asOf,
    orgTotals: rollup.orgTotals,
    services: rollup.services.map((row) => {
      const meta = metaById.get(row.serviceId);
      return {
        ...row,
        name: meta?.name ?? "Unknown service",
        code: meta?.code ?? null,
        state: meta?.state ?? null,
      };
    }),
  });
});
