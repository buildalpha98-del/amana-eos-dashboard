"use client";

/**
 * useServiceCertExpirySummary — pulls the per-service cert health
 * rollup powering ServiceCertExpiryCard. Companion to the cron at
 * `/api/cron/compliance-alerts` and the per-staff email digest:
 * surfaces the same data on-screen so admins don't have to wait for
 * an email to know they have a problem.
 *
 * 2026-05-04: introduced as the dashboard surface called out in
 * next-priorities.md Tier 1 ("compliance risk widget per service").
 */

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";
import type { CertStatus } from "@/lib/cert-expiry-summary";
import type { CertificateType } from "@prisma/client";

export interface AffectedCert {
  type: CertificateType;
  expiryDate: string;
  daysUntilExpiry: number;
  status: CertStatus;
}

export interface AffectedStaffMember {
  userId: string;
  name: string;
  avatar: string | null;
  status: CertStatus;
  earliestExpiry: string;
  certs: AffectedCert[];
}

export interface CertExpirySummaryResponse {
  asOf: string;
  totals: {
    expired: number;
    critical: number;
    warning: number;
    upcoming: number;
  };
  affectedStaff: AffectedStaffMember[];
}

export function useServiceCertExpirySummary(serviceId: string | undefined) {
  return useQuery<CertExpirySummaryResponse>({
    queryKey: ["service-cert-expiry-summary", serviceId],
    queryFn: () =>
      fetchApi<CertExpirySummaryResponse>(
        `/api/services/${serviceId}/cert-expiry-summary`,
      ),
    enabled: !!serviceId,
    retry: 2,
    // Cert expiry doesn't drift fast — once-an-hour is enough.
    staleTime: 60 * 60_000,
  });
}
