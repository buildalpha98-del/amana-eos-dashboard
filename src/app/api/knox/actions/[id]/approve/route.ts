import { NextResponse } from "next/server";
import { ApiError } from "@/lib/api-error";
import { getCentreScope } from "@/lib/centre-scope";
import { runTriageJob } from "@/lib/knox";
import { PendingActionGone, PendingActionHidden, approvePendingAction } from "@/lib/knox/actions";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { runAfter } from "@/lib/run-after";
import { withApiAuth } from "@/lib/server-auth";
import { KNOX_ROLES } from "../../../_lib";

/**
 * POST /api/knox/actions/[id]/approve
 *
 * Takes NO body. The change applied is the stored, re-validated payload; a
 * client can never supply or alter it.
 */
export const POST = withApiAuth(
  async (_req, session, context) => {
    const { id } = await context!.params!;
    const { serviceIds } = await getCentreScope(session);

    let result: { resultId: string; jobId: string | null };
    try {
      result = await approvePendingAction(
        prisma,
        id,
        { id: session.user.id, role: session.user.role, serviceIds },
        new Date(),
      );
    } catch (err) {
      if (err instanceof PendingActionHidden) throw ApiError.notFound(err.message);
      if (err instanceof PendingActionGone) throw new ApiError(410, err.message);
      throw err;
    }

    const { jobId } = result;
    if (jobId) {
      runAfter(async () => {
        try {
          await runTriageJob(jobId);
        } catch (err) {
          logger.error("Knox: post-approval re-triage failed", { jobId, err });
        }
      });
    }
    return NextResponse.json({ resultId: result.resultId, jobId });
  },
  { roles: KNOX_ROLES },
);
