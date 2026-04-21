import type { LeaveBalance, LeaveRequest, LeaveType } from "@prisma/client";
import Link from "next/link";
import { LeaveBalanceCard } from "@/components/staff/LeaveBalanceCard";
import { PlusCircle } from "lucide-react";

interface LeaveTabProps {
  targetUserId: string;
  balances: LeaveBalance[];
  recentRequests: LeaveRequest[];
  canRequest: boolean;
}

function findBalance(balances: LeaveBalance[], type: LeaveType) {
  const match = balances.find((b) => b.leaveType === type);
  return {
    accrued: match?.accrued ?? 0,
    taken: match?.taken ?? 0,
    remaining: match?.balance ?? 0,
  };
}

function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function humanize(value: string | null | undefined): string {
  if (!value) return "—";
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const STATUS_STYLES: Record<string, string> = {
  leave_pending: "bg-amber-100 text-amber-800",
  leave_approved: "bg-green-100 text-green-800",
  leave_rejected: "bg-red-100 text-red-800",
  leave_cancelled: "bg-gray-100 text-gray-700",
};

export function LeaveTab({ targetUserId, balances, recentRequests, canRequest }: LeaveTabProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <LeaveBalanceCard balance={findBalance(balances, "annual")} type="annual" />
        <LeaveBalanceCard balance={findBalance(balances, "personal")} type="personal" />
        <LeaveBalanceCard
          balance={findBalance(balances, "long_service")}
          type="long_service"
        />
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">Recent leave requests</h3>
          <div className="flex items-center gap-2">
            {canRequest && (
              <Link
                href="/leave"
                className="inline-flex items-center gap-1.5 text-sm text-brand hover:underline"
              >
                <PlusCircle className="w-4 h-4" />
                New request
              </Link>
            )}
            <Link
              href={`/leave?userId=${targetUserId}`}
              className="text-sm text-muted hover:text-foreground"
            >
              View all
            </Link>
          </div>
        </div>

        {recentRequests.length === 0 ? (
          <p className="text-sm text-muted">No leave requests found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted border-b border-border">
                  <th className="py-2 pr-3 font-medium">Type</th>
                  <th className="py-2 pr-3 font-medium">Dates</th>
                  <th className="py-2 pr-3 font-medium">Days</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recentRequests.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 pr-3 text-foreground">{humanize(r.leaveType)}</td>
                    <td className="py-2 pr-3 text-foreground">
                      {formatDate(r.startDate)} — {formatDate(r.endDate)}
                    </td>
                    <td className="py-2 pr-3 text-foreground">{r.totalDays}</td>
                    <td className="py-2">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          STATUS_STYLES[r.status] ?? "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {humanize(r.status).replace("Leave ", "")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
