/**
 * POST /api/eh-payroll/map
 *
 * Links a dashboard User to an EH Payroll Employee. Admin-only.
 * Two flows:
 *   - `employeeId: <number>` → verify the EH employee exists + is
 *     Active, then write the mapping. Returns the new mapping with
 *     the EH name so the UI can confirm "yes that's the right person."
 *   - `employeeId: null` → clear the mapping.
 *
 * Verification is the important bit: with the old behaviour an admin
 * could type 999999 and we'd happily save it; the staff member would
 * then see an empty payslips list with no obvious reason. Now we
 * reject unknown IDs at write time with a clear error.
 *
 * Conflicts:
 *   - 409 if the target employee is already mapped to a DIFFERENT user
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { getEmployee, EhPayrollError, isConfigured } from "@/lib/eh-payroll";
import { logger } from "@/lib/logger";

const bodySchema = z.object({
  userId: z.string().min(1),
  // null = clear; positive int = link.
  employeeId: z.number().int().positive().nullable(),
});

export const POST = withApiAuth(
  async (req, session) => {
    if (!isConfigured()) {
      throw ApiError.badRequest("Payroll integration not configured");
    }

    const raw = await parseJsonBody(req);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      throw ApiError.badRequest(
        "Validation failed",
        parsed.error.flatten().fieldErrors,
      );
    }
    const { userId, employeeId } = parsed.data;

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, active: true, employmentHeroEmployeeId: true },
    });
    if (!target) throw ApiError.notFound("User not found");

    // Verify the EH side before writing — only when linking.
    let ehName: string | null = null;
    if (employeeId !== null) {
      try {
        const eh = await getEmployee(employeeId);
        if (eh.status !== "Active") {
          throw ApiError.badRequest(
            `EH employee ${employeeId} exists but is ${eh.status}. Only Active employees can be linked.`,
          );
        }
        ehName = `${eh.firstName} ${eh.surname}`.trim();
      } catch (err) {
        if (err instanceof ApiError) throw err;
        if (err instanceof EhPayrollError) {
          if (err.status === 404) {
            throw ApiError.notFound(
              `No EH employee with id ${employeeId}. Double-check the number from Employment Hero.`,
            );
          }
          logger.warn("EH map: lookup failed", { employeeId, status: err.status });
          throw new ApiError(
            502,
            `Couldn't verify against Employment Hero (HTTP ${err.status}). Try again.`,
          );
        }
        throw err;
      }

      // Pre-check uniqueness so we give a friendly 409 instead of P2002.
      const existing = await prisma.user.findUnique({
        where: { employmentHeroEmployeeId: employeeId },
        select: { id: true, name: true },
      });
      if (existing && existing.id !== userId) {
        throw ApiError.conflict(
          `EH employee ${employeeId} (${ehName}) is already linked to ${existing.name}. Unlink that first.`,
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
          ehName,
        },
      },
    });

    return NextResponse.json({
      ...updated,
      // Surface the EH name to the client so the UI can render
      // "Linked to <ehName>" without making a second round-trip.
      ehName,
    });
  },
  { roles: ["owner", "head_office", "admin"] },
);
