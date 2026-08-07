import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { withApiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { suppressEmail } from "@/lib/email-suppression";
import { parseBrevoWebhookBody, SUPPRESSION_EVENTS } from "@/lib/brevo-events";

/**
 * Brevo events webhook — the missing half of marketing email tracking.
 * Campaigns send via Brevo but (pre-Phase 3) the only events webhook was
 * Resend's, so EmailEvent never recorded marketing opens/clicks.
 *
 * Auth: Brevo doesn't sign webhooks; the URL configured in Brevo carries
 * a shared secret (?secret=...) compared in constant time — same pattern
 * as /api/webhooks/nps-response.
 *
 * Idempotency: best-effort findFirst-then-create dedupe on
 * (messageId, type, email). A DB unique would be cleaner but prod already
 * holds pre-constraint rows; revisit if double-counting ever matters.
 */
function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const POST = withApiHandler(async (req) => {
  const expected = process.env.BREVO_WEBHOOK_SECRET;
  if (!expected) {
    logger.error("BREVO_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }
  const { searchParams } = new URL(req.url);
  if (!secretMatches(searchParams.get("secret"), expected)) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ received: true }); // malformed → ack, don't retry-loop
  }

  const parsed = parseBrevoWebhookBody(raw);
  if (!parsed) return NextResponse.json({ received: true });

  // Correlate back to the send that produced this event. Per-recipient sends
  // carry the DeliveryLog id directly in a `dl:<id>` tag — but the tag is
  // attacker-influenced input (anyone who knows the webhook URL+secret shape
  // could replay a forged tag), and events now surface in user-visible
  // reports, so verify the id actually exists before stamping it. One PK
  // lookup — same query count as the legacy findFirst path.
  let deliveryLogId: string | null;
  if (parsed.deliveryLogTag) {
    const exists = await prisma.deliveryLog.findUnique({
      where: { id: parsed.deliveryLogTag },
      select: { id: true },
    });
    deliveryLogId = exists?.id ?? null;
  } else {
    const deliveryLog = await prisma.deliveryLog.findFirst({
      where: parsed.campId
        ? { externalId: parsed.campId, externalIdType: "brevo_campaign" }
        : { externalId: parsed.messageId, externalIdType: "brevo_message" },
      select: { id: true },
    });
    deliveryLogId = deliveryLog?.id ?? null;
  }

  // Best-effort idempotency (Brevo retries on non-2xx).
  const existing = await prisma.emailEvent.findFirst({
    where: { messageId: parsed.messageId, type: parsed.type, email: parsed.email },
    select: { id: true },
  });
  if (!existing) {
    await prisma.emailEvent.create({
      data: {
        messageId: parsed.messageId,
        type: parsed.type,
        email: parsed.email,
        deliveryLogId,
        payload: raw as object,
      },
    });
  }

  if (SUPPRESSION_EVENTS.has(parsed.type)) {
    await suppressEmail(parsed.email, parsed.type, parsed.messageId);
    logger.warn("Email suppressed via Brevo webhook", {
      email: parsed.email,
      type: parsed.type,
    });
  }

  return NextResponse.json({ received: true });
});
