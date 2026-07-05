"use client";

/**
 * useCertExpiryRollup — org-wide compliance cert health rollup,
 * scoped to admin-tier callers. Powers `LeadershipCertExpiryCard`.
 *
 * Companion to `useServiceCertExpirySummary` (per-service surface
 * on the Compliance tab) — same data, summed across all centres.
 *
 * 2026-05-04: introduced.
 */

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";
import type { CertStatus } from "@/lib/cert-expiry-summary";

export interface ServiceRollupRowResponse {
  serviceId: string;
  name: string;
  code: string | null;
  state: string | null;
  status: CertStatus;
  totals: {
    expired: number;
    critical: number;
    warning: number;
    upcoming: number;
  };
  affectedStaffCount: number;
}

export interface CertExpiryRollupResponse {
  asOf: string;
  orgTotals: {
    expired: number;
    critical: number;
    warning: number;
    upcoming: number;
  };
  services: ServiceRollupRowResponse[];
}

export function useCertExpiryRollup() {
  return useQuery<CertExpiryRollupResponse>({
    queryKey: ["compliance-cert-expiry-rollup"],
    queryFn: () =>
      fetchApi<CertExpiryRollupResponse>(
        "/api/compliance/cert-expiry-rollup",
      ),
    retry: 2,
    // Cert expiry doesn't drift fast — once-an-hour is enough.
    staleTime: 60 * 60_000,
  });
}
