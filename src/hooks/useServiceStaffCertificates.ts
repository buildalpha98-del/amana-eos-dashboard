"use client";

/**
 * useServiceStaffCertificates — fetch active certs for staff at a service,
 * roll up per-user expiry status against a target date (e.g. "Friday of
 * the week this roster covers"). Used by the per-service Weekly Roster
 * grid to flag staff whose qualifications expire within / before the
 * visible week.
 *
 * 2026-05-02: introduced as the second deliverable of the Connecteam-
 * style roster spec the user flagged on 2026-04-29.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";

export interface StaffCertificate {
  userId: string;
  type: string;
  expiryDate: string; // ISO
}

interface ListResponse {
  certificates: StaffCertificate[];
}

/** Per-user verdict against `targetDate` — rolled up across all their certs. */
export type CertStatus = "ok" | "expiring" | "expired";

export interface UserCertStatus {
  status: CertStatus;
  /** All this user's certs, sorted by expiryDate asc — for a tooltip. */
  certs: StaffCertificate[];
  /** The earliest expiry among them, if any. */
  earliestExpiry: string | null;
}

/** Days under which an unexpired cert is treated as "expiring". */
export const EXPIRING_THRESHOLD_DAYS = 30;

export function useServiceStaffCertificates(serviceId: string | undefined) {
  return useQuery<ListResponse>({
    queryKey: ["service-staff-certs", serviceId],
    queryFn: () =>
      fetchApi<ListResponse>(`/api/services/${serviceId}/staff-certificates`),
    enabled: !!serviceId,
    retry: 2,
    staleTime: 60_000,
  });
}

/**
 * Group an array of `StaffCertificate` by `userId`, rolling up to a
 * single status against `targetDate` (use the last day of the visible
 * roster week so anything expiring mid-week shows red).
 *
 * - **expired**  — at least one cert's expiryDate <= targetDate
 * - **expiring** — at least one cert expires within `EXPIRING_THRESHOLD_DAYS` of targetDate
 * - **ok**       — everything is well past targetDate
 *
 * Pure function — exported so we can unit-test it.
 */
export function rollUpByUser(
  certs: StaffCertificate[],
  targetDate: Date,
): Record<string, UserCertStatus> {
  const out: Record<string, UserCertStatus> = {};
  for (const c of certs) {
    if (!out[c.userId]) {
      out[c.userId] = { status: "ok", certs: [], earliestExpiry: null };
    }
    out[c.userId].certs.push(c);
  }

  const targetMs = targetDate.getTime();
  const expiringWindowMs = EXPIRING_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;

  for (const userId of Object.keys(out)) {
    const entry = out[userId];
    entry.certs.sort(
      (a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime(),
    );
    entry.earliestExpiry = entry.certs[0]?.expiryDate ?? null;

    let worst: CertStatus = "ok";
    for (const c of entry.certs) {
      const expiryMs = new Date(c.expiryDate).getTime();
      if (expiryMs <= targetMs) {
        worst = "expired";
        break; // can't get worse
      }
      if (expiryMs - targetMs <= expiringWindowMs) {
        worst = "expiring";
      }
    }
    entry.status = worst;
  }

  return out;
}

export function useStaffCertStatus(
  serviceId: string | undefined,
  targetDate: Date,
) {
  const { data, isLoading, error } = useServiceStaffCertificates(serviceId);
  // Memo the rollup — it iterates every cert × every user. Re-runs only
  // when the certs list or target date change (target is the visible
  // week's Friday, so it only changes when the user paginates the grid).
  const targetMs = targetDate.getTime();
  const rollup = useMemo(() => {
    if (!data?.certificates) return {};
    return rollUpByUser(data.certificates, new Date(targetMs));
  }, [data, targetMs]);
  return { rollup, isLoading, error };
}
