/**
 * Employment Hero Payroll webhook utilities.
 *
 * EH/Yourpayroll signs webhook payloads with HMAC-SHA256 using a
 * pre-shared secret. The signature is sent in the `X-Yourpayroll-
 * Signature` header (per their public docs). Spec is sparse and EH
 * sometimes change header names, so we accept a couple of common
 * variants — the verification itself is what matters.
 *
 * Secret is `EH_PAYROLL_WEBHOOK_SECRET`. We FAIL CLOSED — if the
 * secret isn't configured, every webhook is rejected. That's safer
 * than failing open and accidentally trusting forged payloads.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const SIGNATURE_HEADERS = [
  "x-yourpayroll-signature",
  "x-keypay-signature",
  "x-eh-signature",
  "x-webhook-signature",
];

export interface VerifyResult {
  valid: boolean;
  /** Reason for failure — for logging, NOT for surfacing to the client. */
  reason?: string;
}

/**
 * Verify the HMAC-SHA256 signature attached to an EH webhook.
 *
 * @param rawBody Raw request body (string, NOT JSON-parsed — the
 *                signature is computed over the byte sequence).
 * @param headers The request headers (Next's `Headers` works directly).
 * @returns `{ valid: true }` on match, `{ valid: false, reason }` otherwise.
 */
export function verifyEhSignature(
  rawBody: string,
  headers: Headers,
): VerifyResult {
  const secret = process.env.EH_PAYROLL_WEBHOOK_SECRET;
  if (!secret) {
    return {
      valid: false,
      reason: "EH_PAYROLL_WEBHOOK_SECRET is not configured",
    };
  }

  // Find whichever signature header EH sent.
  let provided: string | null = null;
  for (const name of SIGNATURE_HEADERS) {
    const v = headers.get(name);
    if (v) {
      provided = v;
      break;
    }
  }
  if (!provided) {
    return { valid: false, reason: "No signature header on request" };
  }

  // Some providers prefix with `sha256=`. Strip if present.
  const clean = provided.startsWith("sha256=") ? provided.slice(7) : provided;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");

  // Constant-time compare to avoid timing oracles.
  if (clean.length !== expected.length) {
    return { valid: false, reason: "Signature length mismatch" };
  }
  const a = Buffer.from(clean, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) {
    return { valid: false, reason: "Signature decode-length mismatch" };
  }
  const match = timingSafeEqual(a, b);
  return match ? { valid: true } : { valid: false, reason: "Signature mismatch" };
}

/**
 * Extract a stable event ID from an EH payload, if present. EH's
 * event shape varies by event type — we try a couple of common keys.
 * Returns null when no ID can be derived; the caller can still
 * write the event but without dedup.
 */
export function extractEventId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.event_id === "string") return p.event_id;
  if (typeof p.eventId === "string") return p.eventId;
  if (typeof p.id === "string") return p.id;
  return null;
}

export function extractEventType(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "unknown";
  const p = payload as Record<string, unknown>;
  if (typeof p.event_type === "string") return p.event_type;
  if (typeof p.eventType === "string") return p.eventType;
  if (typeof p.type === "string") return p.type;
  return "unknown";
}
