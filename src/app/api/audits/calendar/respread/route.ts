import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";

const schema = z.object({
  year: z.number().int().min(2024).max(2030),
});

/**
 * POST /api/audits/calendar/respread
 *
 * Recalculates dueDate for all audit instances in a given year based on their
 * scheduledMonth. Use after fixing a broken calendar import.
 */
export const POST = withApiAuth(async (req) => {
  const body = await parseJsonBody(req);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { year } = parsed.data;

  // Get all instances for this year with their template's scheduledMonths
  const instances = await prisma.auditInstance.findMany({
    where: { scheduledYear: year },
    select: {
      id: true,
      scheduledMonth: true,
      scheduledYear: true,
      dueDate: true,
      template: { select: { scheduledMonths: true } },
    },
  });

  let fixed = 0;

  for (const inst of instances) {
    // Recalculate dueDate: last day of scheduledMonth
    // new Date(year, month, 0) where month is 1-indexed = last day of that month
    const correctDueDate = new Date(inst.scheduledYear, inst.scheduledMonth, 0);
    correctDueDate.setHours(23, 59, 59, 999);

    // Check if dueDate is wrong
    const currentDue = new Date(inst.dueDate);
    if (
      currentDue.getMonth() + 1 !== inst.scheduledMonth ||
      currentDue.getFullYear() !== inst.scheduledYear
    ) {
      await prisma.auditInstance.update({
        where: { id: inst.id },
        data: { dueDate: correctDueDate },
      });
      fixed++;
    }
  }

  return NextResponse.json({
    success: true,
    total: instances.length,
    fixed,
    message: `Recalculated ${fixed} of ${instances.length} audit instance due dates for ${year}.`,
  });
}, { roles: ["owner", "head_office", "admin"] });
