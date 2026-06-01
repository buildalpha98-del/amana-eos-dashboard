"use client";

/**
 * /leave-payroll — admin org-wide leave view sourced from EH.
 *
 * Three sections, tab-bar style:
 *   1. Pending (default) — what needs approval. CTA: "Approve in EH"
 *      because approvals are intentionally not done in the dashboard.
 *   2. Upcoming — approved leave starting in the next 60 days, so the
 *      director can plan cover.
 *   3. All — everything (pending/approved/rejected/cancelled), useful
 *      for spot-checking.
 *
 * Each row deep-links into both:
 *   - the staff profile (where we have a dashboard User mapping)
 *   - the leave request in Employment Hero (open in new tab)
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  XCircle,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import { fetchApi, ApiResponseError } from "@/lib/fetch-api";
import { cn } from "@/lib/utils";

interface LeaveRequest {
  id: number;
  employeeId: number;
  employee: string;
  leaveCategoryId: number;
  leaveCategory: string;
  fromDate: string;
  toDate: string;
  totalHours: number;
  status: string;
  notes: string | null;
  dashboardUser: {
    id: string;
    name: string;
    service: { id: string; name: string; code: string } | null;
  } | null;
}

type Tab = "pending" | "upcoming" | "all";

const TABS: Array<{ key: Tab; label: string; statusFilter: string | null }> = [
  { key: "pending", label: "Pending approval", statusFilter: "Pending" },
  { key: "upcoming", label: "Upcoming approved", statusFilter: "Approved" },
  { key: "all", label: "All", statusFilter: null },
];

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.slice(0, 10) + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function statusPill(status: string): string {
  const s = status.toLowerCase();
  if (s.startsWith("approv"))
    return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (s.startsWith("reject"))
    return "bg-red-50 text-red-800 border-red-200";
  if (s.startsWith("cancel"))
    return "bg-gray-100 text-gray-700 border-gray-200";
  return "bg-amber-50 text-amber-800 border-amber-200"; // pending
}

const EH_BUSINESS_ID = "407666"; // for the "Open in EH" deeplink

function ehLeaveUrl(employeeId: number): string {
  // EH's per-employee leave page. Direct request URLs aren't shareable
  // (they're per-session) so we land on the employee's leave tab.
  return `https://yourpayroll.com.au/Default.aspx?BusinessId=${EH_BUSINESS_ID}#/business/${EH_BUSINESS_ID}/employee/${employeeId}/leave`;
}

export function LeavePayrollClient() {
  const [tab, setTab] = useState<Tab>("pending");

  const activeTab = TABS.find((t) => t.key === tab)!;
  const { data, isLoading, error } = useQuery<
    { requests: LeaveRequest[] },
    ApiResponseError
  >({
    queryKey: ["eh-admin-leave-requests", activeTab.statusFilter],
    queryFn: () => {
      const qs = activeTab.statusFilter
        ? `?status=${encodeURIComponent(activeTab.statusFilter)}`
        : "";
      return fetchApi(`/api/eh-payroll/admin/leave-requests${qs}`);
    },
    staleTime: 60_000,
  });

  // For the "Upcoming approved" tab, narrow to leave starting in the
  // next 60 days. Past-dated approved leave isn't actionable.
  const requests = useMemo(() => {
    const all = data?.requests ?? [];
    if (tab !== "upcoming") return all;
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + 60);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return all.filter((r) => {
      const start = new Date(r.fromDate.slice(0, 10) + "T00:00:00");
      const end = new Date(r.toDate.slice(0, 10) + "T00:00:00");
      // Show anything that hasn't ended yet AND starts within 60d.
      return end >= today && start <= horizon;
    });
  }, [data?.requests, tab]);

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4">
      <div>
        <Link
          href="/leave"
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to internal leave
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">
          Leave (Employment Hero)
        </h1>
        <p className="text-sm text-muted mt-1 max-w-3xl">
          Live data from Employment Hero Payroll. Read-only — to approve or
          reject a request, click through to EH. The 21-day Fair Work
          response window applies to pending requests.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === t.key
                ? "border-brand text-brand"
                : "border-transparent text-muted hover:text-foreground",
            )}
          >
            {t.label}
            {data && tab === t.key && (
              <span className="ml-2 text-xs text-muted">({requests.length})</span>
            )}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Unable to load from Employment Hero.</p>
            <p className="text-xs mt-0.5">{error.message}</p>
          </div>
        </div>
      ) : requests.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
          <p className="text-sm font-medium text-foreground">
            {tab === "pending"
              ? "No pending requests — everyone's caught up."
              : tab === "upcoming"
                ? "No approved leave in the next 60 days."
                : "No leave requests found."}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left">
              <tr className="border-b border-border">
                <Th>Employee</Th>
                <Th>Service</Th>
                <Th>Type</Th>
                <Th>From → To</Th>
                <Th>Hours</Th>
                <Th>Status</Th>
                <Th>Notes</Th>
                <Th className="text-right">Action</Th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-border/50 last:border-b-0 align-top"
                  data-testid={`leave-row-${r.id}`}
                >
                  <Td>
                    {r.dashboardUser ? (
                      <Link
                        href={`/staff/${r.dashboardUser.id}`}
                        className="text-brand hover:underline font-medium"
                      >
                        {r.dashboardUser.name}
                      </Link>
                    ) : (
                      <span className="font-medium">{r.employee}</span>
                    )}
                    {!r.dashboardUser && (
                      <span className="block text-[10px] text-amber-700 mt-0.5">
                        Not linked to a dashboard user
                      </span>
                    )}
                  </Td>
                  <Td className="text-muted">
                    {r.dashboardUser?.service?.name ?? "—"}
                  </Td>
                  <Td>{r.leaveCategory}</Td>
                  <Td>
                    {formatDate(r.fromDate)}
                    {r.fromDate !== r.toDate && (
                      <span className="text-muted"> → {formatDate(r.toDate)}</span>
                    )}
                  </Td>
                  <Td>{r.totalHours.toFixed(2)}</Td>
                  <Td>
                    <span
                      className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-medium",
                        statusPill(r.status),
                      )}
                    >
                      {r.status}
                    </span>
                  </Td>
                  <Td className="text-muted max-w-xs">
                    {r.notes ? (
                      <span title={r.notes} className="line-clamp-2">
                        {r.notes}
                      </span>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td className="text-right">
                    <a
                      href={ehLeaveUrl(r.employeeId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-brand hover:underline"
                    >
                      Approve in EH
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted ${className}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-3 py-2 ${className}`}>{children}</td>;
}
