"use client";

/**
 * MyLeaveBalanceCard — current leave balances from Employment Hero
 * Payroll, one row per category. EH-sourced as of 2026-06-01; the
 * internal `LeaveBalance` table is no longer the staff source of truth
 * (admin /leave page still uses it pending separate migration).
 *
 * Layout difference vs the pre-EH version:
 *   - EH gives a single "current balance" number per category, not the
 *     accrued/taken/remaining triple the internal tracker did. EH does
 *     the accrual math server-side. Showing one number is honest;
 *     reverse-engineering accrued+taken from EH would be wrong.
 *   - Categories are dynamic, not hard-coded. If the business adds a
 *     new leave type (e.g. Cultural Leave), it just shows up.
 */

import { useQuery } from "@tanstack/react-query";
import { Plane } from "lucide-react";
import { fetchApi, ApiResponseError } from "@/lib/fetch-api";

interface LeaveBalance {
  leaveCategoryId: number;
  leaveCategoryName: string;
  accruedAmount: number;
  unitType: "Hours" | "Days" | "Weeks";
}

interface BalancesResponse {
  balances: LeaveBalance[];
}

function formatAmount(b: LeaveBalance): string {
  // Hours: 2 decimal places (e.g. 73.50). Days/Weeks: 1 decimal (rare
  // to fractionalise into 0.01 of a week).
  const decimals = b.unitType === "Hours" ? 2 : 1;
  return `${b.accruedAmount.toFixed(decimals)} ${b.unitType.toLowerCase()}`;
}

interface MyLeaveBalanceCardProps {
  /** Kept for API compatibility with callers — not read here (the server
   *  scopes to the session's own user via `requireOwnEmployee`). */
  userId?: string;
}

export function MyLeaveBalanceCard({}: MyLeaveBalanceCardProps) {
  const { data, isLoading, error } = useQuery<BalancesResponse, ApiResponseError>({
    queryKey: ["my-leave-balances-eh"],
    queryFn: () => fetchApi<BalancesResponse>("/api/my-portal/leave/balances"),
    staleTime: 5 * 60_000,
    retry: (count, err) => {
      const status = (err as ApiResponseError)?.status;
      if (status === 404 || status === 503) return false;
      return count < 2;
    },
  });

  const balances = data?.balances ?? [];
  const errorStatus = (error as ApiResponseError | undefined)?.status;

  return (
    <div className="bg-card rounded-xl border border-border p-6" data-testid="my-leave-balance-card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Plane className="w-5 h-5 text-brand" />
          My Leave Balance
        </h3>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted">Loading leave balances…</p>
      ) : errorStatus === 503 ? (
        <p className="text-sm text-muted">
          Payroll integration isn&apos;t set up yet.
        </p>
      ) : errorStatus === 404 ? (
        <p className="text-sm text-muted">
          Your account isn&apos;t linked to a payroll record yet.
        </p>
      ) : error ? (
        <p className="text-sm text-red-600">
          Unable to load leave balances. Please refresh the page.
        </p>
      ) : balances.length === 0 ? (
        <p className="text-sm text-muted">No leave balances on file yet.</p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {balances.map((b) => (
            <li
              key={b.leaveCategoryId}
              className="border border-border rounded-lg p-4 bg-card"
              data-testid={`leave-balance-${b.leaveCategoryId}`}
            >
              <div className="text-sm font-medium text-foreground/80">
                {b.leaveCategoryName}
              </div>
              <div className="mt-2 text-2xl font-semibold text-emerald-700">
                {formatAmount(b)}
              </div>
              <div className="text-xs text-muted mt-0.5">Available</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
