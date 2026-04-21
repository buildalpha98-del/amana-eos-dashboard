"use client";

import { useQuery } from "@tanstack/react-query";
import { Plane } from "lucide-react";
import { LeaveBalanceCard } from "@/components/staff/LeaveBalanceCard";
import { fetchApi } from "@/lib/fetch-api";

/** Shape returned by GET /api/leave/balances. */
interface MyLeaveBalance {
  id: string;
  userId: string;
  leaveType: "annual" | "personal" | "long_service" | string;
  balance: number;
  accrued: number;
  taken: number;
  pending: number;
}

interface MyLeaveBalanceCardProps {
  /** Current user's id — passed so server scopes and we can filter defensively. */
  userId: string;
}

function findBalance(
  balances: MyLeaveBalance[],
  type: "annual" | "personal" | "long_service",
) {
  const match = balances.find((b) => b.leaveType === type);
  return {
    accrued: match?.accrued ?? 0,
    taken: match?.taken ?? 0,
    remaining: match?.balance ?? 0,
  };
}

export function MyLeaveBalanceCard({ userId }: MyLeaveBalanceCardProps) {
  const { data, isLoading, error } = useQuery<MyLeaveBalance[]>({
    queryKey: ["my-leave-balances", userId],
    // GET /api/leave/balances auto-scopes to the staff user; pass userId for
    // other roles so the response is still correctly filtered.
    queryFn: () => fetchApi<MyLeaveBalance[]>(`/api/leave/balances?userId=${encodeURIComponent(userId)}`),
    retry: 2,
    staleTime: 60_000,
  });

  const balances = data ?? [];
  const hasAnnual = balances.some((b) => b.leaveType === "annual");
  const hasPersonal = balances.some((b) => b.leaveType === "personal");

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
      ) : error ? (
        <p className="text-sm text-red-600">
          Unable to load leave balances. Please refresh the page.
        </p>
      ) : !hasAnnual && !hasPersonal ? (
        <p className="text-sm text-muted">
          No leave balances on file yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {hasAnnual && (
            <LeaveBalanceCard balance={findBalance(balances, "annual")} type="annual" />
          )}
          {hasPersonal && (
            <LeaveBalanceCard balance={findBalance(balances, "personal")} type="personal" />
          )}
        </div>
      )}
    </div>
  );
}
