"use client";

/**
 * Client helpers for registering the parent-portal service worker and
 * managing the browser PushSubscription.
 *
 * The service worker lives at /sw.js (root scope is required for Chrome
 * to deliver pushes to installed PWAs), but we register it with
 * `scope: "/parent/"` so it only intercepts requests under the portal.
 *
 * iOS gotcha: `Notification.requestPermission()` silently no-ops in
 * Safari unless the PWA is installed to the home screen. Detect via
 * `isStandalonePwa()` before showing the prompt.
 */

import { mutateApi } from "@/lib/fetch-api";

const SW_PATH = "/sw.js";
const SW_SCOPE = "/parent/";

export interface PushStatus {
  supported: boolean;
  permission: NotificationPermission;
  subscribed: boolean;
  endpoint: string | null;
  needsStandalonePwa: boolean;
}

export function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;
  const mm = window.matchMedia?.("(display-mode: standalone)");
  if (mm?.matches) return true;
  // iOS-specific signal
  return (window.navigator as { standalone?: boolean }).standalone === true;
}

export function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua) && !("MSStream" in window);
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
  return isIos && isSafari;
}

export function isPushSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function getPushStatus(): Promise<PushStatus> {
  if (!isPushSupported()) {
    return {
      supported: false,
      permission: "default",
      subscribed: false,
      endpoint: null,
      needsStandalonePwa: isIosSafari() && !isStandalonePwa(),
    };
  }

  const registration = await navigator.serviceWorker.getRegistration(SW_SCOPE);
  const subscription = await registration?.pushManager.getSubscription();

  return {
    supported: true,
    permission: Notification.permission,
    subscribed: Boolean(subscription),
    endpoint: subscription?.endpoint ?? null,
    needsStandalonePwa: isIosSafari() && !isStandalonePwa(),
  };
}

/**
 * Register the service worker with the parent portal scope. Safe to call
 * on every parent page load; browsers dedupe identical registrations.
 */
export async function registerParentServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.register(SW_PATH, {
      scope: SW_SCOPE,
    });
    return reg;
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[push] service worker registration failed", err);
    }
    return null;
  }
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalised);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

function subscriptionToJson(sub: PushSubscription) {
  const json = sub.toJSON();
  return {
    endpoint: sub.endpoint,
    keys: {
      p256dh: json.keys?.p256dh ?? "",
      auth: json.keys?.auth ?? "",
    },
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
  };
}

/**
 * Ask the browser for notification permission and create a PushSubscription
 * tied to our VAPID public key. Posts the subscription to the server on
 * success. Throws on permission denial or any API error so callers can
 * surface a toast.
 */
export async function subscribeParentPush(): Promise<PushSubscription> {
  if (!isPushSupported()) {
    throw new Error("Push notifications are not supported on this browser");
  }
  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublic) {
    throw new Error("Push notifications aren't configured yet");
  }

  // Ensure the SW is ready before subscribing.
  await registerParentServiceWorker();
  const registration = await navigator.serviceWorker.ready;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "Notifications are blocked — enable them in your browser settings"
        : "Notification permission was not granted",
    );
  }

  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublic).buffer as ArrayBuffer,
    }));

  await mutateApi("/api/parent/push/subscription", {
    method: "POST",
    body: subscriptionToJson(subscription),
  });

  return subscription;
}

export async function unsubscribeParentPush(): Promise<void> {
  if (!isPushSupported()) return;

  const registration = await navigator.serviceWorker.getRegistration(SW_SCOPE);
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;

  await mutateApi("/api/parent/push/subscription", {
    method: "DELETE",
    body: { endpoint: subscription.endpoint },
  });
  await subscription.unsubscribe();
}
