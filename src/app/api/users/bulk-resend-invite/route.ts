import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";
import { logger } from "@/lib/logger";
import { issueInvite } from "@/app/api/employees/[id]/resend-invite/route";

/**
 * POST /api/users/bulk-resend-invite
 *
 * Re-issues invites for every PENDING staff member (lastLoginAt is
 * null and active = true). Admin-only. Errors on individual users
 * are caught + logged so one bad email doesn't kill the batch — the
 * response splits success/failure counts.
 *
 * Rate limited the same way as other admin bulk actions (default
 * 60/min via withApiAuth). Body is intentionally empty; the action
 * targets everyone pending across the org.
 */
export const POST = withApiAuth(async (_req: NextRequest, session) => {
  if (!isAdminRole(session!.user.role)) {
    throw ApiError.forbidden("Admin required");
  }

  const pending = await prisma.user.findMany({
    where: { active: true, lastLoginAt: null },
    select: { id: true, name: true, email: true },
  });

  if (pending.length === 0) {
    return NextResponse.json({
      ok: true,
      message: "No pending invites to resend.",
      resent: 0,
      failed: 0,
    });
  }

  let resent = 0;
  let failed = 0;
  const failures: Array<{ email: string; reason: string }> = [];

  for (const user of pending) {
    try {
      const result = await issueInvite(user);
      await prisma.activityLog.create({
        data: {
          userId: session!.user.id,
          action: "resend_invite",
          entityType: "User",
          entityId: user.id,
          details: {
            bulk: true,
            sent: result.sent,
            suppressed: result.suppressed,
          },
        },
      });
      if (result.sent) {
        resent++;
      } else {
        failed++;
        // Translate the structured reason into something an admin can
        // read in the response toast. Same vocabulary as the
        // single-user route.
        const reason =
          result.reason === "suppressed"
            ? "Email is on the suppression list (bounced previously)"
            : result.reason === "not_configured"
              ? "Server email not configured"
              : result.error || "Send failed";
        failures.push({ email: user.email, reason });
        logger.warn("Bulk resend-invite per-user not sent", {
          userId: user.id,
          email: user.email,
          reason: result.reason,
        });
      }
    } catch (err) {
      failed++;
      failures.push({
        email: user.email,
        reason: err instanceof Error ? err.message : "Unknown error",
      });
      logger.warn("Bulk resend-invite per-user threw", {
        userId: user.id,
        email: user.email,
        err,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    message:
      failed === 0
        ? `Resent invites to ${resent} pending user${resent === 1 ? "" : "s"}.`
        : `Resent ${resent}, ${failed} failed.`,
    resent,
    failed,
    failures,
  });
});
