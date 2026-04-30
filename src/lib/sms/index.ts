/**
 * SMS dispatch abstraction.
 *
 * Provider-neutral: the rest of the app calls `sendSms(...)` and the
 * provider is selected by the `SMS_PROVIDER` env var. This keeps the
 * call sites stable when Amana eventually switches between MessageMedia,
 * Twilio, ClickSend, etc., or runs locally with no provider configured.
 *
 * Default behaviour with no provider configured: log a warning and return
 * `{ ok: false, reason: "not_configured" }`. Calling code treats this as
 * a soft failure (the email channel still goes out, the broadcast row is
 * still recorded), so dev / preview deploys don't fail.
 *
 * Australian-context defaults:
 *   - All numbers are normalised to E.164 starting with +61 if they begin
 *     with a leading 0 or contain only digits (assumed AU mobile).
 *   - The provider is responsible for SenderID rules (alphanumeric in AU
 *     requires registration). Default is the env-set sender or "Amana".
 *
 * Spam Act 2003 compliance is the caller's responsibility — call sites
 * filter recipients on the `CentreContact.smsOptIn` flag before dispatch.
 */

import { logger } from "@/lib/logger";

export interface SmsRecipient {
  /** Free-text Australian mobile (with or without country code). */
  number: string;
  /** Optional ID for logging / dedupe. */
  contactId?: string;
}

export interface SendSmsRequest {
  to: SmsRecipient | SmsRecipient[];
  body: string;
  /** Override the default sender ID for this message. */
  from?: string;
}

export type SendSmsResult =
  | { ok: true; provider: string; messageIds: string[] }
  | { ok: false; reason: "not_configured" | "all_invalid" | "provider_error"; details?: unknown };

/** Normalise an Australian mobile to E.164 (+614xxxxxxxx). Returns null on invalid. */
export function normaliseAuMobile(raw: string): string | null {
  if (!raw) return null;
  // Strip all non-digit/+ characters
  const cleaned = raw.replace(/[^\d+]/g, "");
  if (!cleaned) return null;
  // Already in E.164
  if (cleaned.startsWith("+61")) {
    if (cleaned.length === 12 && cleaned[3] === "4") return cleaned;
    return null;
  }
  // Local format starting with 04
  if (cleaned.startsWith("04") && cleaned.length === 10) {
    return `+61${cleaned.slice(1)}`;
  }
  // Just digits 4xxxxxxxx
  if (cleaned.startsWith("4") && cleaned.length === 9) {
    return `+61${cleaned}`;
  }
  return null;
}

export async function sendSms(req: SendSmsRequest): Promise<SendSmsResult> {
  const recipients = Array.isArray(req.to) ? req.to : [req.to];
  const validated = recipients
    .map((r) => ({ ...r, number: normaliseAuMobile(r.number) }))
    .filter((r): r is { number: string; contactId?: string } => r.number !== null);

  if (validated.length === 0) {
    logger.warn("sendSms: all recipient numbers invalid", {
      attempted: recipients.length,
    });
    return { ok: false, reason: "all_invalid" };
  }

  const provider = process.env.SMS_PROVIDER ?? "";

  if (provider === "messagemedia") {
    const { sendViaMessageMedia } = await import("./messagemedia");
    return sendViaMessageMedia({
      to: validated,
      body: req.body,
      from: req.from ?? process.env.SMS_FROM ?? "Amana",
    });
  }

  // No provider configured — log and report soft failure.
  logger.warn("sendSms: no SMS_PROVIDER configured; SMS not dispatched", {
    recipientCount: validated.length,
    bodyPreview: req.body.slice(0, 40),
  });
  return { ok: false, reason: "not_configured" };
}
