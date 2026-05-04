/**
 * Open-shift notifications. Fires when a coordinator publishes a week
 * that contains one or more unassigned shifts — every active staff
 * member at the affected service gets:
 *
 *   1. An in-app `UserNotification` (so the bell counter ticks),
 *   2. A digest email summarising every open shift posted in this
 *      publish call (so they don't miss it if they don't open the
 *      dashboard for a day).
 *
 * Design notes:
 *  - **Service-scoped** — only staff currently `User.serviceId === serviceId`
 *    receive the notification. Cross-attached users (multi-service) are a
 *    follow-up; today the model is single-service.
 *  - **Active only** — `User.active === true`. Deactivated accounts get
 *    nothing.
 *  - **Excludes the publisher** — the admin/Director who hit Publish
 *    doesn't need to see "an open shift was posted" — they posted it.
 *  - **Email suppression-aware** — `sendEmail()` already short-circuits
 *    suppressed addresses; we don't double-check.
 *  - **Side-effect-free on failure** — the publish API has already
 *    committed by the time we run. Wrap each per-user send in a try
 *    that logs but swallows so one bounce doesn't deny others.
 *
 * 2026-05-04: introduced as the smallest piece of the open-shift v2
 * follow-up queued in `next-priorities.md`.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { sendEmail } from "@/lib/email";
import {
  openShiftPostedEmail,
  type OpenShiftSummary,
} from "@/lib/email-templates";
import { NOTIFICATION_TYPES } from "@/lib/notification-types";
import { logger } from "@/lib/logger";

interface OpenShiftRow {
  id: string;
  date: Date;
  sessionType: OpenShiftSummary["sessionType"];
  shiftStart: string;
  shiftEnd: string;
  role: string | null;
}

interface NotifyParams {
  serviceId: string;
  serviceName: string;
  /** The newly-published open shifts to advertise. */
  openShifts: OpenShiftRow[];
  /** User who triggered the publish — excluded from recipients. */
  publishedById?: string | null;
  /** Absolute URL to /my-portal (or wherever OpenShiftsCard lives). */
  openShiftsUrl: string;
}

interface NotifyResult {
  recipientCount: number;
  emailsSent: number;
  inAppCreated: number;
}

/**
 * Pure, prisma-injected notifier. Designed to be unit-testable with
 * the existing `prismaMock`. Caller can pass either `prisma` or a
 * transaction client.
 */
export async function notifyOpenShiftsPosted(
  prismaClient: PrismaClient | Prisma.TransactionClient,
  params: NotifyParams,
): Promise<NotifyResult> {
  const { serviceId, serviceName, openShifts, publishedById, openShiftsUrl } =
    params;

  if (openShifts.length === 0) {
    return { recipientCount: 0, emailsSent: 0, inAppCreated: 0 };
  }

  // Find every active staff/member at this service. Exclude the
  // publisher themselves. Order by id for deterministic test output.
  const recipients = await prismaClient.user.findMany({
    where: {
      serviceId,
      active: true,
      role: { in: ["staff", "member"] },
      ...(publishedById ? { id: { not: publishedById } } : {}),
    },
    select: { id: true, name: true, email: true },
    orderBy: { id: "asc" },
  });

  if (recipients.length === 0) {
    return { recipientCount: 0, emailsSent: 0, inAppCreated: 0 };
  }

  // ── In-app: one UserNotification per recipient ─────────────────
  // Single createMany so the bell counter updates atomically. We use
  // a generic title/body summarising the count; the in-app bell
  // doesn't render a per-shift list.
  const summaryBody =
    openShifts.length === 1
      ? `An open shift at ${serviceName} is up for grabs.`
      : `${openShifts.length} open shifts at ${serviceName} are up for grabs.`;

  let inAppCreated = 0;
  try {
    const created = await prismaClient.userNotification.createMany({
      data: recipients.map((r) => ({
        userId: r.id,
        type: NOTIFICATION_TYPES.OPEN_SHIFT_POSTED,
        title: "Open shift available — first to claim wins",
        body: summaryBody,
        link: "/my-portal",
      })),
    });
    inAppCreated = created.count;
  } catch (err) {
    // Don't take the whole publish path down if the bell write fails.
    logger.error("notifyOpenShiftsPosted: in-app createMany failed", {
      err: err instanceof Error ? err : new Error(String(err)),
      serviceId,
    });
  }

  // ── Email: per-recipient digest ────────────────────────────────
  const summaries: OpenShiftSummary[] = openShifts.map((s) => ({
    date: s.date.toISOString().split("T")[0],
    sessionType: s.sessionType,
    shiftStart: s.shiftStart,
    shiftEnd: s.shiftEnd,
    role: s.role,
  }));

  let emailsSent = 0;
  for (const recipient of recipients) {
    if (!recipient.email) continue;
    try {
      const tpl = openShiftPostedEmail(
        recipient.name,
        serviceName,
        summaries,
        openShiftsUrl,
      );
      const result = await sendEmail({
        to: recipient.email,
        subject: tpl.subject,
        html: tpl.html,
      });
      if (result.sent.length > 0) emailsSent += 1;
    } catch (err) {
      // Swallow + log per-user. One bounce shouldn't block the rest.
      logger.warn("notifyOpenShiftsPosted: email send failed", {
        err: err instanceof Error ? err.message : String(err),
        userId: recipient.id,
        email: recipient.email,
      });
    }
  }

  return {
    recipientCount: recipients.length,
    emailsSent,
    inAppCreated,
  };
}
