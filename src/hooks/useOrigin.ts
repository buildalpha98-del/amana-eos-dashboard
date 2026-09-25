"use client";

import { useSyncExternalStore } from "react";

/** The origin never changes while the page is open, so nothing to subscribe to. */
const noSubscribe = () => () => {};
const getSnapshot = () => window.location.origin;
const getServerSnapshot = () => "";

/**
 * The current page's origin, or "" while rendering on the server.
 *
 * Used wherever we hand someone a link to our own site — the tracked Indeed
 * apply URL, the casual-pool registration link. Hard-coding the production
 * domain would quietly hand out live links while someone is testing on a
 * preview deployment, and reading `window` during render breaks SSR.
 *
 * `useSyncExternalStore` rather than an effect: it gives the server an
 * explicit empty snapshot, so there is no hydration mismatch and no
 * synchronous setState in an effect (which the React compiler rejects).
 * Callers must handle the empty first value — disable the button, show "…".
 */
export function useOrigin(): string {
  return useSyncExternalStore(noSubscribe, getSnapshot, getServerSnapshot);
}
