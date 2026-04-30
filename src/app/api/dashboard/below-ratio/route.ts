import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";

/**
 * GET /api/dashboard/below-ratio
 *
 * Returns the most-recent RatioSnapshot per (service, sessionType) for the
 * current day, filtered to rows where `belowRatio=true`. Used by the
 * ServicesBelowRatioCard on the dashboard.
 *
 * Scope:
 *   - owner / head_office: all services
 *   - admin: all services (org-visibility for triage)
 *   - coordinator / member / staff: only their own service
 */
export const GET = withApiAuth(async (_req, session) => {
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  const serviceFilter =
    session.user.role === "coordinator" ||
    session.user.role === "member" ||
    session.user.role === "staff"
      ? session.user.serviceId
        ? { serviceId: session.user.serviceId }
        : { serviceId: "__none__" } // effectively empty result
      : {};

  const snapshots = await prisma.ratioSnapshot.findMany({
    where: { ...serviceFilter, date: dayStart, belowRatio: true },
    orderBy: { capturedAt: "desc" },
    select: {
      serviceId: true,
      sessionType: true,
      ratioText: true,
      capturedAt: true,
      service: { select: { name: true } },
    },
  });

  // Dedupe to latest per (serviceId, sessionType)
  const seen = new Map<string, (typeof snapshots)[number]>();
  for (const s of snapshots) {
    const key = `${s.serviceId}:${s.sessionType}`;
    if (!seen.has(key)) seen.set(key, s);
  }

  const items = Array.from(seen.values()).map((s) => ({
    serviceId: s.serviceId,
    serviceName: s.service.name,
    sessionType: s.sessionType,
    ratioText: s.ratioText,
    capturedAt: s.capturedAt.toISOString(),
  }));

  return NextResponse.json({ items });
});
