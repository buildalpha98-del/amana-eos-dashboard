"use client";

import { useEffect, useState } from "react";

/**
 * Determines whether the staff dashboard v2 redesign should render.
 *
 * Priority:
 *   1. `?v2=1` → always true (for staging verification in prod builds)
 *   2. `?v2=0` → always false (bail-out from a global rollout)
 *   3. `process.env.NEXT_PUBLIC_STAFF_DASHBOARD_V2 === "true"` → env default
 *
 * Why this avoids `useSearchParams()`:
 *   `useSearchParams()` opts every consumer page out of static prerendering
 *   unless wrapped in a Suspense boundary. We have ~50 dashboard pages —
 *   wrapping each one is noisy. Reading `window.location.search` in a
 *   `useEffect` keeps the hook SSR-safe (returns env default during SSR/SSG,
 *   updates to URL override after hydration). The brief render with the
 *   env-default value before the effect runs is acceptable — token
 *   overrides apply via CSS attribute selectors and re-cascade on update.
 *
 * Mirrors `src/app/parent/utils/useV2Flag.ts` in intent; the parent portal
 * doesn't need this fix because its pages aren't in the static-prerender set.
 */
export function useStaffV2Flag(): boolean {
  const envDefault = process.env.NEXT_PUBLIC_STAFF_DASHBOARD_V2 === "true";
  const [v2, setV2] = useState<boolean>(envDefault);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const override = params.get("v2");
    if (override === "1") setV2(true);
    else if (override === "0") setV2(false);
    else setV2(envDefault);
  }, [envDefault]);

  return v2;
}
