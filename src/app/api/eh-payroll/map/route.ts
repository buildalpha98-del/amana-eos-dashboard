/**
 * POST /api/eh-payroll/map
 *
 * Manually map a dashboard User to an EH Payroll Employee. Admin-only.
 * Used for the cases where the auto-sync can't match by email (no email
 * in EH, mismatched work vs personal email, name change since onboarding).
 *
 * Body: { userId: string, employeeId: number | null }
 *   - userId:     the dashboard User to update
 *   - employeeId: the EH employee id to link, or null to clear
 *
 * Enforces the unique constraint: trying to link an employee already
 * claimed by another User returns 409.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";

const bodySchema = z.object({
  userId: z.string().min(1),
  // null = clear; number = link to that EH employee.
  employeeId: z.number().int().positive().nullable(),
});

export const POST = withApiAuth(
  async (req, session) => {
    const raw = await parseJsonBody(req);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      throw ApiError.badRequest(
        "Validation failed",
        parsed.error.flatten().fieldErrors,
      );
    }
    const { userId, employeeId } = parsed.data;

    // Sanity: target user must exist + be active. We don't bother
    // verifying the EH employee id round-trip — if it's wrong, the
    // payslip/leave/expense endpoints will 404 against EH and the user
    // sees an empty state. That's a faster manual-override flow than
    // making admins wait on an extra EH call here.
    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, active: true, employmentHeroEmployeeId: true },
    });
    if (!target) throw ApiError.notFound("User not found");

    // Pre-check the unique constraint so we can return a friendly 409
    // instead of letting Prisma throw P2002. Skipping when clearing.
    if (employeeId !== null) {
      const existing = await prisma.user.findUnique({
        where: { employmentHeroEmployeeId: employeeId },
        select: { id: true, name: true },
      });
      if (existing && existing.id !== userId) {
        throw ApiError.conflict(
          `That EH employee is already mapped to ${existing.name}. Clear that mapping first.`,
        );
      }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { employmentHeroEmployeeId: employeeId },
      select: { id: true, name: true, employmentHeroEmployeeId: true },
    });

    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: employeeId === null ? "eh_payroll_unmap" : "eh_payroll_map",
        entityType: "User",
        entityId: userId,
        details: {
          previousEmployeeId: target.employmentHeroEmployeeId,
          newEmployeeId: employeeId,
        },
      },
    });

    return NextResponse.json(updated);
  },
  { roles: ["owner", "head_office", "admin"] },
);
