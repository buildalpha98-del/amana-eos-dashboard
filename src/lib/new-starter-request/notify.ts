/**
 * Notification fan-out for onboarding (new-starter) requests. Mirrors
 * src/lib/creative-request/notify.ts's contract exactly: side-effect-free
 * on failure — the caller has already committed the request row, so every
 * helper try/catches and logs but never throws.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { NOTIFICATION_TYPES } from "@/lib/notification-types";
import { logger } from "@/lib/logger";

type Db = PrismaClient | Prisma.TransactionClient;

export interface NewStarterRequestSummary {
  id: string;
  fullName: string;
  requestedById: string;
}

function link(request: NewStarterRequestSummary): string {
  return `/team?tab=onboarding&open=${request.id}`;
}

/**
 * New request → every active admin-tier user (owner/head_office/admin),
 * except the submitter themselves (a state manager submitting doesn't
 * need to be told about their own submission).
 */
export async function notifyNewStarterRequestSubmitted(
  db: Db,
  request: NewStarterRequestSummary,
): Promise<void> {
  try {
    const admins = await db.user.findMany({
      where: { role: { in: ["owner", "head_office", "admin"] }, active: true },
      select: { id: true },
    });
    const targets = admins.map((u) => u.id).filter((id) => id !== request.requestedById);
    if (targets.length === 0) return;
    await db.userNotification.createMany({
      data: targets.map((userId) => ({
        userId,
        type: NOTIFICATION_TYPES.NEW_STARTER_REQUEST_SUBMITTED,
        title: "New onboarding request",
        body: `${request.fullName} needs an account set up`,
        link: link(request),
      })),
    });
  } catch (err) {
    logger.error("new-starter-request notify (submitted) failed", { err, requestId: request.id });
  }
}
