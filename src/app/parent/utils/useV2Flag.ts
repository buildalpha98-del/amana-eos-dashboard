"use client";

import { useSearchParams } from "next/navigation";

/**
 * Determines whether the parent portal v2 redesign should render.
 *
 * Priority:
 *   1. `?v2=1` → always true (for staging verification in prod builds)
 *   2. `?v2=0` → always false
 *   3. `process.env.NEXT_PUBLIC_PARENT_PORTAL_V2 === "true"` → env default
 */
export function useV2Flag(): boolean {
  const override = useSearchParams()?.get("v2");
  if (override === "1") return true;
  if (override === "0") return false;
  return process.env.NEXT_PUBLIC_PARENT_PORTAL_V2 === "true";
}
