"use client";

import {
  DollarSign,
  Users,
  ThumbsUp,
  MessageSquare,
  Building2,
  Mountain,
  Clock,
} from "lucide-react";

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
}

const formatCurrency = (value: number) => {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  return `$${value.toFixed(0)}`;
};

export function KeyMetricsBar({ metrics }: KeyMetricsBarProps) {
  const items = [
    {
      label: "Total Revenue",
      value: formatCurrency(metrics.totalRevenue),
      icon: DollarSign,
      color: "#10B981",
    },
    {
      label: "Avg Occupancy",
      value: `${metrics.avgOccupancy}%`,
      icon: Users,
      color: "#3B82F6",
    },
    {
      label: "Overall NPS",
      value: `${metrics.overallNps}`,
      icon: ThumbsUp,
      color: "#8B5CF6",
    },
    {
      label: "Open Tickets",
      value: `${metrics.openTickets}`,
      icon: MessageSquare,
      color: "#F59E0B",
    },
    {
      label: "Active Centres",
      value: `${metrics.activeCentres}`,
      icon: Building2,
      color: "#004E64",
    },
    {
      label: "Rocks On Track",
      value: `${metrics.rocksOnTrack}`,
      icon: Mountain,
      color: "#004E64",
    },
    {
      label: "Overdue To-Dos",
      value: `${metrics.todosOverdue}`,
      icon: Clock,
      color: metrics.todosOverdue > 0 ? "#EF4444" : "#10B981",
    },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              style={{ backgroundColor: item.color + "15", color: item.color }}
            >
              <item.icon className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500 truncate">{item.label}</p>
              <p className="text-lg font-bold text-gray-900 leading-tight">
                {item.value}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
