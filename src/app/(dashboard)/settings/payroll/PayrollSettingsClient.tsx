"use client";

/**
 * /settings/payroll — EH Payroll admin settings.
 *
 * Three stacked panels:
 *   1. Connection status (configured / connected / business / error)
 *   2. Mapping rollup (EH headcount, dashboard users, mapped, unmapped)
 *      + "Run sync now" button (POST /api/eh-payroll/sync)
 *   3. Unmapped staff quick-list — click through to each profile's
 *      "Pay & compensation → Payroll link" sub-tab for per-staff
 *      manual mapping. We don't duplicate that flow here.
 *
 * Endpoints used (all existing):
 *   GET /api/eh-payroll/status
 *   POST /api/eh-payroll/sync (idempotent same-day re-run)
 *   GET /api/eh-payroll/employees (returns unmappedDashboardUsers too)
 */

import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { fetchApi, mutateApi, ApiResponseError } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { PageHeader } from "@/components/layout/PageHeader";

interface StatusResponse {
  configured: boolean;
  connected: boolean;
  business: { id: number; name: string; country: string | null } | null;
  mapping: {
    ehHeadcount: number | null;
    mappedUsers: number;
    totalDashboardUsers: number;
    unmappedUsers: number;
  } | null;
  error: string | null;
}

interface UserOption {
  id: string;
  name: string;
  email: string;
}

interface EmployeesResponse {
  employees: Array<{
    id: number;
    name: string;
    email: string | null;
    mappedUser: { id: string; name: string } | null;
  }>;
  unmappedDashboardUsers: UserOption[];
}

interface SyncSummary {
  totalEhEmployees: number;
  activeEhEmployees: number;
  unchanged: number;
  newlyMapped: number;
  cleared: number;
  unmatchedCount: number;
  durationMs: number;
}

export function PayrollSettingsClient() {
  const qc = useQueryClient();

  const statusQ = useQuery<StatusResponse, ApiResponseError>({
    queryKey: ["eh-payroll-status"],
    queryFn: () => fetchApi("/api/eh-payroll/status"),
    staleTime: 30_000,
  });

  const employeesQ = useQuery<EmployeesResponse, ApiResponseError>({
    queryKey: ["eh-payroll-employees"],
    queryFn: () => fetchApi("/api/eh-payroll/employees"),
    enabled: !!statusQ.data?.connected,
    staleTime: 30_000,
  });

  const syncMutation = useMutation<SyncSummary, Error>({
    mutationFn: () =>
      mutateApi<SyncSummary>("/api/eh-payroll/sync", { method: "POST" }),
    onSuccess: (s) => {
      toast({
        description: `Sync complete — ${s.newlyMapped} newly mapped, ${s.unchanged} unchanged, ${s.cleared} cleared, ${s.unmatchedCount} still unmatched.`,
      });
      qc.invalidateQueries({ queryKey: ["eh-payroll-status"] });
      qc.invalidateQueries({ queryKey: ["eh-payroll-employees"] });
    },
    onError: (err) =>
      toast({ variant: "destructive", description: err.message }),
  });

  const status = statusQ.data;
  const unmapped = employeesQ.data?.unmappedDashboardUsers ?? [];

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <Link
          href="/settings"
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          Settings
        </Link>
        <div className="mt-2">
          <PageHeader
            title="Payroll integration"
            description="Employment Hero Payroll. Connects staff to their payslip, leave, and expense data on My Portal. Per-staff mapping happens on the staff profile (Pay & compensation → Payroll link)."
          />
        </div>
      </div>

      {/* 1. Connection status */}
      <section
        className="bg-card border border-border rounded-xl p-6"
        data-testid="payroll-status-card"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              {statusQ.isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin text-muted" />
              ) : status?.connected ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              ) : (
                <XCircle className="w-5 h-5 text-red-600" />
              )}
              {statusQ.isLoading
                ? "Checking connection…"
                : status?.connected
                  ? "Connected"
                  : status?.configured
                    ? "Configured but unreachable"
                    : "Not configured"}
            </h2>
            {status?.business && (
              <p className="text-sm text-muted mt-1">
                Linked to{" "}
                <span className="font-medium text-foreground">
                  {status.business.name}
                </span>{" "}
                <span className="text-muted/70">
                  (EH id {status.business.id})
                </span>
              </p>
            )}
            {status?.error && (
              <p className="text-sm text-red-700 mt-1">{status.error}</p>
            )}
            {!status?.configured && !statusQ.isLoading && (
              <p className="text-sm text-muted mt-1">
                Set <code className="text-xs">EH_PAYROLL_API_KEY</code> and{" "}
                <code className="text-xs">EH_PAYROLL_BUSINESS_ID</code> in
                your Vercel project env to enable.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => syncMutation.mutate()}
            disabled={!status?.connected || syncMutation.isPending}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-brand rounded-md hover:bg-brand/90 transition-colors disabled:opacity-50 shrink-0"
            data-testid="run-sync-button"
          >
            {syncMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Run sync now
          </button>
        </div>

        {status?.mapping && (
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm">
            <StatTile
              label="EH Active Headcount"
              value={status.mapping.ehHeadcount ?? "—"}
            />
            <StatTile
              label="Dashboard Users"
              value={status.mapping.totalDashboardUsers}
            />
            <StatTile
              label="Mapped"
              value={status.mapping.mappedUsers}
              accent="emerald"
            />
            <StatTile
              label="Unmapped"
              value={status.mapping.unmappedUsers}
              accent={status.mapping.unmappedUsers > 0 ? "amber" : undefined}
            />
          </div>
        )}
      </section>

      {/* 2. Unmapped users quick-list */}
      {status?.connected && unmapped.length > 0 && (
        <section
          className="bg-card border border-amber-200 rounded-xl p-6"
          data-testid="unmapped-users-card"
        >
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            Staff without a payroll mapping ({unmapped.length})
          </h2>
          <p className="text-sm text-muted mt-1">
            These dashboard users can&apos;t see payslips / leave balances /
            expenses on My Portal until they&apos;re linked to an EH employee.
            Click through to their profile to map them.
          </p>
          <ul className="mt-4 divide-y divide-border">
            {unmapped.map((u) => (
              <li
                key={u.id}
                className="py-3 flex flex-wrap items-center gap-3"
                data-testid={`unmapped-user-${u.id}`}
              >
                <div className="flex-1 min-w-[200px]">
                  <div className="text-sm font-medium text-foreground">
                    {u.name}
                  </div>
                  <div className="text-xs text-muted">{u.email}</div>
                </div>
                <Link
                  href={`/staff/${u.id}#section-pay`}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-surface"
                >
                  Open profile
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {status?.connected && unmapped.length === 0 && employeesQ.data && (
        <section className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 flex items-start gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-emerald-900">
              All active staff are linked to a payroll record.
            </p>
            <p className="text-xs text-emerald-800/80 mt-0.5">
              The daily sync at 06:30 UTC will keep this fresh as new
              starters arrive.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: "emerald" | "amber";
}) {
  const accentClass =
    accent === "emerald"
      ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
      : accent === "amber"
        ? "border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300"
        : "border-border";
  const labelClass =
    accent === "emerald"
      ? "text-emerald-700"
      : accent === "amber"
        ? "text-amber-700"
        : "text-muted";
  const valueClass =
    accent === "emerald"
      ? "text-emerald-700"
      : accent === "amber"
        ? "text-amber-700"
        : "text-foreground";
  return (
    <div className={`border rounded-lg p-3 ${accentClass}`}>
      <div className={`text-xs uppercase tracking-wide ${labelClass}`}>
        {label}
      </div>
      <div className={`text-2xl font-semibold mt-1 ${valueClass}`}>{value}</div>
    </div>
  );
}
