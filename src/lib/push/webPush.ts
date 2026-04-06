/**
 * Web Push notification infrastructure.
 * Groundwork for browser push — not wired to all events yet.
 */

import webpush from "web-push";
import { logger } from "@/lib/logger";

// Configure VAPID keys from environment
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

export async function sendPushNotification(
  subscription: PushSubscriptionData,
  payload: PushPayload,
): Promise<void> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    logger.warn("Web push not configured — VAPID keys missing");
    return;
  }

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      },
      JSON.stringify(payload),
    );
  } catch (err) {
    logger.error("Failed to send push notification", {
      endpoint: subscription.endpoint,
      err,
    });
    throw err;
  }
}
