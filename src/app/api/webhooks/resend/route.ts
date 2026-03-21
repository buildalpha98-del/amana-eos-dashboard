import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { prisma } from "@/lib/prisma";
import { suppressEmail } from "@/lib/email-suppression";

/**
 * POST /api/webhooks/resend — Handle Resend webhook events
 *
 * Verifies the signature via Svix, logs all events, and
 * suppresses email addresses that bounce or complain.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error("RESEND_WEBHOOK_SECRET is not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  // ── Verify Svix signature ────────────────────────────────
  const body = await req.text();
  const headers = {
    "svix-id": req.headers.get("svix-id") ?? "",
    "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
    "svix-signature": req.headers.get("svix-signature") ?? "",
  };

  let payload: Record<string, unknown>;
  try {
    const wh = new Webhook(secret);
    payload = wh.verify(body, headers) as Record<string, unknown>;
  } catch {
    console.error("Resend webhook signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // ── Reject stale webhooks (replay attack protection) ───────
  const timestampHeader = headers["svix-timestamp"];
  if (timestampHeader) {
    const timestampSeconds = parseInt(timestampHeader, 10);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const MAX_AGE_SECONDS = 300; // 5 minutes

    if (isNaN(timestampSeconds) || nowSeconds - timestampSeconds > MAX_AGE_SECONDS) {
      console.error("Resend webhook rejected: timestamp too old or invalid");
      return NextResponse.json({ error: "Webhook timestamp expired" }, { status: 401 });
    }
  }

  // ── Parse event ──────────────────────────────────────────
  const eventType = payload.type as string | undefined;
  const data = payload.data as Record<string, unknown> | undefined;

  if (!eventType || !data) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // Map Resend event types to simpler names
  const typeMap: Record<string, string> = {
    "email.delivered": "delivered",
    "email.bounced": "bounced",
    "email.complained": "complained",
    "email.opened": "opened",
    "email.clicked": "clicked",
  };

  const shortType = typeMap[eventType];
  if (!shortType) {
    // Unknown event type — acknowledge but don't process
    return NextResponse.json({ received: true });
  }

  const messageId = (data.email_id as string) ?? "";
  // Resend sends recipient info in `to` (array of strings) or `email`
  const recipients: string[] = Array.isArray(data.to)
    ? (data.to as string[])
    : typeof data.email === "string"
      ? [data.email as string]
      : [];

  // ── Log all events ─────────────────────────────────────────
  for (const email of recipients) {
    await prisma.emailEvent.create({
      data: {
        messageId,
        type: shortType,
        email: email.toLowerCase(),
        payload: payload as object,
      },
    });

    // ── Suppress on bounce / complaint ─────────────────────
    if (shortType === "bounced" || shortType === "complained") {
      await suppressEmail(email, shortType, messageId);
      console.warn(`Email suppressed: ${email} (${shortType}, messageId: ${messageId})`);
    }
  }

  return NextResponse.json({ received: true });
}
