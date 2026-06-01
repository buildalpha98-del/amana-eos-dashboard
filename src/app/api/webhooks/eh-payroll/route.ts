/**
 * POST /api/webhooks/eh-payroll
 *
 * Inbound webhook handler for Employment Hero Payroll. Authenticated
 * via HMAC-SHA256 signature using EH_PAYROLL_WEBHOOK_SECRET. ALL
 * verified events are persisted to EhWebhookEvent regardless of
 * whether we "understand" the event type — that gives us a full
 * forensic record if EH support ever needs to reconstruct what
 * happened to a particular leave request or expense.
 *
 * Idempotency: the unique constraint on `providerEventId` means EH's
 * 3-attempt retry behaviour can't cause double-processing of any
 * event that carries an ID. Events without an ID are stored but
 * with no dedup — caller should handle accordingly.
 *
 * No auth header required — the HMAC signature IS the auth. We
 * deliberately do NOT use withApiAuth here.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import {
  verifyEhSignature,
  extractEventId,
  extractEventType,
} from "@/lib/eh-payroll-webhook";

export const POST = withApiHandler(async (req) => {
  // Must read raw body BEFORE JSON.parse — the signature is computed
  // over the byte sequence, not the parsed object.
  const rawBody = await req.text();

  const verify = verifyEhSignature(rawBody, req.headers);
  if (!verify.valid) {
    // Log the reason internally but return a generic 401 — we don't
    // want to give an attacker a discriminator for tuning their forge.
    logger.warn("EH webhook rejected", { reason: verify.reason });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventType = extractEventType(payload);
  const eventId = extractEventId(payload);

  // Persist + dedup. If providerEventId is present and already
  // exists, the upsert short-circuits — we return 200 so EH doesn't
  // retry.
  let stored;
  try {
    if (eventId) {
      stored = await prisma.ehWebhookEvent.upsert({
        where: { providerEventId: eventId },
        // Re-receiving an already-stored event is a no-op (idempotent
        // path). We keep the original receivedAt so timeline-style
        // queries don't lie about when we first heard about it.
        update: {},
        create: {
          eventType,
          providerEventId: eventId,
          payload: payload as never,
        },
      });
    } else {
      stored = await prisma.ehWebhookEvent.create({
        data: {
          eventType,
          providerEventId: null,
          payload: payload as never,
        },
      });
    }
  } catch (err) {
    // Storage failure is genuinely bad — return 500 so EH retries.
    logger.error("EH webhook storage failed", {
      err: err instanceof Error ? err.message : String(err),
      eventType,
      eventId,
    });
    return NextResponse.json(
      { error: "Storage failure" },
      { status: 500 },
    );
  }

  // Process known event types. Currently a no-op — we don't store
  // leave or expense data locally, we fetch live from EH. The hook
  // table itself IS the surface admin can read for "recent EH
  // activity." Future: when we move to a cached-local model, this is
  // where the cache invalidation lives.
  try {
    await processEvent(eventType, payload);
    await prisma.ehWebhookEvent.update({
      where: { id: stored.id },
      data: { processedAt: new Date() },
    });
  } catch (err) {
    // Don't make EH retry just because OUR handler glitched. Record
    // the error against the event row + return 200 so the audit row
    // survives.
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("EH webhook handler failed", {
      err: msg,
      eventType,
      eventId,
    });
    await prisma.ehWebhookEvent
      .update({
        where: { id: stored.id },
        data: { error: msg },
      })
      .catch(() => {
        /* swallow — already logged */
      });
  }

  return NextResponse.json({ ok: true });
});

/**
 * Known event types we act on. EH webhooks are documented sparsely;
 * known event names from observed traffic + scant docs:
 *   - leave_request.created / .updated / .deleted
 *   - expense_request.created / .updated / .deleted
 *   - employee.created / .updated / .terminated
 *
 * For now we just LOG — when there's local state to invalidate this
 * is where it lives. Returning normally from this function marks the
 * event processedAt; throwing records the error.
 */
async function processEvent(
  eventType: string,
  _payload: unknown,
): Promise<void> {
  logger.info("EH webhook event observed", { eventType });
  // No-op for v1. The event row itself is the surface admin uses.
}
