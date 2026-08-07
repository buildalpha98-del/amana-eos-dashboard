/**
 * Pure helpers for the Brevo events webhook. Brevo's event vocabulary is
 * normalised onto the canonical EmailEvent.type set already used by the
 * Resend webhook (delivered/opened/clicked/bounced/complained) plus
 * unsubscribed/blocked, so analytics never forks by provider.
 */

export type CanonicalEmailEvent =
  | "delivered"
  | "opened"
  | "clicked"
  | "bounced"
  | "complained"
  | "unsubscribed"
  | "blocked";

const EVENT_MAP: Record<string, CanonicalEmailEvent> = {
  delivered: "delivered",
  opened: "opened",
  unique_opened: "opened",
  click: "clicked",
  hard_bounce: "bounced",
  spam: "complained",
  unsubscribed: "unsubscribed",
  blocked: "blocked",
};

/** Events that add the address to the suppression list. */
export const SUPPRESSION_EVENTS: ReadonlySet<CanonicalEmailEvent> = new Set([
  "bounced",
  "complained",
  "unsubscribed",
  "blocked",
]);

/** Soft bounces, deferrals etc. are deliberately ignored (return null). */
export function normalizeBrevoEvent(event: string): CanonicalEmailEvent | null {
  return Object.prototype.hasOwnProperty.call(EVENT_MAP, event) ? EVENT_MAP[event] : null;
}

export interface ParsedBrevoEvent {
  type: CanonicalEmailEvent;
  email: string;
  /** Brevo per-recipient message-id, or `camp:<id>` for campaign-level events. */
  messageId: string;
  /** Present only on campaign events — matches DeliveryLog.externalId for brevo_campaign rows. */
  campId: string | null;
  /**
   * DeliveryLog id carried in a `dl:<id>` tag — set by the per-recipient
   * (<50) send path so webhook events correlate WITHOUT a lookup query.
   * Null for legacy sends (externalId correlation) and non-dl tags.
   */
  deliveryLogTag: string | null;
}

const DL_TAG_RE = /^dl:(.+)$/;

/** Brevo reports the send tag as `tag` (string) or `tags` (array) depending on event type. */
function extractDeliveryLogTag(body: Record<string, unknown>): string | null {
  const candidates: unknown[] = [body.tag];
  if (Array.isArray(body.tags)) candidates.push(body.tags[0]);
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const match = DL_TAG_RE.exec(candidate);
    if (match) return match[1];
  }
  return null;
}

export function parseBrevoWebhookBody(raw: unknown): ParsedBrevoEvent | null {
  if (typeof raw !== "object" || raw === null) return null;
  const body = raw as Record<string, unknown>;
  const type = typeof body.event === "string" ? normalizeBrevoEvent(body.event) : null;
  const email = typeof body.email === "string" ? body.email.toLowerCase() : null;
  if (!type || !email) return null;
  const campId = body.camp_id != null ? String(body.camp_id) : null;
  const rawMessageId = typeof body["message-id"] === "string" ? body["message-id"] : null;
  const messageId = rawMessageId ?? (campId ? `camp:${campId}` : null);
  if (!messageId) return null;
  return { type, email, messageId, campId, deliveryLogTag: extractDeliveryLogTag(body) };
}
