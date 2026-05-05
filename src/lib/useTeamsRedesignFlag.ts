"use client";

import { useEffect, useState } from "react";

/**
 * Determines whether the Teams tab redesign should render.
 *
 * Priority:
 *   1. `?teams=1` → always true (for staging verification)
 *   2. `?teams=0` → always false (kill switch from a global rollout)
 *   3. `process.env.NEXT_PUBLIC_TEAMS_REDESIGN === "true"` → env default
 *
 * Mirrors `useStaffV2Flag` in shape; deliberately a SEPARATE flag because
 * `staffV2Tab` is in late-stage retirement (commit 44 of staff-dashboard-v2
 * is queued to remove it). Coupling two unrelated rollouts to the same
 * flag would force one to wait on the other.
 */
export function useTeamsRedesignFlag(): boolean {
  const envDefault = process.env.NEXT_PUBLIC_TEAMS_REDESIGN === "true";
  const [enabled, setEnabled] = useState<boolean>(envDefault);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const override = params.get("teams");
    if (override === "1") setEnabled(true);
    else if (override === "0") setEnabled(false);
    else setEnabled(envDefault);
  }, [envDefault]);

  return enabled;
}
