"use client";

import {
  DollarSign,
  Users,
  ThumbsUp,
  MessageSquare,
  Building2,
  Mountain,
  Clock,
  Baby,
  ShieldCheck,
  TrendingUp,
  UserPlus,
  AlertTriangle,
} from "lucide-react";
import type { OpsMetrics } from "@/hooks/useDashboardData";

interface KeyMetrics {
  totalRevenue: number;
  avgOccupancy: number;
  overallNps: number;
  openTickets: number;
  activeCentres: number;
  rocksOnTrack: number;
  todosOverdue: number;
}

interface KeyMetricsBarProps {
  metrics: KeyMetrics;
  opsMetrics?: OpsMetrics | null;
  hideFinancials?: boolean;
}

const formatCurrency = (value: number) => {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  return `$${value.toFixed(0)}`;
};

export function KeyMetricsBar({ metrics, opsMetrics, hideFinancials }: KeyMetricsBarProps) {
  // Build ops-enhanced items when opsMetrics available
  const hasOps = opsMetrics != null;

  const allItems = [
    // Real-time ops row (shown when opsMetrics available)
    ...(hasOps
      ? [
          {
            label: "Attendance",
            fullLabel: "Today's Attendance (BSC + ASC)",
            value: `${opsMetrics.todayAttended}/${opsMetrics.todayExpected}`,
            icon: Baby,
            color: opsMetrics.todayAttended >= opsMetrics.todayExpected * 0.8
              ? "#10B981"
              : "#F59E0B",
            financial: false,
          },
          {
            label: "Staffing",
            fullLabel: "Centres with Staffing Gaps or Overstaffing",
            value: opsMetrics.staffingAlerts > 0
              ? `${opsMetrics.staffingAlerts} alert${opsMetrics.staffingAlerts !== 1 ? "s" : ""}`
              : "All clear",
            icon: opsMetrics.staffingAlerts > 0 ? AlertTriangle : ShieldCheck,
            color: opsMetrics.staffingAlerts > 0 ? "#F59E0B" : "#10B981",
            financial: false,
          },
          {
            label: "Compliance",
            fullLabel: "Network Compliance Score",
            value: `${opsMetrics.complianceScore}%`,
            icon: ShieldCheck,
            color: opsMetrics.complianceScore >= 90
              ? "#10B981"
              : opsMetrics.complianceScore >= 70
              ? "#F59E0B"
              : "#EF4444",
            financial: false,
          },
          {
            label: "Wk Revenue",
            fullLabel: "Revenue This Week (from attendance)",
            value: formatCurrency(opsMetrics.weeklyRevenue),
            icon: TrendingUp,
            color: "#10B981",
            financial: true,
          },
          {
            label: "Pipeline",
            fullLabel: "Active Enrolment Pipeline Leads",
            value: `${opsMetrics.pipelineLeads}`,
            icon: UserPlus,
            color: "#8B5CF6",
            financial: true,
          },
        ]
      : []),
    // Original metrics
    {
      label: "Revenue",
      fullLabel: "Total Revenue (period)",
      value: formatCurrency(metrics.totalRevenue),
      icon: DollarSign,
      color: "#10B981",
      financial: true,
    },
    {
      label: "Occupancy",
      fullLabel: "Average Occupancy",
      value: `${metrics.avgOccupancy}%`,
      icon: Users,
      color: "#3B82F6",
      financial: false,
    },
    {
      label: "NPS",
      fullLabel: "Overall Net Promoter Score",
      value: `${metrics.overallNps}`,
      icon: ThumbsUp,
      color: "#8B5CF6",
      financial: false,
    },
    {
      label: "Tickets",
      fullLabel: "Open Support Tickets",
      value: `${metrics.openTickets}`,
      icon: MessageSquare,
      color: "#F59E0B",
      financial: true,
    },
    {
      label: "Centres",
      fullLabel: "Active Service Centres",
      value: `${metrics.activeCentres}`,
      icon: Building2,
      color: "#004E64",
      financial: false,
    },
    {
      label: "On Track",
      fullLabel: "Rocks On Track (quarterly priorities)",
      value: `${metrics.rocksOnTrack}`,
      icon: Mountain,
      color: "#004E64",
      financial: false,
    },
    {
      label: "Overdue",
      fullLabel: "Overdue To-Dos",
      value: `${metrics.todosOverdue}`,
      icon: Clock,
      color: metrics.todosOverdue > 0 ? "#EF4444" : "#10B981",
      financial: false,
    },
  ];

  const items = hideFinancials ? allItems.filter((i) => !i.financial) : allItems;

  // Split into ops row and original row when we have ops data
  const opsItems = hasOps ? items.slice(0, 5) : [];
  const coreItems = hasOps ? items.slice(5) : items;

  return (
    <div className="space-y-3">
      {/* Ops metrics row */}
      {opsItems.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Live Operations
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {opsItems.map((item) => (
              <div key={item.label} className="flex items-center gap-3" title={item.fullLabel}>
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: item.color + "15", color: item.color }}
                >
                  <item.icon className="w-4.5 h-4.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 whitespace-nowrap">{item.label}</p>
                  <p className="text-lg font-bold text-gray-900 leading-tight">
                    {item.value}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Core metrics row */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        {hasOps && (
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Period Metrics
          </p>
        )}
        <div className={`grid grid-cols-2 sm:grid-cols-3 ${hideFinancials ? "lg:grid-cols-5" : "sm:grid-cols-4 lg:grid-cols-7"} gap-4`}>
          {coreItems.map((item) => (
            <div key={item.label} className="flex items-center gap-3" title={item.fullLabel}>
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: item.color + "15", color: item.color }}
              >
                <item.icon className="w-4.5 h-4.5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-500 whitespace-nowrap">{item.label}</p>
                <p className="text-lg font-bold text-gray-900 leading-tight">
                  {item.value}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
