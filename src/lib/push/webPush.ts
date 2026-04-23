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
            contactId,
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
      contactId,
      removed: deadIds.length,
    });
  }

  return { sent, removed: deadIds.length };
}
