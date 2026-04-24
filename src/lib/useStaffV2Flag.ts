"use client";

import { useSearchParams } from "next/navigation";

/**
 * Determines whether the staff dashboard v2 redesign should render.
 *
 * Priority:
 *   1. `?v2=1` → always true (for staging verification in prod builds)
 *   2. `?v2=0` → always false (bail-out from a global rollout)
 *   3. `process.env.NEXT_PUBLIC_STAFF_DASHBOARD_V2 === "true"` → env default
 *
 * Mirrors `src/app/parent/utils/useV2Flag.ts` so the rollout mechanics are
 * identical. Kept as a separate hook + env var so we can flip staff + parent
 * independently.
 */
export function useStaffV2Flag(): boolean {
  const override = useSearchParams()?.get("v2");
  if (override === "1") return true;
  if (override === "0") return false;
  return process.env.NEXT_PUBLIC_STAFF_DASHBOARD_V2 === "true";
}
