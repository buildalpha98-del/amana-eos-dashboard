/**
 * POST /api/separations/[id]/sync-eh
 *
 * Retry pushing the separation's last-working-day to Employment Hero.
 * Used by the "Retry EH sync" button on SeparationTab after a failure
 * (EH was down, employeeId was missing when the record was first
 * created, etc.). Idempotent — safe to call any number of times.
 *
 * Same behaviour as the auto-sync from /api/separations POST + PATCH:
 * on success stamp ehTerminationSyncedAt and clear ehTerminationError;
 * on failure stamp the error and keep the local record intact.
 *
 * Visibility: owner / head_office / admin.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import {
  isConfigured as isEhConfigured,
  terminateEmployee,
  EhPayrollError,
} from "@/lib/eh-payroll";

export const POST = withApiAuth(
  async (_req, session, context) => {
    const { id } = await context!.params!;
    const record = await prisma.separationRecord.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        lastWorkingDay: true,
        deleted: true,
      },
    });
    if (!record || record.deleted) {
      throw ApiError.notFound("Separation record not found");
    }

    if (!isEhConfigured()) {
      await prisma.separationRecord.update({
        where: { id },
        data: {
          ehTerminationSyncedAt: null,
          ehTerminationError: "Employment Hero integration not configured",
        },
      });
      return NextResponse.json(
        { synced: false, reason: "not_configured" },
        { status: 200 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: record.userId },
      select: { employmentHeroEmployeeId: true },
    });
    if (!user?.employmentHeroEmployeeId) {
      await prisma.separationRecord.update({
        where: { id },
        data: {
          ehTerminationSyncedAt: null,
          ehTerminationError:
            "Not linked to Employment Hero — no employmentHeroEmployeeId on user record. Terminate manually in EH.",
        },
      });
      return NextResponse.json(
        { synced: false, reason: "not_linked" },
        { status: 200 },
      );
    }

    const iso = record.lastWorkingDay.toISOString().slice(0, 10);
    try {
      await terminateEmployee(user.employmentHeroEmployeeId, {
        terminationDate: iso,
      });
      await prisma.separationRecord.update({
        where: { id },
        data: { ehTerminationSyncedAt: new Date(), ehTerminationError: null },
      });
      logger.info("Separation → EH sync retry succeeded", {
        recordId: id,
        actorId: session!.user.id,
      });
      return NextResponse.json({ synced: true, terminationDate: iso });
    } catch (err) {
      const msg =
        err instanceof EhPayrollError
          ? `EH ${err.status}: ${typeof err.body === "string" ? err.body : "rejected termination"}`
          : err instanceof Error
            ? err.message
            : "Unknown EH error";
      await prisma.separationRecord.update({
        where: { id },
        data: { ehTerminationSyncedAt: null, ehTerminationError: msg },
      });
      logger.warn("Separation → EH sync retry failed", {
        recordId: id,
        error: msg,
      });
      return NextResponse.json(
        { synced: false, reason: "eh_error", error: msg },
        { status: 200 },
      );
    }
  },
  { roles: ["owner", "head_office", "admin"] },
);
