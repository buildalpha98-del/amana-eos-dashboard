"use client";

import { useEffect, useRef } from "react";
import {
  useParentOnboarding,
  useMarkOnboardingStep,
} from "@/hooks/useParentPortal";
import { incrementVisitCount, isStandalone } from "@/app/parent/utils/platform";

/**
 * Side-effect hook colocated with the parent auth provider.
 *
 * 1. Increments the visit counter once per authenticated mount so the install
 *    banner can gate on "2nd+ visit".
 * 2. When the user is running the PWA in standalone mode (home-screen launch)
 *    and their onboarding `installed` flag is still false, flips it to true so
 *    the /parent/getting-started checklist stays in sync with reality.
 *
 * Both effects short-circuit when `enabled` is false (i.e. unauthenticated) so
 * we don't leak visit counts across login/logout boundaries.
 */
export function useParentInstallEffects(enabled: boolean): void {
  const { data: onboarding } = useParentOnboarding();
  const markStep = useMarkOnboardingStep();
  const visitedRef = useRef(false);
  const markedRef = useRef(false);

  // Effect 1 — bump the visit counter once per mount.
  useEffect(() => {
    if (!enabled) return;
    if (visitedRef.current) return;
    visitedRef.current = true;
    incrementVisitCount();
  }, [enabled]);

  // Effect 2 — auto-mark onboarding "installed" when launched standalone.
  useEffect(() => {
    if (!enabled) return;
    if (markedRef.current) return;
    if (!onboarding) return;
    if (onboarding.progress.installed) return;
    if (!isStandalone()) return;

    markedRef.current = true;
    markStep.mutate({ installed: true });
  }, [enabled, onboarding, markStep]);
}
