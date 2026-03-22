"use client";

import { Building2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CentreHealthItem, OpsMetrics } from "@/hooks/useDashboardData";

interface DashboardStateKPIProps {
  stateName: string;
  stateCode: string;
  centres: CentreHealthItem[];
  opsMetrics: OpsMetrics | null;
}

const STATE_LABELS: Record<string, string> = {
  VIC: "Victoria",
  NSW: "New South Wales",
  QLD: "Queensland",
  SA: "South Australia",
  WA: "Western Australia",
  TAS: "Tasmania",
  NT: "Northern Territory",
  ACT: "Australian Capital Territory",
};

export function DashboardStateKPI({ stateName, stateCode, centres, opsMetrics }: DashboardStateKPIProps) {
  const total = centres.length;
  if (total === 0) return null;

  const green = centres.filter((c) => c.status === "green").length;
  const amber = centres.filter((c) => c.status === "amber").length;
  const red = centres.filter((c) => c.status === "red").length;

  const avgHealth = Math.round(centres.reduce((s, c) => s + c.score, 0) / total);
  const avgOccupancy = Math.round(centres.reduce((s, c) => s + c.metrics.occupancy, 0) / total);
  const avgCompliance = Math.round(centres.reduce((s, c) => s + c.metrics.compliance, 0) / total);
  const avgNps = Math.round(centres.reduce((s, c) => s + c.metrics.nps, 0) / total);

  const improving = centres.filter((c) => c.trend === "improving").length;
  const declining = centres.filter((c) => c.trend === "declining").length;

  const fullName = STATE_LABELS[stateCode] || stateName;

  return (
    <div className="bg-card rounded-xl border border-border p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-4">
        <Building2 className="w-4 h-4 text-brand" />
        <h3 className="text-sm font-semibold text-foreground/80">
          {fullName} Overview
        </h3>
        <span className="text-xs text-muted ml-auto">{total} centre{total !== 1 ? "s" : ""}</span>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Avg Health */}
        <div className="rounded-lg bg-surface/50 px-3 py-2.5">
          <p className="text-[10px] font-medium text-muted uppercase tracking-wider mb-0.5">Avg Health</p>
          <p className={cn("text-xl font-bold", avgHealth >= 70 ? "text-emerald-600" : avgHealth >= 40 ? "text-amber-600" : "text-red-600")}>
            {avgHealth}
          </p>
        </div>

        {/* Avg Occupancy */}
        <div className="rounded-lg bg-surface/50 px-3 py-2.5">
          <p className="text-[10px] font-medium text-muted uppercase tracking-wider mb-0.5">Occupancy</p>
          <p className="text-xl font-bold text-foreground">{avgOccupancy}%</p>
        </div>

        {/* Avg Compliance */}
        <div className="rounded-lg bg-surface/50 px-3 py-2.5">
          <p className="text-[10px] font-medium text-muted uppercase tracking-wider mb-0.5">Compliance</p>
          <p className={cn("text-xl font-bold", avgCompliance >= 90 ? "text-emerald-600" : avgCompliance >= 70 ? "text-amber-600" : "text-red-600")}>
            {avgCompliance}%
          </p>
        </div>

        {/* Avg NPS */}
        <div className="rounded-lg bg-surface/50 px-3 py-2.5">
          <p className="text-[10px] font-medium text-muted uppercase tracking-wider mb-0.5">NPS</p>
          <p className={cn("text-xl font-bold", avgNps >= 50 ? "text-emerald-600" : avgNps >= 0 ? "text-amber-600" : "text-red-600")}>
            {avgNps}
          </p>
        </div>
      </div>

      {/* Centre status strip */}
      <div className="flex flex-wrap items-center gap-3 mt-4">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-xs font-medium text-emerald-700">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          {green} healthy
        </div>
        {amber > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-xs font-medium text-amber-700">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            {amber} attention
          </div>
        )}
        {red > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 text-xs font-medium text-red-700">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            {red} critical
          </div>
        )}

        <div className="ml-auto flex items-center gap-3 text-xs text-muted">
          {improving > 0 && (
            <span className="flex items-center gap-1 text-emerald-600">
              <TrendingUp className="w-3 h-3" /> {improving} improving
            </span>
          )}
          {declining > 0 && (
            <span className="flex items-center gap-1 text-red-600">
              <TrendingDown className="w-3 h-3" /> {declining} declining
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
