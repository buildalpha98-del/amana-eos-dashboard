"use client";

import { useSession } from "next-auth/react";
import {
  Mountain,
  CheckSquare,
  AlertCircle,
  BarChart3,
  Plus,
  TrendingUp,
} from "lucide-react";
import { getCurrentQuarter } from "@/lib/utils";
import Link from "next/link";

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
  href,
}: {
  title: string;
  value: string | number;
  subtitle: string;
  icon: React.ElementType;
  color: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
          <p className="text-sm text-gray-400 mt-1">{subtitle}</p>
        </div>
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: color + "15", color }}
        >
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </Link>
  );
}

export function DashboardContent() {
  const { data: session } = useSession();
  const quarter = getCurrentQuarter();

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Welcome Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">
          Welcome back, {session?.user?.name?.split(" ")[0] || "there"}
        </h2>
        <p className="text-gray-500 mt-1">
          Here&apos;s your {quarter} overview at a glance.
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Active Rocks"
          value={0}
          subtitle="this quarter"
          icon={Mountain}
          color="#1B4D3E"
          href="/rocks"
        />
        <StatCard
          title="To-Dos This Week"
          value="0 / 0"
          subtitle="completed"
          icon={CheckSquare}
          color="#3B82F6"
          href="/todos"
        />
        <StatCard
          title="Open Issues"
          value={0}
          subtitle="pending resolution"
          icon={AlertCircle}
          color="#EF4444"
          href="/issues"
        />
        <StatCard
          title="Scorecard Health"
          value="--"
          subtitle="on track this week"
          icon={BarChart3}
          color="#FECE00"
          href="/scorecard"
        />
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Empty State - Rocks */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Rock Progress
            </h3>
            <Link
              href="/rocks"
              className="text-sm text-[#1B4D3E] hover:underline"
            >
              View all
            </Link>
          </div>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Mountain className="w-12 h-12 text-gray-300 mb-3" />
            <p className="text-gray-500 text-sm">
              No Rocks for this quarter yet.
            </p>
            <p className="text-gray-400 text-xs mt-1">
              Ready to set some 90-day goals?
            </p>
            <Link
              href="/rocks"
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-[#1B4D3E] text-white text-sm font-medium rounded-lg hover:bg-[#164032] transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Rock
            </Link>
          </div>
        </div>

        {/* Empty State - Scorecard */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Scorecard Snapshot
            </h3>
            <Link
              href="/scorecard"
              className="text-sm text-[#1B4D3E] hover:underline"
            >
              View all
            </Link>
          </div>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <TrendingUp className="w-12 h-12 text-gray-300 mb-3" />
            <p className="text-gray-500 text-sm">
              No scorecard data yet.
            </p>
            <p className="text-gray-400 text-xs mt-1">
              Set up your weekly measurables to track performance.
            </p>
            <Link
              href="/scorecard"
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-[#1B4D3E] text-white text-sm font-medium rounded-lg hover:bg-[#164032] transition-colors"
            >
              <Plus className="w-4 h-4" />
              Set Up Scorecard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
