"use client";

/**
 * useOrgConfig — client-side access to the org runtime config via the
 * client-safe `GET /api/org-settings/config` slice (open to ANY authed
 * user — the row-level `/api/org-settings` GET is role-gated, which is
 * exactly why staff surfaces must read from here).
 *
 * Returns the fully-merged `OrgSettingsConfig` (the API already merges
 * with defaults; we defensively re-merge so a malformed payload can never
 * crash a consumer). While loading / on error, consumers should fall back
 * to `ORG_SETTINGS_DEFAULTS` — `data` is simply undefined until resolved.
 *
 * 2026-09-05 (Staff Portal v2 Phase 9): introduced for the certificate
 * requirements matrix consumers (/compliance, /my-portal).
 */

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";
import {
  mergeOrgSettings,
  type OrgSettingsConfig,
} from "@/lib/org-settings-shared";

export function useOrgConfig() {
  return useQuery<OrgSettingsConfig>({
    queryKey: ["org-config"],
    queryFn: async () => {
      const body = await fetchApi<{ config?: unknown }>(
        "/api/org-settings/config",
      );
      return mergeOrgSettings(body?.config);
    },
    // Config is reference data — changes are rare and a minute of staleness
    // is the documented org-settings contract anyway (60s server cache).
    staleTime: 5 * 60_000,
    retry: 2,
    // Read-only enhancement data: never toast the whole page over it.
    meta: { suppressGlobalErrorToast: true },
  });
}
