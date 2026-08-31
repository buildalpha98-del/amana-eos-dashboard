import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { SUPER_RATE } from "@/lib/ambassadors/constants";
import { logger } from "@/lib/logger";

/**
 * GET  /api/ambassadors/pilot — the current pilot with per-centre progress,
 *      network totals, cost summary (gross + 12% super), attribution
 *      breakdown and a first-names-only leaderboard.
 * PATCH /api/ambassadors/pilot — pilot configuration (owner / head_office):
 *      activate, close, edit dates/name/targets.
 *
 * Closing the pilot stops NEW records being logged (log-enrolment checks
 * status=active) but verification/approval of existing records continues —
 * 28-day windows for late-window enrolments run past the end date.
 */

export const GET = withApiAuth(
  async () => {
    // Active pilot first; otherwise the most recently started (draft shows
    // pre-launch config, closed shows the wrap-up).
    const pilot =
      (await prisma.ambassadorPilot.findFirst({
        where: { status: "active" },
        include: pilotInclude,
      })) ??
      (await prisma.ambassadorPilot.findFirst({
        orderBy: { startDate: "desc" },
        include: pilotInclude,
      }));

    if (!pilot) return NextResponse.json({ pilot: null });

    const records = await prisma.ambassadorEnrolment.findMany({
      where: { pilotId: pilot.id },
      select: {
        serviceId: true,
        qualified: true,
        incentiveAmount: true,
        attributionSource: true,
        attributionConflict: true,
        status: true,
        creditedEducatorId: true,
        creditedEducator: { select: { name: true } },
      },
    });
    const adjustments = await prisma.ambassadorAdjustment.findMany({
      where: { pilotId: pilot.id },
      select: { educatorId: true, amount: true, type: true },
    });

    const centres = pilot.centres.map((c) => {
      const centreRecords = records.filter((r) => r.serviceId === c.serviceId);
      const qualifiedCount = centreRecords.filter((r) => r.qualified).length;
      return {
        id: c.id,
        serviceId: c.serviceId,
        serviceName: c.service.name,
        serviceCode: c.service.code,
        target: c.targetQualifiedEnrolments,
        teamBonusAmount: c.teamBonusAmount,
        totalRecords: centreRecords.length,
        qualifiedCount,
        teamBonusEarned: qualifiedCount >= c.targetQualifiedEnrolments,
      };
    });

    const grossIncentives = records
      .filter((r) => r.qualified)
      .reduce((sum, r) => sum + (r.incentiveAmount ?? 0), 0);
    const grossAdjustments = adjustments.reduce((sum, a) => sum + a.amount, 0);
    const gross = grossIncentives + grossAdjustments;

    const attribution: Record<string, number> = {
      form_field: 0,
      qr_ref: 0,
      both: 0,
      unknown: 0,
    };
    for (const r of records) attribution[r.attributionSource] += 1;

    // Leaderboard: FIRST NAMES ONLY (privacy rule for this surface).
    const byEducator = new Map<string, { firstName: string; qualified: number; total: number }>();
    for (const r of records) {
      if (!r.creditedEducatorId || !r.creditedEducator) continue;
      const entry = byEducator.get(r.creditedEducatorId) ?? {
        firstName: r.creditedEducator.name.trim().split(/\s+/)[0],
        qualified: 0,
        total: 0,
      };
      entry.total += 1;
      if (r.qualified) entry.qualified += 1;
      byEducator.set(r.creditedEducatorId, entry);
    }
    const leaderboard = Array.from(byEducator.values())
      .sort((a, b) => b.qualified - a.qualified || b.total - a.total)
      .slice(0, 20);

    return NextResponse.json({
      pilot: {
        id: pilot.id,
        name: pilot.name,
        startDate: pilot.startDate,
        endDate: pilot.endDate,
        status: pilot.status,
        centres,
        totals: {
          records: records.length,
          qualified: records.filter((r) => r.qualified).length,
          conflicts: records.filter((r) => r.attributionConflict).length,
          gross,
          superAmount: Math.round(gross * SUPER_RATE * 100) / 100,
        },
        attribution,
        leaderboard,
      },
    });
  },
  { roles: ["owner", "head_office", "admin", "member", "staff"] },
);

const pilotInclude = {
  centres: {
    include: { service: { select: { name: true, code: true } } },
  },
} as const;

const patchSchema = z.object({
  action: z.enum(["activate", "close", "update"]),
  name: z.string().trim().min(1).max(200).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  centres: z
    .array(
      z.object({
        serviceId: z.string().min(1),
        targetQualifiedEnrolments: z.number().int().min(0),
        teamBonusAmount: z.number().min(0).optional(),
      }),
    )
    .optional(),
});

export const PATCH = withApiAuth(
  async (req, session) => {
    const parsed = patchSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.issues[0].message);
    }
    const body = parsed.data;

    const pilot = await prisma.ambassadorPilot.findFirst({
      orderBy: { startDate: "desc" },
      select: { id: true, status: true },
    });
    if (!pilot) throw ApiError.notFound("No Ambassadors pilot exists");

    if (body.action === "activate") {
      if (pilot.status === "closed") {
        throw ApiError.badRequest("A closed pilot cannot be reactivated.");
      }
      await prisma.ambassadorPilot.update({
        where: { id: pilot.id },
        data: { status: "active" },
      });
    } else if (body.action === "close") {
      await prisma.ambassadorPilot.update({
        where: { id: pilot.id },
        data: {
          status: "closed",
          closedAt: new Date(),
          closedById: session.user.id,
        },
      });
    } else {
      await prisma.ambassadorPilot.update({
        where: { id: pilot.id },
        data: {
          ...(body.name ? { name: body.name } : {}),
          ...(body.startDate ? { startDate: new Date(body.startDate) } : {}),
          ...(body.endDate ? { endDate: new Date(body.endDate) } : {}),
        },
      });
      for (const centre of body.centres ?? []) {
        await prisma.ambassadorPilotCentre.upsert({
          where: {
            pilotId_serviceId: { pilotId: pilot.id, serviceId: centre.serviceId },
          },
          create: {
            pilotId: pilot.id,
            serviceId: centre.serviceId,
            targetQualifiedEnrolments: centre.targetQualifiedEnrolments,
            teamBonusAmount: centre.teamBonusAmount ?? 200,
          },
          update: {
            targetQualifiedEnrolments: centre.targetQualifiedEnrolments,
            ...(centre.teamBonusAmount != null
              ? { teamBonusAmount: centre.teamBonusAmount }
              : {}),
          },
        });
      }
    }

    logger.info("Ambassadors pilot updated", {
      pilotId: pilot.id,
      action: body.action,
      userId: session.user.id,
    });
    return NextResponse.json({ ok: true });
  },
  { roles: ["owner", "head_office"] },
);
