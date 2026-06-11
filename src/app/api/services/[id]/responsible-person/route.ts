/**
 * Responsible-person register — service-scoped read + upsert.
 *
 *   GET  /api/services/[id]/responsible-person?from=YYYY-MM-DD&to=YYYY-MM-DD
 *        → { entries } for the inclusive date range. Powers the weekly grid
 *          and the range-capable PDF export.
 *   POST /api/services/[id]/responsible-person
 *        → upsert the single designated RP for a (date, sessionType). The DB
 *          unique constraint (serviceId, date, sessionType) enforces the
 *          "one responsible person per session" rule; upserting means re-
 *          designating simply replaces.
 *
 * View: any user at the service (+ org-wide roles). Edit: admin-tier or the
 * service's own Director (member) — mirrors the roster-shift rule.
 *
 * 2026-06-11: introduced after an Assessment & Rating breach finding (no RP
 * rostered, no record kept).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";
import {
  defaultTimesForSession,
  type RpSessionType,
} from "@/lib/responsible-person";

type RouteCtx = { params: Promise<{ id: string }> };

const ORG_WIDE_ROLES = new Set(["owner", "head_office", "admin"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function userServiceIdOf(session: {
  user: { serviceId?: string | null };
}): string | null {
  return (session.user as { serviceId?: string | null }).serviceId ?? null;
}

// ── GET ────────────────────────────────────────────────────────────────

export const GET = withApiAuth(async (req, session, context) => {
  const { id: serviceId } = await (context as unknown as RouteCtx).params;
  const role = session.user.role ?? "";
  const userServiceId = userServiceIdOf(session);
  if (!ORG_WIDE_ROLES.has(role) && userServiceId !== serviceId) {
    throw ApiError.forbidden("You can only view your own service's register.");
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!from || !to || !ISO_DATE.test(from) || !ISO_DATE.test(to)) {
    throw ApiError.badRequest("from and to (YYYY-MM-DD) are required");
  }
  const start = new Date(`${from}T00:00:00.000Z`);
  // Inclusive `to`: the column is a DATE, so query strictly below to+1 day.
  const endExclusive = new Date(`${to}T00:00:00.000Z`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

  const entries = await prisma.responsiblePersonEntry.findMany({
    where: { serviceId, date: { gte: start, lt: endExclusive } },
    orderBy: [{ date: "asc" }, { sessionType: "asc" }],
    include: { user: { select: { id: true, name: true, avatar: true } } },
  });
  return NextResponse.json({ entries });
});

// ── POST (upsert) ────────────────────────────────────────────────────────

const upsertSchema = z.object({
  date: z.string().regex(ISO_DATE),
  sessionType: z.enum(["bsc", "asc", "vc"]),
  personName: z.string().trim().min(1, "personName is required").max(120),
  personRole: z.string().trim().max(120).nullish(),
  userId: z.string().min(1).nullish(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  notes: z.string().trim().max(500).nullish(),
});

export const POST = withApiAuth(async (req, session, context) => {
  const { id: serviceId } = await (context as unknown as RouteCtx).params;
  const role = session.user.role ?? "";
  const userServiceId = userServiceIdOf(session);
  const canEdit =
    isAdminRole(role) || (role === "member" && userServiceId === serviceId);
  if (!canEdit) {
    throw ApiError.forbidden("You can't edit this service's register.");
  }

  const body = await parseJsonBody(req);
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid input", parsed.error.flatten());
  }
  const d = parsed.data;
  const sessionType = d.sessionType as RpSessionType;

  // Default the designated period from the service's configured session
  // times (falling back to the federal windows) when the client omits them.
  let startTime = d.startTime;
  let endTime = d.endTime;
  if (!startTime || !endTime) {
    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      select: { sessionTimes: true },
    });
    if (!service) throw ApiError.notFound("Service not found");
    const defaults = defaultTimesForSession(sessionType, service.sessionTimes);
    startTime = startTime ?? defaults.start;
    endTime = endTime ?? defaults.end;
  }
  if (startTime >= endTime) {
    throw ApiError.badRequest("endTime must be later than startTime");
  }

  const date = new Date(`${d.date}T00:00:00.000Z`);
  const shared = {
    personName: d.personName,
    personRole: d.personRole ?? null,
    userId: d.userId ?? null,
    startTime,
    endTime,
    notes: d.notes ?? null,
  };

  const entry = await prisma.responsiblePersonEntry.upsert({
    where: { serviceId_date_sessionType: { serviceId, date, sessionType } },
    create: { serviceId, date, sessionType, ...shared, createdById: session.user.id },
    update: shared,
    include: { user: { select: { id: true, name: true, avatar: true } } },
  });
  return NextResponse.json({ entry });
});
