"use client";

import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  ShieldCheck,
  Clock,
  AlertTriangle,
  Users,
  TrendingUp,
  TrendingDown,
} from "lucide-react";

interface DirectorMetrics {
  compliance: number;
  complianceTrend?: number;
  pendingLeave: number;
  pendingLeaveTrend?: number;
  openIssues: number;
  openIssuesTrend?: number;
  staffCount: number;
  staffCountTrend?: number;
}

function getComplianceColor(rate: number): {
  bg: string;
  text: string;
  iconBg: string;
} {
  if (rate >= 90) return { bg: "bg-green-50", text: "text-green-700", iconBg: "bg-green-100" };
  if (rate >= 70) return { bg: "bg-amber-50", text: "text-amber-700", iconBg: "bg-amber-100" };
  return { bg: "bg-red-50", text: "text-red-700", iconBg: "bg-red-100" };
}

interface MetricCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  iconBg: string;
  trend?: number;
}

function MetricCard({ label, value, icon, iconBg, trend }: MetricCardProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-full ${iconBg}`}>
          {icon}
        </div>
        {trend !== undefined && trend !== 0 && (
          <div
            className={`flex items-center gap-0.5 text-xs font-medium ${
              trend > 0 ? "text-green-600" : "text-red-600"
            }`}
          >
            {trend > 0 ? (
              <TrendingUp className="h-3.5 w-3.5" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5" />
            )}
            <span>{Math.abs(trend)}%</span>
          </div>
        )}
      </div>
      <p className="mt-3 text-2xl font-bold text-gray-900">{value}</p>
      <p className="mt-0.5 text-sm text-gray-500">{label}</p>
    </div>
  );
}

export function DirectorAnalyticsWidget() {
  const { data, isLoading, error } = useQuery<DirectorMetrics>({
    queryKey: ["director-analytics"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard/director-analytics");
      if (!res.ok) throw new Error("Failed to load analytics");
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 10 * 60 * 1000, // 10 minutes
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[120px] rounded-xl" />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return null;
  }

  const complianceColors = getComplianceColor(data.compliance);

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <MetricCard
        label="Compliance Rate"
        value={`${data.compliance}%`}
        icon={<ShieldCheck className={`h-5 w-5 ${complianceColors.text}`} />}
        iconBg={complianceColors.iconBg}
        trend={data.complianceTrend}
      />
      <MetricCard
        label="Pending Leave"
        value={data.pendingLeave}
        icon={<Clock className="h-5 w-5 text-blue-600" />}
        iconBg="bg-blue-100"
        trend={data.pendingLeaveTrend}
      />
      <MetricCard
        label="Open Issues"
        value={data.openIssues}
        icon={<AlertTriangle className="h-5 w-5 text-orange-600" />}
        iconBg="bg-orange-100"
        trend={data.openIssuesTrend}
      />
      <MetricCard
        label="Staff Count"
        value={data.staffCount}
        icon={<Users className="h-5 w-5 text-violet-600" />}
        iconBg="bg-violet-100"
        trend={data.staffCountTrend}
      />
    </div>
  );
}
