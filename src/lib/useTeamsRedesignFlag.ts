"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { isAdminRole } from "@/lib/role-permissions";

/**
 * Determines whether the Teams tab redesign should render.
 *
 * Priority:
 *   1. `?teams=1` → always true (for staging verification)
 *   2. `?teams=0` → always false (kill switch from a global rollout)
 *   3. `NEXT_PUBLIC_TEAMS_REDESIGN` env value → role-aware default:
 *        "all"   → everyone
 *        "true"  → alias for "all" (backward-compat with PR #78)
 *        "admin" → admin-tier only (owner / head_office / admin)
 *        unset / "false" / anything else → off
 *
 * The phased rollout in the spec uses two env-var flips:
 *   week 1: NEXT_PUBLIC_TEAMS_REDESIGN=admin   (owner+admin only)
 *   week 2: NEXT_PUBLIC_TEAMS_REDESIGN=all     (everyone)
 *
 * Rollback is one env-var change (unset, or set to "false").
 *
 * 2026-05-04: introduced (PR #78).
 * 2026-05-06: phased rollout — added "admin" tier (PR 7).
 */
export function useTeamsRedesignFlag(): boolean {
  const envValue = process.env.NEXT_PUBLIC_TEAMS_REDESIGN ?? "";
  const { data: session } = useSession();
  const role = session?.user?.role ?? null;
  const envDefault = computeFlagDefault(envValue, role);
  const [enabled, setEnabled] = useState<boolean>(envDefault);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const override = params.get("teams");
    // setState-in-effect is intentional here: we need to read
    // window.location.search after hydration to honour the URL
    // override, and re-sync if envDefault changes once the session
    // resolves. The default lint rule flags this pattern but the
    // alternatives (useSyncExternalStore, lazy useState) cause SSR
    // hydration mismatches when ?teams= is present in the URL.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (override === "1") setEnabled(true);
    else if (override === "0") setEnabled(false);
    else setEnabled(envDefault);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [envDefault]);

  return enabled;
}

/**
 * Pure helper: given the env value and viewer role, decide whether the
 * redesign is on by default (i.e., absent any URL override). Exported
 * for unit testing — captures all the policy in one place.
 */
export function computeFlagDefault(
  envValue: string,
  role: string | null,
): boolean {
  const v = envValue.toLowerCase().trim();
  if (v === "all" || v === "true") return true;
  if (v === "admin") return isAdminRole(role);
  return false;
}
