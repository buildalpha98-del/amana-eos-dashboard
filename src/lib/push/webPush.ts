/**
 * Web Push infrastructure.
 *
 * Two surfaces:
 * - `sendPush(subscription, payload)` — low-level, one endpoint at a time.
 *   Re-throws so callers can inspect `err.statusCode` (used by our route
 *   handlers when they need to react to 4xx/5xx explicitly).
 *
 * - `sendPushToContact(contactId, payload)` — high-level, fan-out to every
 *   subscription for a parent CentreContact. Handles 410/404 by deleting
 *   the stale subscription row, so dead endpoints don't accumulate.
 *
 * VAPID keys are picked up from:
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY (public, also served to the browser)
 *   VAPID_PRIVATE_KEY           (server-only)
 *   VAPID_SUBJECT               (mailto: URI — defaults to noreply@amanaoshc.com.au)
 */

import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:noreply@amanaoshc.com.au";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

function isDeadEndpointError(err: unknown): boolean {
  const status = (err as { statusCode?: number } | null)?.statusCode;
  return status === 404 || status === 410;
}

export function isWebPushConfigured(): boolean {
  return Boolean(VAPID_PUBLIC && VAPID_PRIVATE);
}

/**
 * Send a single push. Throws on any error (including 410 Gone) so higher-level
 * wrappers can decide what to do with dead endpoints.
 */
export async function sendPush(
  subscription: PushSubscriptionData,
  payload: PushPayload,
): Promise<void> {
  if (!isWebPushConfigured()) {
    logger.warn("Web push not configured — VAPID keys missing");
    return;
  }
  await webpush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: subscription.keys,
    },
    JSON.stringify(payload),
  );
}

/** @deprecated Use `sendPush` — kept for callers that still reference the old name. */
export const sendPushNotification = sendPush;

interface SubRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

async function fanOutPush(
  subs: SubRow[],
  payload: PushPayload,
  logContext: Record<string, unknown>,
): Promise<{ sent: number; removed: number }> {
  if (subs.length === 0) return { sent: 0, removed: 0 };

  const deadIds: string[] = [];
  let sent = 0;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await sendPush(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
        );
        sent += 1;
      } catch (err) {
        if (isDeadEndpointError(err)) {
          deadIds.push(sub.id);
        } else {
          logger.error("Push send failed (transient)", {
            ...logContext,
            subscriptionId: sub.id,
            status: (err as { statusCode?: number })?.statusCode,
            err: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }),
  );

  if (deadIds.length > 0) {
    await prisma.pushSubscription.deleteMany({
      where: { id: { in: deadIds } },
    });
    logger.info("Pruned dead push subscriptions", {
      ...logContext,
      removed: deadIds.length,
    });
  }

  return { sent, removed: deadIds.length };
}

/**
 * Fan out a push to every subscription belonging to a parent CentreContact.
 * Deletes subscriptions whose endpoint reports 404/410 so we don't keep
 * hammering dead targets.
 */
export async function sendPushToContact(
  contactId: string,
  payload: PushPayload,
): Promise<{ sent: number; removed: number }> {
  if (!isWebPushConfigured()) {
    logger.warn("Web push not configured — skipping sendPushToContact", {
      contactId,
    });
    return { sent: 0, removed: 0 };
  }

  const subs = await prisma.pushSubscription.findMany({
    where: { familyId: contactId },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });

  return fanOutPush(subs, payload, { contactId });
}

/**
 * Fan out a push to every subscription for a parent identified by email.
 * A parent with children at multiple centres has one CentreContact per
 * service; this joins across all of them so a single subscription reaches
 * the parent for any portal event, regardless of which contact record
 * the subscription was originally tied to.
 */
export async function sendPushToParentEmail(
  email: string,
  payload: PushPayload,
): Promise<{ sent: number; removed: number }> {
  if (!isWebPushConfigured()) {
    logger.warn("Web push not configured — skipping sendPushToParentEmail");
    return { sent: 0, removed: 0 };
  }
  const normalised = email.trim().toLowerCase();
  if (!normalised) return { sent: 0, removed: 0 };

  // Dedupe by endpoint in case the same device registered under two
  // CentreContact rows (one per service) — we only want one push per device.
  const rows = await prisma.pushSubscription.findMany({
    where: { family: { email: normalised } },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });
  const seen = new Set<string>();
  const deduped = rows.filter((r) => {
    if (seen.has(r.endpoint)) return false;
    seen.add(r.endpoint);
    return true;
  });

  return fanOutPush(deduped, payload, { email: normalised });
}
