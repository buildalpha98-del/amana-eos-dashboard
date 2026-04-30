import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { getCurrentTerm, getTermsForYear } from "@/lib/school-terms";

const TERM_TARGET_PER_NETWORK = 20;
const TERM_FLOOR_PER_NETWORK = 15;
const PER_CENTRE_TARGET = 2;

const querySchema = z.object({
  termYear: z.coerce.number().int().optional(),
  termNumber: z.coerce.number().int().min(1).max(4).optional(),
});

function statusFor(delivered: number, planned: number): "green" | "amber" | "red" {
  const total = delivered + planned;
  if (total >= PER_CENTRE_TARGET) return "green";
  if (total === 1) return "amber";
  return "red";
}

const DAY_MS = 24 * 60 * 60 * 1000;

export const GET = withApiAuth(
  async (req) => {
    const url = new URL(req.url);
    const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) throw ApiError.badRequest("Invalid query", parsed.error.flatten());

    const now = new Date();
    let termYear = parsed.data.termYear;
    let termNumber = parsed.data.termNumber as 1 | 2 | 3 | 4 | undefined;
    if (!termYear || !termNumber) {
      const current = getCurrentTerm(now);
      termYear = current.year;
      termNumber = current.term;
    }
    const terms = getTermsForYear(termYear);
    const term = terms.find((t) => t.term === termNumber);
    if (!term) throw ApiError.badRequest("Unknown term");

    const weeksUntilEnd = Math.max(0, Math.floor((term.endsOn.getTime() - now.getTime()) / DAY_MS / 7) + 1);

    const [services, activations] = await Promise.all([
      prisma.service.findMany({
        where: { status: "active" },
        orderBy: { code: "asc" },
        select: { id: true, name: true, state: true, code: true },
      }),
      prisma.campaignActivationAssignment.findMany({
        where: {
          termYear,
          termNumber,
          campaign: { deleted: false },
        },
        select: {
          id: true,
          serviceId: true,
          lifecycleStage: true,
          scheduledFor: true,
          activationType: true,
          activationDeliveredAt: true,
          recapPublishedAt: true,
          actualAttendance: true,
          expectedAttendance: true,
          campaign: { select: { id: true, name: true, type: true } },
        },
      }),
    ]);

    const byService = new Map<string, typeof activations>();
    for (const svc of services) byService.set(svc.id, []);
    for (const a of activations) {
      const arr = byService.get(a.serviceId);
      if (arr) arr.push(a);
    }

    let termTotalsDelivered = 0;
    let termTotalsTotal = 0;

    const matrix = services.map((svc) => {
      const list = byService.get(svc.id) ?? [];
      let delivered = 0;
      let planned = 0;
      let cancelled = 0;
      for (const a of list) {
        if (a.lifecycleStage === "delivered" || a.lifecycleStage === "recap_published") {
          delivered++;
        } else if (a.lifecycleStage === "cancelled") {
          cancelled++;
        } else {
          planned++;
        }
      }
      termTotalsDelivered += delivered;
      termTotalsTotal += delivered + planned;
      return {
        serviceId: svc.id,
        serviceName: svc.name,
        state: svc.state,
        code: svc.code,
        activations: list.map((a) => ({
          id: a.id,
          lifecycleStage: a.lifecycleStage,
          activationType: a.activationType,
          scheduledFor: a.scheduledFor?.toISOString() ?? null,
          campaignName: a.campaign.name,
          actualAttendance: a.actualAttendance,
          expectedAttendance: a.expectedAttendance,
        })),
        counts: {
          total: list.length,
          delivered,
          planned,
          cancelled,
        },
        targetPerCentre: PER_CENTRE_TARGET,
        status: statusFor(delivered, planned),
      };
    });

    return NextResponse.json({
      term: {
        year: termYear,
        number: termNumber,
        startsOn: term.startsOn.toISOString(),
        endsOn: term.endsOn.toISOString(),
        weeksUntilEnd,
      },
      centres: services.map((s) => ({ id: s.id, name: s.name, state: s.state })),
      matrix,
      termTotals: {
        total: termTotalsTotal,
        delivered: termTotalsDelivered,
        target: TERM_TARGET_PER_NETWORK,
        floor: TERM_FLOOR_PER_NETWORK,
      },
    });
  },
  { roles: ["marketing", "owner"] },
);
