"use client";

import { useStaffingDashboard } from "@/hooks/useStaffing";
import {
  Users,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  CheckCircle2,
  Loader2,
} from "lucide-react";

const statusConfig = {
  understaffed: {
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-700",
    dot: "bg-red-500",
    icon: TrendingDown,
    label: "Understaffed",
  },
  overstaffed: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-700",
    dot: "bg-amber-500",
    icon: TrendingUp,
    label: "Overstaffed",
  },
  optimal: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-700",
    dot: "bg-emerald-500",
    icon: CheckCircle2,
    label: "Optimal",
  },
  no_data: {
    bg: "bg-gray-50",
    border: "border-gray-200",
    text: "text-gray-500",
    dot: "bg-gray-400",
    icon: Users,
    label: "No Data",
  },
} as const;

export function StaffingAlerts() {
  const { data, isLoading } = useStaffingDashboard();

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-900">
            Staffing Alerts
          </h3>
        </div>
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 text-gray-300 animate-spin" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  // Use tomorrow's data as the primary view (actionable for next day)
  const summary = data.tomorrow;
  const alerts = summary.services.filter(
    (s) =>
      s.overallStatus === "overstaffed" || s.overallStatus === "understaffed",
  );

  const hasAlerts = alerts.length > 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-900">
            Staffing — Tomorrow
          </h3>
        </div>
        {hasAlerts && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-semibold">
            <AlertTriangle className="w-3 h-3" />
            {alerts.length} alert{alerts.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Summary metrics */}
      {(summary.totalWaste > 0 || summary.totalRisk > 0) && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          {summary.totalWaste > 0 && (
            <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-100">
              <p className="text-lg font-bold text-amber-700">
                ${summary.totalWaste.toFixed(0)}
              </p>
              <p className="text-[10px] text-amber-600 uppercase tracking-wider">
                Overstaffing Waste
              </p>
            </div>
          )}
          {summary.totalRisk > 0 && (
            <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-100">
              <p className="text-lg font-bold text-red-700">
                ${summary.totalRisk.toFixed(0)}
              </p>
              <p className="text-[10px] text-red-600 uppercase tracking-wider">
                Revenue at Risk
              </p>
            </div>
          )}
        </div>
      )}

      {/* Service list */}
      <div className="space-y-1">
        {summary.services.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">
            No OWNA data synced yet. Map services in Settings to enable staffing
            analysis.
          </p>
        ) : !hasAlerts ? (
          <div className="flex items-center gap-2 px-3 py-3 bg-emerald-50 rounded-lg">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <p className="text-sm text-emerald-700 font-medium">
              All {summary.services.length} centres optimally staffed
            </p>
          </div>
        ) : (
          alerts.map((svc) => {
            const config = statusConfig[svc.overallStatus];
            const Icon = config.icon;
            return (
              <div
                key={svc.serviceId}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border ${config.bg} ${config.border}`}
              >
                <Icon className={`w-4 h-4 ${config.text} flex-shrink-0`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${config.text} truncate`}>
                    {svc.serviceName}
                  </p>
                  <p className="text-[10px] text-gray-500">
                    {svc.sessions
                      .filter((s) => s.variance !== 0)
                      .map(
                        (s) =>
                          `${s.sessionType.toUpperCase()}: ${s.variance > 0 ? "+" : ""}${s.variance} educator${Math.abs(s.variance) !== 1 ? "s" : ""}`,
                      )
                      .join(" · ")}
                  </p>
                </div>
                <span className={`text-xs font-semibold ${config.text} whitespace-nowrap`}>
                  {svc.totalWaste > 0
                    ? `$${svc.totalWaste.toFixed(0)}`
                    : `$${svc.totalRisk.toFixed(0)}`}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
