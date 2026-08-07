import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import {
  PAYROLL_LINE_ITEM,
  SUPER_RATE,
} from "@/lib/ambassadors/constants";
import { hasCompletedAmbassadorsCourse } from "@/lib/ambassadors/lms-gate";
import { transitionAmbassadorRecord } from "@/lib/ambassadors/state-machine";
import { logger } from "@/lib/logger";

/**
 * Payroll export (admin/owner):
 *
 * GET  — CSV of all sm_approved records with incentive > 0, grouped by
 *        educator: name, Employment Hero employee ID, centre, count, gross,
 *        milestone kicker, "Ambassador Incentive" label, super at 12% of
 *        gross. PAYG is the payroll system's job — no tax is computed.
 *        Non-completers of the LMS course are EXCLUDED and listed in the
 *        X-Ambassador-Held header count (use POST preview for names).
 * POST — { action: "send" } transitions the exported records to
 *        sent_to_payroll (per-record LMS gate) and stamps kicker
 *        adjustments; returns who was held back and why.
 *        { action: "mark-paid" } completes sent_to_payroll → paid.
 *
 * Unattributed $0 records never appear here — they finish their lifecycle
 * at sm_approved (they count toward the centre target, nothing is owed).
 */

interface EducatorGroup {
  educatorId: string;
  name: string;
  employeeId: number | null;
  centres: Set<string>;
  recordIds: string[];
  gross: number;
  kicker: number;
}

async function buildGroups(): Promise<{
  groups: EducatorGroup[];
  held: { educatorId: string; name: string; recordCount: number }[];
}> {
  const records = await prisma.ambassadorEnrolment.findMany({
    where: {
      status: "sm_approved",
      incentiveAmount: { gt: 0 },
      creditedEducatorId: { not: null },
    },
    select: {
      id: true,
      pilotId: true,
      incentiveAmount: true,
      creditedEducatorId: true,
      creditedEducator: {
        select: { id: true, name: true, employmentHeroEmployeeId: true },
      },
      service: { select: { name: true } },
    },
  });

  const byEducator = new Map<string, EducatorGroup>();
  for (const r of records) {
    if (!r.creditedEducator) continue;
    const g = byEducator.get(r.creditedEducator.id) ?? {
      educatorId: r.creditedEducator.id,
      name: r.creditedEducator.name,
      employeeId: r.creditedEducator.employmentHeroEmployeeId,
      centres: new Set<string>(),
      recordIds: [],
      gross: 0,
      kicker: 0,
    };
    g.centres.add(r.service.name);
    g.recordIds.push(r.id);
    g.gross += r.incentiveAmount ?? 0;
    byEducator.set(r.creditedEducator.id, g);
  }

  // Milestone kickers not yet sent to payroll ride along with the export.
  const pilotIds = [...new Set(records.map((r) => r.pilotId))];
  if (pilotIds.length > 0) {
    const adjustments = await prisma.ambassadorAdjustment.findMany({
      where: {
        pilotId: { in: pilotIds },
        sentToPayrollAt: null,
        educatorId: { in: [...byEducator.keys()] },
      },
      select: { educatorId: true, amount: true },
    });
    for (const a of adjustments) {
      const g = byEducator.get(a.educatorId);
      if (g) g.kicker += a.amount;
    }
  }

  // Hard gate: educators who haven't completed the course are held back
  // entirely — their records stay at sm_approved.
  const groups: EducatorGroup[] = [];
  const held: { educatorId: string; name: string; recordCount: number }[] = [];
  for (const g of byEducator.values()) {
    if (await hasCompletedAmbassadorsCourse(g.educatorId)) {
      groups.push(g);
    } else {
      held.push({
        educatorId: g.educatorId,
        name: g.name,
        recordCount: g.recordIds.length,
      });
    }
  }
  groups.sort((a, b) => a.name.localeCompare(b.name));
  return { groups, held };
}

function csvCell(v: string | number | null): string {
  if (v == null) return '""';
  return `"${String(v).replace(/"/g, '""')}"`;
}

export const GET = withApiAuth(
  async () => {
    const { groups, held } = await buildGroups();

    const header = [
      "Educator Name",
      "Employee ID",
      "Centre",
      "Qualified Count",
      "Gross Incentive",
      "Milestone Kicker",
      "Line Item",
      "Super (12%)",
    ];
    const rows = groups.map((g) => {
      const grossTotal = g.gross + g.kicker;
      return [
        csvCell(g.name),
        csvCell(g.employeeId),
        csvCell([...g.centres].join(" | ")),
        csvCell(g.recordIds.length),
        csvCell(g.gross.toFixed(2)),
        csvCell(g.kicker.toFixed(2)),
        csvCell(PAYROLL_LINE_ITEM),
        csvCell((grossTotal * SUPER_RATE).toFixed(2)),
      ].join(",");
    });
    const csv = [header.map(csvCell).join(","), ...rows].join("\r\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="ambassador-incentives-${new Date().toISOString().slice(0, 10)}.csv"`,
        "X-Ambassador-Held": String(held.length),
      },
    });
  },
  { roles: ["owner", "admin"] },
);

const postSchema = z.object({
  action: z.enum(["preview", "send", "mark-paid"]),
});

export const POST = withApiAuth(
  async (req, session) => {
    const parsed = postSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.issues[0].message);
    }

    if (parsed.data.action === "mark-paid") {
      const records = await prisma.ambassadorEnrolment.findMany({
        where: { status: "sent_to_payroll" },
        select: { id: true },
      });
      for (const r of records) {
        await transitionAmbassadorRecord({
          recordId: r.id,
          to: "paid",
          actorId: session.user.id,
        });
      }
      await prisma.ambassadorAdjustment.updateMany({
        where: { sentToPayrollAt: { not: null }, paidAt: null },
        data: { paidAt: new Date() },
      });
      return NextResponse.json({ markedPaid: records.length });
    }

    const { groups, held } = await buildGroups();

    if (parsed.data.action === "preview") {
      return NextResponse.json({
        groups: groups.map((g) => ({
          name: g.name,
          employeeId: g.employeeId,
          centres: [...g.centres],
          count: g.recordIds.length,
          gross: g.gross,
          kicker: g.kicker,
          superAmount:
            Math.round((g.gross + g.kicker) * SUPER_RATE * 100) / 100,
        })),
        held,
      });
    }

    // action === "send": move every exported record to sent_to_payroll.
    let sent = 0;
    for (const g of groups) {
      for (const recordId of g.recordIds) {
        await transitionAmbassadorRecord({
          recordId,
          to: "sent_to_payroll",
          actorId: session.user.id,
        });
        sent++;
      }
      if (g.kicker > 0) {
        await prisma.ambassadorAdjustment.updateMany({
          where: { educatorId: g.educatorId, sentToPayrollAt: null },
          data: { sentToPayrollAt: new Date() },
        });
      }
    }

    logger.info("Ambassadors payroll export sent", {
      userId: session.user.id,
      educators: groups.length,
      records: sent,
      held: held.length,
    });

    return NextResponse.json({ sent, educators: groups.length, held });
  },
  { roles: ["owner", "admin"] },
);
