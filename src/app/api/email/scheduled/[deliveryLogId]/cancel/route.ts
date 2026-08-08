import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import { cancelScheduledCampaign, cancelScheduledMessage } from "@/lib/brevo";
import { REPORT_ROLES } from "../../../reports/[deliveryLogId]/route";

/**
 * POST /api/email/scheduled/:deliveryLogId/cancel — cancel a scheduled send.
 *
 * Canonical sequence (order matters):
 * 1. findUnique — a claim-first design can't distinguish "no such row" (404)
 *    from "already sent/cancelled" (409), so we always look the row up first.
 * 2. Conditional claim: updateMany with the status guard IN THE WHERE — two
 *    concurrent cancels (or a cancel racing the dispatch) can't both win;
 *    count 0 means the row already left "scheduled" → 409.
 * 3. Brevo best-effort per externalIdType. The payload is deliberately NOT
 *    cleared: the janitor's list cleanup reads _brevoListId, and once the
 *    status leaves "scheduled" the temp list becomes sweepable — desired.
 */
export const POST = withApiAuth(
  async (req, session, context) => {
    const { deliveryLogId } = await context!.params!;

    const log = await prisma.deliveryLog.findUnique({
      where: { id: deliveryLogId },
      select: {
        id: true,
        status: true,
        externalId: true,
        externalIdType: true,
        payload: true,
      },
    });
    if (!log) {
      throw ApiError.notFound("Send not found");
    }

    // Legacy rows predate externalIdType stamping — we can't know where the
    // send lives on Brevo's side, so refuse (status untouched) rather than
    // guess and cancel the wrong thing.
    if (!log.externalIdType) {
      throw ApiError.conflict(
        "This send predates cancel support — cancel it in Brevo directly",
      );
    }

    const claimed = await prisma.deliveryLog.updateMany({
      where: { id: deliveryLogId, status: "scheduled" },
      data: { status: "cancelled" },
    });
    if (claimed.count === 0) {
      throw ApiError.conflict(
        "This send has already been sent or cancelled",
      );
    }

    // ── Brevo best-effort (post-claim) ────────────────────────────
    // Errors past this point do NOT roll the claim back: the local row stays
    // "cancelled" — local truth beats Brevo best-effort. Worst case the email
    // still goes out and the webhook events tell the story; the alternative
    // (un-cancelling on a Brevo hiccup) would leave a send the user believes
    // is cancelled quietly re-armed.
    let brevoCancelled = false;
    let detail: string | undefined;
    try {
      if (log.externalIdType === "brevo_campaign" && log.externalId) {
        await cancelScheduledCampaign(log.externalId);
        brevoCancelled = true;
      } else if (log.externalIdType === "brevo_message" && log.externalId) {
        await cancelScheduledMessage(log.externalId);
        brevoCancelled = true;
      } else if (log.externalIdType === "brevo_message_per_recipient") {
        const payload = log.payload as Record<string, unknown> | null;
        const rawIds = Array.isArray(payload?._sentMessageIds)
          ? (payload._sentMessageIds as Array<{
              email?: string;
              messageId?: string;
            }>)
          : [];
        const messageIds = rawIds
          .map((entry) => entry?.messageId)
          .filter((m): m is string => typeof m === "string" && m.length > 0);

        if (messageIds.length === 0) {
          // Pre-capture rows (scheduled before _sentMessageIds shipped) have
          // nothing to cancel Brevo-side — local cancel only.
          detail =
            "scheduled before cancel support — cancel it in Brevo manually if needed";
        } else {
          for (const messageId of messageIds) {
            await cancelScheduledMessage(messageId);
          }
          brevoCancelled = true;
        }
      } else {
        // Known type but no externalId to act on — local cancel only.
        detail =
          "no Brevo reference on this send — cancel it in Brevo manually if needed";
      }
    } catch (err) {
      logger.warn("Scheduled cancel: Brevo-side cancel failed after local claim", {
        deliveryLogId,
        externalIdType: log.externalIdType,
        error: err instanceof Error ? err.message : String(err),
      });
      brevoCancelled = false;
      detail =
        "cancelled locally, but the Brevo-side cancel failed — check Brevo if the send still goes out";
    }

    return NextResponse.json({
      cancelled: true,
      brevoCancelled,
      ...(detail ? { detail } : {}),
    });
  },
  { roles: [...REPORT_ROLES] },
);
