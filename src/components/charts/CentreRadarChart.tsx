"use client";

import { useState } from "react";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { ChartCard } from "./ChartCard";
import { CHART_COLORS } from "./chart-colors";
import type { CentrePerformance } from "@/hooks/usePerformance";

interface CentreRadarChartProps {
  centres: CentrePerformance[];
}

function normalise(value: number | null | undefined, max: number): number {
  if (value === null || value === undefined) return 0;
  return Math.min(Math.max((value / max) * 100, 0), 100);
}

export function CentreRadarChart({ centres }: CentreRadarChartProps) {
  const [selectedId, setSelectedId] = useState<string>(centres[0]?.id || "");

  const selected = centres.find((c) => c.id === selectedId) || centres[0];

  const radarData = selected
    ? [
        {
          metric: "Occupancy",
          value: normalise(selected.metrics?.ascOccupancy, 100),
          raw: selected.metrics?.ascOccupancy ?? 0,
        },
        {
          metric: "Compliance",
          value: normalise(selected.metrics?.overallCompliance, 100),
          raw: selected.metrics?.overallCompliance ?? 0,
        },
        {
          metric: "NPS",
          value: normalise(selected.metrics?.parentNps, 100),
          raw: selected.metrics?.parentNps ?? 0,
        },
        {
          metric: "Margin",
          value: normalise(selected.financials?.margin, 40),
          raw: selected.financials?.margin ?? 0,
        },
        {
          metric: "Staff",
          value: normalise(selected.metrics?.totalEducators, 30),
          raw: selected.metrics?.totalEducators ?? 0,
        },
      ]
    : [];

  return (
    <ChartCard title="Centre Radar" subtitle="Multi-metric comparison (normalised to 0-100)">
      <div className="mb-3">
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#004E64]/20 focus:border-[#004E64]"
        >
          {centres.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} (Score: {c.score})
            </option>
          ))}
        </select>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
          <PolarGrid stroke="#E5E7EB" />
          <PolarAngleAxis
            dataKey="metric"
            tick={{ fontSize: 12, fill: "#6B7280" }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{ fontSize: 10, fill: "#9CA3AF" }}
            tickCount={5}
          />
          <Radar
            name={selected?.name || "Centre"}
            dataKey="value"
            stroke={CHART_COLORS.primary}
            fill={CHART_COLORS.primary}
            fillOpacity={0.2}
            strokeWidth={2}
          />
          <Tooltip
            formatter={(value: number | string | undefined, _name: string | undefined, props: unknown) => {
              const p = props as { payload?: { raw?: number; metric?: string } } | undefined;
              const raw = p?.payload?.raw ?? 0;
              const metric = p?.payload?.metric ?? "";
              const suffix =
                metric === "Occupancy" || metric === "Compliance" || metric === "Margin"
                  ? "%"
                  : "";
              return [`${raw}${suffix} (normalised: ${Number(value ?? 0).toFixed(0)})`, metric];
            }}
            contentStyle={{
              borderRadius: "8px",
              border: "1px solid #E5E7EB",
              boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
            }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
