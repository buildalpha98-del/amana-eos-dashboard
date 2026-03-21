"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ChevronRight, ShieldAlert, ClipboardCheck, AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";

interface ComplianceData {
  expiringCerts: number;
  expiredCerts: number;
  overdueAudits: number;
  complianceRate: number;
}

export function ComplianceOverviewWidget() {
  const { data, isLoading } = useQuery<ComplianceData>({
    queryKey: ["compliance-overview-widget"],
    queryFn: async () => {
      const res = await fetch("/api/compliance?summary=true");
      if (!res.ok) {
        // Fallback: pull from dashboard opsMetrics
        const dashRes = await fetch("/api/dashboard");
        if (!dashRes.ok) throw new Error("Failed to load");
        const dash = await dashRes.json();
        return {
          expiringCerts: 0,
          expiredCerts: 0,
          overdueAudits: 0,
          complianceRate: dash.opsMetrics?.complianceScore ?? 0,
        };
      }
      const compliance = await res.json();
      // Compliance API may return various shapes — handle gracefully
      return {
        expiringCerts: compliance.expiringCount ?? compliance.expiring ?? 0,
        expiredCerts: compliance.expiredCount ?? compliance.expired ?? 0,
        overdueAudits: compliance.overdueAudits ?? 0,
        complianceRate: compliance.complianceRate ?? compliance.overallRate ?? 0,
      };
    },
    staleTime: 5 * 60_000,
  });

  if (isLoading) {
    return (
      <div className="bg-card rounded-xl border border-border p-6">
        <Skeleton className="h-5 w-44 mb-4" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const hasIssues = data.expiringCerts > 0 || data.expiredCerts > 0 || data.overdueAudits > 0;

  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-brand" />
          Compliance Overview
        </h3>
        <Link
          href="/compliance"
          className="text-xs font-medium text-brand hover:underline flex items-center gap-1"
        >
          View all <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {!hasIssues ? (
        <div className="text-center py-4">
          <p className="text-sm text-success font-medium">All compliance items are up to date.</p>
          <p className="text-xs text-muted mt-1">Network rate: {data.complianceRate}%</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Overall compliance rate */}
          <div className="flex items-center justify-between p-3 bg-surface rounded-lg">
            <span className="text-xs text-muted font-medium">Network Compliance Rate</span>
            <span className={`text-sm font-bold ${
              data.complianceRate >= 90 ? "text-emerald-600" : data.complianceRate >= 70 ? "text-amber-600" : "text-red-600"
            }`}>
              {data.complianceRate}%
            </span>
          </div>

          {/* Issue cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {data.expiredCerts > 0 && (
              <Link
                href="/compliance?filter=expired"
                className="flex items-center gap-3 p-3 rounded-lg border border-red-200 bg-red-50 hover:border-red-300 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                </div>
                <div>
                  <div className="text-lg font-bold text-red-600 leading-none">{data.expiredCerts}</div>
                  <div className="text-[11px] text-red-600/70 mt-0.5">Expired Certs</div>
                </div>
              </Link>
            )}

            {data.expiringCerts > 0 && (
              <Link
                href="/compliance?filter=expiring"
                className="flex items-center gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50 hover:border-amber-300 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <ShieldAlert className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <div className="text-lg font-bold text-amber-600 leading-none">{data.expiringCerts}</div>
                  <div className="text-[11px] text-amber-600/70 mt-0.5">Expiring Soon</div>
                </div>
              </Link>
            )}

            {data.overdueAudits > 0 && (
              <Link
                href="/compliance?filter=audits"
                className="flex items-center gap-3 p-3 rounded-lg border border-red-200 bg-red-50 hover:border-red-300 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
                  <ClipboardCheck className="w-4 h-4 text-red-600" />
                </div>
                <div>
                  <div className="text-lg font-bold text-red-600 leading-none">{data.overdueAudits}</div>
                  <div className="text-[11px] text-red-600/70 mt-0.5">Overdue Audits</div>
                </div>
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
