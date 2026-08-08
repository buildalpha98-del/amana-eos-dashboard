import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { getSuppressedEmails } from "@/lib/email-suppression";
import { recordMarketingSends } from "@/lib/frequency-cap";
import { dispatchPerRecipient } from "@/lib/email-dispatch";
import { REPORT_ROLES } from "../route";

/**
 * POST /api/email/reports/:deliveryLogId/resend — one-click retry of a
 * PARTIAL per-recipient send's failed recipients.
 *
 * Re-dispatches the original's stored rendering (renderedHtml + the subject
 * COLUMN) verbatim to payload._failedRecipients only. A NEW DeliveryLog row
 * owns the retry end-to-end (same pre-create-"sending" → terminal-update
 * lifecycle as campaign/send); the ORIGINAL row is never mutated beyond a
 * payload._resendDeliveryLogId stamp — its recipientCount is the report
 * denominator and must stay untouched.
 *
 * Suppression IS re-checked (the original failure may have caused an
 * auto-suppression). The frequency cap deliberately is NOT: this is a retry
 * of an already-attempted send — the original dispatch already "spent" the
 * cap slot for these recipients' week, and cap-blocking a retry would make a
 * transient Brevo error permanently eat the message.
 */
export const POST = withApiAuth(
  async (req, session, context) => {
    const { deliveryLogId } = await context!.params!;

    const original = await prisma.deliveryLog.findUnique({
      where: { id: deliveryLogId },
      select: {
        id: true,
        status: true,
        messageType: true,
        serviceCode: true,
        subject: true,
        renderedHtml: true,
        payload: true,
      },
    });
    if (!original) {
      throw ApiError.notFound("Send not found");
    }

    if (original.status !== "partial") {
      throw ApiError.conflict(
        "Only partial sends can be re-sent — this send has no failed recipients to retry",
      );
    }

    const originalPayload =
      (original.payload as Record<string, unknown> | null) ?? {};
    const failedRecipients = Array.isArray(originalPayload._failedRecipients)
      ? (originalPayload._failedRecipients as unknown[]).filter(
          (e): e is string => typeof e === "string" && e.length > 0,
        )
      : [];
    if (failedRecipients.length === 0) {
      throw ApiError.conflict(
        "This send has no recorded failed recipients to retry",
      );
    }

    if (original.renderedHtml == null) {
      throw ApiError.conflict(
        "This send predates stored content — compose a fresh send",
      );
    }

    // ── Suppression re-check ────────────────────────────────────────
    // getSuppressedEmails returns a LOWERCASED set — compare lowercase to
    // lowercase, or the filter silently matches nothing.
    const suppressed = await getSuppressedEmails(failedRecipients);
    const retryEmails = failedRecipients.filter(
      (email) => !suppressed.has(email.toLowerCase()),
    );
    const suppressedCount = failedRecipients.length - retryEmails.length;

    if (retryEmails.length === 0) {
      throw ApiError.conflict(
        "All failed recipients have since been suppressed (bounced or unsubscribed) — there is nobody left to re-send to",
      );
    }

    // ── Pre-create the retry's own DeliveryLog row ──────────────────
    const log = await prisma.deliveryLog.create({
      data: {
        channel: "email",
        messageType: original.messageType,
        serviceCode: original.serviceCode,
        externalId: null,
        externalIdType: "brevo_message_per_recipient",
        recipientCount: retryEmails.length,
        status: "sending",
        subject: original.subject,
        renderedHtml: original.renderedHtml,
        payload: {
          _resendOfDeliveryLogId: original.id,
          _suppressedCount: suppressedCount,
        },
      },
    });

    // The original stored only emails (no names) in _failedRecipients.
    const {
      sent,
      failed: retryFailed,
      firstError,
    } = await dispatchPerRecipient({
      recipients: retryEmails.map((email) => ({ email })),
      subject: original.subject ?? "",
      html: original.renderedHtml,
      tags: [`dl:${log.id}`],
    });

    const failedCount = retryFailed.length;
    const sentCount = retryEmails.length - failedCount;
    let status: string;
    if (failedCount === retryEmails.length) status = "failed";
    else if (failedCount > 0) status = "partial";
    else status = "sent";

    // The wrapper's "unknown" messageId fallback is useless for later
    // cancellation — filtered here, same as campaign/send.
    const sentMessageIds = sent.filter((s) => s.messageId !== "unknown");

    await prisma.deliveryLog.update({
      where: { id: log.id },
      data: {
        status,
        // Dispatch completed (at least one recipient reached) for sent/partial;
        // "failed" delivered nothing, so no sentAt stamp.
        ...(status === "sent" || status === "partial"
          ? { sentAt: new Date() }
          : {}),
        ...(failedCount > 0
          ? {
              errorMessage:
                `${failedCount} of ${retryEmails.length} recipient sends failed` +
                (firstError ? ` — first error: ${firstError}` : ""),
            }
          : {}),
        payload: {
          _resendOfDeliveryLogId: original.id,
          _suppressedCount: suppressedCount,
          _sentMessageIds: sentMessageIds,
          ...(failedCount > 0 ? { _failedRecipients: retryFailed } : {}),
        },
      },
    });

    // Ledger: successes count toward each recipient's weekly volume (they
    // were never recorded — the original dispatch failed for them). The lib
    // no-ops on an empty list.
    const retryFailedSet = new Set(retryFailed);
    await recordMarketingSends(
      prisma,
      retryEmails
        .filter((email) => !retryFailedSet.has(email))
        .map((email) => ({ email })),
      { deliveryLogId: log.id, source: "resend" },
    );

    if (status === "failed") {
      // Mirrors campaign/send's total-failure convention: the pre-created row
      // is terminal-updated to "failed" and the response is a 502 carrying
      // failedCount. The original is deliberately NOT stamped — nothing was
      // delivered, so the user can retry again once Brevo recovers.
      return NextResponse.json(
        {
          deliveryLogId: log.id,
          sentCount: 0,
          failedCount,
          suppressedCount,
          error: firstError ?? "All recipient sends failed",
        },
        { status: 502 },
      );
    }

    // Stamp the ORIGINAL so the report can show "Retried in a follow-up
    // send" (and the panel hides the button). Spread preserves every other
    // payload key — _failedRecipients, _sentMessageIds, the request body.
    await prisma.deliveryLog.update({
      where: { id: original.id },
      data: {
        payload: { ...originalPayload, _resendDeliveryLogId: log.id },
      },
    });

    return NextResponse.json({
      deliveryLogId: log.id,
      sentCount,
      failedCount,
      suppressedCount,
    });
  },
  { roles: [...REPORT_ROLES] },
);
