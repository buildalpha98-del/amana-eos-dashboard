"use client";

/**
 * RoleLabelsContext — exposes the org's current role display names to
 * client components. Self-hydrates from `/api/org-settings/config` on
 * mount (the dashboard layout mounts the provider once near the root).
 *
 * Consumers read synchronously via `useRoleLabel(role)`. Before the fetch
 * resolves the hook returns `ROLE_LABEL_DEFAULTS` — same labels that
 * previously lived in `ROLE_DISPLAY_NAMES`, so there's no flicker unless
 * an admin has actually renamed a role.
 *
 * Renaming via /settings/organisation invalidates the server cache; client
 * provider sees fresh labels on the next mount (typically the next page
 * load). Acceptable lag — role labels don't change often.
 *
 * 2026-05-16.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Role } from "@prisma/client";
import {
  ROLE_LABEL_DEFAULTS,
  mergeOrgSettings,
  type RoleLabels,
} from "@/lib/org-settings-shared";

const Ctx = createContext<RoleLabels>(ROLE_LABEL_DEFAULTS);

/**
 * Mount once near the root of the dashboard layout. Hydrates labels from
 * the server (best-effort) and exposes them to all descendants. If the
 * fetch fails we silently keep the defaults.
 */
export function RoleLabelsProvider({ children }: { children: ReactNode }) {
  const [labels, setLabels] = useState<RoleLabels>(ROLE_LABEL_DEFAULTS);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/org-settings/config", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { config?: unknown } | null) => {
        if (cancelled || !body) return;
        // Defensive merge — the API already merges with defaults, but
        // belt-and-braces if the shape ever drifts.
        const merged = mergeOrgSettings(body.config);
        setLabels(merged.roleLabels);
      })
      .catch(() => {
        /* keep defaults */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return <Ctx.Provider value={labels}>{children}</Ctx.Provider>;
}

export function useRoleLabels(): RoleLabels {
  return useContext(Ctx);
}

export function useRoleLabel(role: Role | string | null | undefined): string {
  const labels = useContext(Ctx);
  if (!role) return "";
  if (role in labels) return labels[role as Role];
  return ROLE_LABEL_DEFAULTS[role as Role] ?? role;
}
