/**
 * Notification fan-out for creative requests. In-app UserNotification only
 * in Phase 1 (assignment emails are a Phase 2 follow-up).
 *
 * Design (mirrors open-shift-notify): side-effect-free on failure — callers
 * have already committed; every helper try/catches and logs but never throws.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import type { CreativeRequestStatus, ProofDecision } from "@prisma/client";
import { NOTIFICATION_TYPES, type NotificationType } from "@/lib/notification-types";
import { STATUS_LABELS } from "@/lib/creative-request/constants";
import { logger } from "@/lib/logger";

type Db = PrismaClient | Prisma.TransactionClient;

export interface RequestSummary {
  id: string;
  requestNumber: string;
  title: string;
  requestedById: string;
  assigneeId: string | null;
}

function link(request: RequestSummary): string {
  return `/requests?open=${request.id}`;
}

async function createFor(
  db: Db,
  userIds: string[],
  type: NotificationType,
  title: string,
  body: string,
  requestLink: string,
): Promise<void> {
  const unique = [...new Set(userIds)].filter(Boolean);
  if (unique.length === 0) return;
  await db.userNotification.createMany({
    data: unique.map((userId) => ({ userId, type, title, body, link: requestLink })),
  });
}

/**
 * New request → every active marketing-role user (except the requester).
 * Deliberately narrower than FULFILLER_ROLES: admins/head_office/owner can
 * work the queue but shouldn't be pinged for every submission.
 */
export async function notifyRequestSubmitted(db: Db, request: RequestSummary): Promise<void> {
  try {
    const marketers = await db.user.findMany({
      where: { role: "marketing", active: true },
      select: { id: true },
    });
    await createFor(
      db,
      marketers.map((u) => u.id).filter((id) => id !== request.requestedById),
      NOTIFICATION_TYPES.CREATIVE_REQUEST_SUBMITTED,
      `New request ${request.requestNumber}`,
      request.title,
      link(request),
    );
  } catch (err) {
    logger.error("creative-request notify (submitted) failed", { err, requestId: request.id });
  }
}

/** Assignment → the assignee (unless they assigned themselves). */
export async function notifyRequestAssigned(
  db: Db,
  request: RequestSummary,
  actorId: string,
): Promise<void> {
  try {
    if (!request.assigneeId || request.assigneeId === actorId) return;
    await createFor(
      db,
      [request.assigneeId],
      NOTIFICATION_TYPES.CREATIVE_REQUEST_ASSIGNED,
      `${request.requestNumber} assigned to you`,
      request.title,
      link(request),
    );
  } catch (err) {
    logger.error("creative-request notify (assigned) failed", { err, requestId: request.id });
  }
}

/** Status move → the requester (unless they made the move themselves). */
export async function notifyRequestStatusChanged(
  db: Db,
  request: RequestSummary,
  toStatus: CreativeRequestStatus,
  actorId: string,
): Promise<void> {
  try {
    if (request.requestedById === actorId) return;
    await createFor(
      db,
      [request.requestedById],
      NOTIFICATION_TYPES.CREATIVE_REQUEST_STATUS,
      `${request.requestNumber}: ${STATUS_LABELS[toStatus]}`,
      request.title,
      link(request),
    );
  } catch (err) {
    logger.error("creative-request notify (status) failed", { err, requestId: request.id });
  }
}

/**
 * New message → the "other side". Requester wrote → assignee (if any);
 * fulfiller wrote non-internal → requester. Internal notes ping nobody
 * (team members are already in the queue).
 */
export async function notifyRequestMessage(
  db: Db,
  request: RequestSummary,
  authorId: string,
  internal: boolean,
): Promise<void> {
  try {
    if (internal) return;
    const target =
      authorId === request.requestedById ? request.assigneeId : request.requestedById;
    if (!target || target === authorId) return;
    await createFor(
      db,
      [target],
      NOTIFICATION_TYPES.CREATIVE_REQUEST_MESSAGE,
      `New comment on ${request.requestNumber}`,
      request.title,
      link(request),
    );
  } catch (err) {
    logger.error("creative-request notify (message) failed", { err, requestId: request.id });
  }
}

/** Proof uploaded → the requester ("proof ready for your review").
 *  Skips when the uploader IS the requester (marketing self-request). */
export async function notifyProofReady(
  db: Db,
  request: RequestSummary,
  version: number,
  actorId: string,
): Promise<void> {
  try {
    if (request.requestedById === actorId) return;
    await createFor(
      db,
      [request.requestedById],
      NOTIFICATION_TYPES.CREATIVE_REQUEST_PROOF_READY,
      `${request.requestNumber}: proof v${version} ready for review`,
      request.title,
      link(request),
    );
  } catch (err) {
    logger.error("creative-request notify (proof ready) failed", { err, requestId: request.id });
  }
}

/** Decision made → the assignee, or every marketing user if unassigned. */
export async function notifyProofDecision(
  db: Db,
  request: RequestSummary,
  version: number,
  decision: ProofDecision,
  actorId: string,
): Promise<void> {
  try {
    const label: Record<ProofDecision, string> = {
      approved: "approved",
      approved_with_changes: "approved with changes",
      changes_requested: "changes requested",
    };
    let targets: string[];
    if (request.assigneeId) {
      targets = [request.assigneeId];
    } else {
      const marketers = await db.user.findMany({
        where: { role: "marketing", active: true },
        select: { id: true },
      });
      targets = marketers.map((u) => u.id);
    }
    await createFor(
      db,
      targets.filter((id) => id !== actorId),
      NOTIFICATION_TYPES.CREATIVE_REQUEST_PROOF_DECISION,
      `${request.requestNumber}: proof v${version} ${label[decision]}`,
      request.title,
      link(request),
    );
  } catch (err) {
    logger.error("creative-request notify (proof decision) failed", { err, requestId: request.id });
  }
}
