/**
 * GET /api/roster/shifts/open
 *
 * Returns open (unassigned) shifts the caller can claim — scoped to
 * their service, upcoming dates only.
 *
 * Query params:
 *  - `daysAhead` (optional, default 14, max 60) — how far forward to look.
 *
 * Org-wide roles see open shifts at every service. Member / staff see
 * only their own service's open shifts.
 *
 * Companion to `POST /api/roster/shifts/[id]/claim` (PR #53). Surfacing
 * this list is what makes open shifts a real workflow rather than just
 * an admin curiosity.
 */

import { addDaysUTC, serviceDateOnly } from "@/lib/timezone";
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { resolveAppSettings } from "@/lib/app-settings";
import { isAdminRole } from "@/lib/role-permissions";

const DEFAULT_DAYS_AHEAD = 14;
const MAX_DAYS_AHEAD = 60;

export const GET = withApiAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const rawDays = Number(searchParams.get("daysAhead"));
  const daysAhead =
    Number.isFinite(rawDays) && rawDays > 0
      ? Math.min(rawDays, MAX_DAYS_AHEAD)
      : DEFAULT_DAYS_AHEAD;

  const today = serviceDateOnly();
  const horizon = addDaysUTC(today, daysAhead);

  const role = session.user.role ?? "";
  const callerServiceId =
    (session.user as { serviceId?: string | null }).serviceId ?? null;

  // Scope: org-wide roles see all services; everyone else sees just
  // theirs. A user with no `serviceId` (e.g. a marketing role with no
  // centre attachment) gets an empty list rather than a 403 — they
  // can't claim anyway, and the UI hides the card on empty.
  const where: Record<string, unknown> = {
    userId: null,
    date: { gte: today, lt: horizon },
    status: "published",
  };
  if (!isAdminRole(role)) {
    if (!callerServiceId) {
      return NextResponse.json({ shifts: [] });
    }
    where.serviceId = callerServiceId;
  }

  const shifts = await prisma.rosterShift.findMany({
    where,
    orderBy: [{ date: "asc" }, { shiftStart: "asc" }],
    include: {
      service: { select: { id: true, name: true, code: true, appSettings: true } },
      // Who has put their hand up (2026-10-09). Names go only to people
      // who choose; educators just see whether they asked.
      interests: { select: { userId: true, user: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
    },
  });

  const chooses = isAdminRole(role) || role === "member";
  return NextResponse.json({
    shifts: shifts.map(({ interests, service, ...s }) => ({
      ...s,
      service: { id: service.id, name: service.name, code: service.code },
      mode: resolveAppSettings(service.appSettings).staff.instantClaim ? "claim" : "interest",
      interestedByMe: interests.some((i) => i.userId === session.user.id),
      interestedCount: interests.length,
      ...(chooses && { interested: interests.map((i) => ({ userId: i.userId, name: i.user.name })) }),
    })),
  });
});
