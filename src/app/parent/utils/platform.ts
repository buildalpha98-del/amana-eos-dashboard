// Platform + storage helpers for the parent portal install prompt.
//
// iOS Safari never fires `beforeinstallprompt` and exposes `navigator.standalone`
// as a proprietary signal; Android Chrome uses `display-mode: standalone`.
// In-app browsers (Instagram, Facebook, WeChat etc.) can render the site but
// suppress the install affordance entirely, so we hide the banner rather than
// offer steps that can't be completed.
//
// Storage keys are prefixed with `amana_parent_` so multiple portals hosted on
// the same origin don't collide.

export const VISIT_COUNT_KEY = "amana_parent_visits";
export const DISMISSED_AT_KEY = "amana_install_dismissed_at";
export const DISMISS_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface NavigatorWithStandalone extends Navigator {
  standalone?: boolean;
}

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

function safeLocalStorage(): Storage | null {
  if (!hasWindow()) return null;
  try {
    return window.localStorage;
  } catch {
    // Private mode / disabled — callers must handle null.
    return null;
  }
}

export function isStandalone(): boolean {
  if (!hasWindow()) return false;
  try {
    if (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(display-mode: standalone)").matches
    ) {
      return true;
    }
  } catch {
    // Some environments throw on matchMedia with certain queries — fall through.
  }
  const nav = window.navigator as NavigatorWithStandalone | undefined;
  return nav?.standalone === true;
}

export function isIOS(): boolean {
  if (!hasWindow()) return false;
  const ua = window.navigator.userAgent || "";
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ reports itself as Mac — disambiguate via touch points.
  const nav = window.navigator as Navigator & { maxTouchPoints?: number };
  return /Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1;
}

const IN_APP_SIGNATURES = [
  "Instagram",
  "FBAN",
  "FBAV",
  "FB_IAB",
  "Line/",
  "MicroMessenger",
  "BytedanceWebview",
  "musical_ly",
];

export function isInAppBrowser(): boolean {
  if (!hasWindow()) return false;
  const ua = window.navigator.userAgent || "";
  return IN_APP_SIGNATURES.some((sig) => ua.includes(sig));
}

export function getVisitCount(): number {
  const storage = safeLocalStorage();
  if (!storage) return 0;
  const raw = storage.getItem(VISIT_COUNT_KEY);
  if (!raw) return 0;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function incrementVisitCount(): number {
  const storage = safeLocalStorage();
  if (!storage) return 0;
  const next = getVisitCount() + 1;
  try {
    storage.setItem(VISIT_COUNT_KEY, String(next));
  } catch {
    // Quota exceeded / disabled — swallow, we still return the computed value.
  }
  return next;
}

export function getDismissedAt(): number | null {
  const storage = safeLocalStorage();
  if (!storage) return null;
  const raw = storage.getItem(DISMISSED_AT_KEY);
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function setDismissedAt(ts: number): void {
  const storage = safeLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(DISMISSED_AT_KEY, String(ts));
  } catch {
    // Swallow quota errors.
  }
}

export function clearDismissedAt(): void {
  const storage = safeLocalStorage();
  if (!storage) return;
  try {
    storage.removeItem(DISMISSED_AT_KEY);
  } catch {
    // Ignore.
  }
}

export function isRecentlyDismissed(now: number = Date.now()): boolean {
  const at = getDismissedAt();
  if (at === null) return false;
  return now - at < DISMISS_WINDOW_MS;
}
