"use client";

import { useEffect, useState } from "react";
import { Users, AlertTriangle, UserPlus, CheckCircle } from "lucide-react";

interface StatsData {
  totalActive: number;
  stuckCount: number;
  newThisWeek: number;
  enrolledThisMonth: number;
}

export function EnquiryStatsBar({
  serviceId,
  refreshKey,
}: {
  serviceId: string;
  refreshKey: number;
}) {
  const [stats, setStats] = useState<StatsData | null>(null);

  useEffect(() => {
    const url = serviceId
      ? `/api/enquiries/stats?serviceId=${serviceId}`
      : "/api/enquiries/stats";
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        const newThisWeek = Object.values(data.countByStage || {}).reduce(
          (sum: number, val: any) => sum + (typeof val === "number" ? val : 0),
          0,
        ) as number;
        setStats({
          totalActive: data.totalActive || 0,
          stuckCount: data.stuckCount || 0,
          newThisWeek: data.countByStage?.new_enquiry || 0,
          enrolledThisMonth:
            (data.countByStage?.enrolled || 0) +
            (data.countByStage?.first_session || 0) +
            (data.countByStage?.retained || 0),
        });
      })
      .catch(console.error);
  }, [serviceId, refreshKey]);

  if (!stats) return null;

  const statCards = [
    {
      label: "Active Enquiries",
      value: stats.totalActive,
      icon: Users,
      colour: "text-blue-600 bg-blue-50",
    },
    {
      label: "Stuck (>48hrs)",
      value: stats.stuckCount,
      icon: AlertTriangle,
      colour:
        stats.stuckCount > 0
          ? "text-red-600 bg-red-50"
          : "text-gray-500 bg-gray-50",
    },
    {
      label: "New Enquiries",
      value: stats.newThisWeek,
      icon: UserPlus,
      colour: "text-emerald-600 bg-emerald-50",
    },
    {
      label: "Enrolled / Retained",
      value: stats.enrolledThisMonth,
      icon: CheckCircle,
      colour: "text-purple-600 bg-purple-50",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {statCards.map((card) => (
        <div
          key={card.label}
          className="bg-white rounded-lg border border-gray-200 p-4 flex items-center gap-3"
        >
          <div className={`p-2 rounded-lg ${card.colour}`}>
            <card.icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{card.value}</p>
            <p className="text-xs text-gray-500">{card.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
