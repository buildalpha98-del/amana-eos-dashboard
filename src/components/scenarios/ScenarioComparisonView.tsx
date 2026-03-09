"use client";

import { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { ChartCard } from "@/components/charts/ChartCard";
import { CHART_PALETTE } from "@/components/charts/chart-colors";
import {
  calculateScenario,
  PRESET_SCENARIOS,
  formatAUD,
  formatAUDFull,
  type ScenarioInputs,
  type ScenarioOutputs,
} from "@/lib/scenario-engine";
import type { SavedScenario } from "@/hooks/useScenarios";

interface Props {
  savedScenarios: SavedScenario[];
}

interface CompareItem {
  id: string;
  name: string;
  outputs: ScenarioOutputs;
}

const METRICS: { key: keyof ScenarioOutputs; label: string; format: "currency" | "percent" | "number" }[] = [
  { key: "totalNetworkRevenue", label: "Network Revenue", format: "currency" },
  { key: "totalNetworkCosts", label: "Network Costs", format: "currency" },
  { key: "totalNetworkProfit", label: "Network Profit", format: "currency" },
  { key: "marginPercent", label: "Margin %", format: "percent" },
  { key: "annualRevenuePerCentre", label: "Revenue / Centre", format: "currency" },
  { key: "annualCostPerCentre", label: "Cost / Centre", format: "currency" },
  { key: "annualProfitPerCentre", label: "Profit / Centre", format: "currency" },
  { key: "valuationAt5x", label: "Valuation (5x)", format: "currency" },
  { key: "valuationAt8x", label: "Valuation (8x)", format: "currency" },
  { key: "breakEvenCentres", label: "Break-even Centres", format: "number" },
];

function formatMetric(value: number, format: "currency" | "percent" | "number"): string {
  if (format === "currency") return formatAUD(value);
  if (format === "percent") return `${value.toFixed(1)}%`;
  return value >= 999 ? "N/A" : String(value);
}

function diffClass(base: number, compare: number, higherIsBetter: boolean): string {
  if (base === compare) return "";
  const better = higherIsBetter ? compare > base : compare < base;
  return better ? "text-emerald-600 bg-emerald-50" : "text-red-600 bg-red-50";
}

const HIGHER_IS_BETTER: Record<string, boolean> = {
  totalNetworkRevenue: true,
  totalNetworkCosts: false,
  totalNetworkProfit: true,
  marginPercent: true,
  annualRevenuePerCentre: true,
  annualCostPerCentre: false,
  annualProfitPerCentre: true,
  valuationAt5x: true,
  valuationAt8x: true,
  breakEvenCentres: false,
};

export function ScenarioComparisonView({ savedScenarios }: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Build selectable options (presets + saved)
  const options = useMemo(() => {
    const presets = PRESET_SCENARIOS.map((p) => ({
      id: `preset:${p.key}`,
      name: p.name,
      inputs: p.inputs,
    }));
    const saved = savedScenarios.map((s) => ({
      id: `saved:${s.id}`,
      name: s.name,
      inputs: s.inputs as ScenarioInputs,
    }));
    return [...presets, ...saved];
  }, [savedScenarios]);

  // Calculate outputs for selected scenarios
  const compareItems: CompareItem[] = useMemo(() => {
    return selectedIds
      .map((id) => {
        const opt = options.find((o) => o.id === id);
        if (!opt) return null;
        return {
          id: opt.id,
          name: opt.name,
          outputs: calculateScenario(opt.inputs),
        };
      })
      .filter(Boolean) as CompareItem[];
  }, [selectedIds, options]);

  function toggleScenario(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return prev; // max 3
      return [...prev, id];
    });
  }

  // Chart data for grouped bar comparison
  const chartData = useMemo(() => {
    return [
      { metric: "Revenue", ...Object.fromEntries(compareItems.map((c) => [c.name, c.outputs.totalNetworkRevenue])) },
      { metric: "Costs", ...Object.fromEntries(compareItems.map((c) => [c.name, c.outputs.totalNetworkCosts])) },
      { metric: "Profit", ...Object.fromEntries(compareItems.map((c) => [c.name, c.outputs.totalNetworkProfit])) },
    ];
  }, [compareItems]);

  return (
    <div className="space-y-6">
      {/* Scenario Selector */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Select Scenarios to Compare (max 3)</h3>
        <div className="flex flex-wrap gap-2">
          {options.map((opt) => {
            const active = selectedIds.includes(opt.id);
            return (
              <button
                key={opt.id}
                onClick={() => toggleScenario(opt.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  active
                    ? "bg-brand text-white border-brand"
                    : "bg-white text-gray-600 border-gray-300 hover:border-brand hover:text-brand"
                } ${!active && selectedIds.length >= 3 ? "opacity-40 cursor-not-allowed" : ""}`}
                disabled={!active && selectedIds.length >= 3}
              >
                {opt.name}
              </button>
            );
          })}
        </div>
      </div>

      {compareItems.length === 0 && (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
          <p className="text-gray-400 text-sm">Select 2-3 scenarios above to compare them side by side</p>
        </div>
      )}

      {/* Comparison Table */}
      {compareItems.length >= 2 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Metric</th>
                {compareItems.map((c, i) => (
                  <th key={c.id} className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: CHART_PALETTE[i] }}>
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {METRICS.map((m) => (
                <tr key={m.key} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-2.5 text-xs font-medium text-gray-600">{m.label}</td>
                  {compareItems.map((c, i) => {
                    const value = c.outputs[m.key] as number;
                    const baseValue = i === 0 ? value : (compareItems[0].outputs[m.key] as number);
                    const cls = i === 0 ? "" : diffClass(baseValue, value, HIGHER_IS_BETTER[m.key] ?? true);
                    return (
                      <td key={c.id} className={`px-4 py-2.5 text-xs font-semibold text-right tabular-nums ${cls} rounded`}>
                        {formatMetric(value, m.format)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Grouped Bar Chart */}
      {compareItems.length >= 2 && (
        <ChartCard title="Scenario Comparison" subtitle="Revenue, costs & profit side by side">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="metric" tick={{ fontSize: 12, fill: "#6B7280" }} axisLine={{ stroke: "#E5E7EB" }} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: "#6B7280" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${(v / 1_000_000).toFixed(1)}M`} />
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <Tooltip formatter={(v: any) => formatAUDFull(Number(v ?? 0))} contentStyle={{ borderRadius: "8px", border: "1px solid #E5E7EB", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)" }} />
              <Legend />
              {compareItems.map((c, i) => (
                <Bar key={c.id} dataKey={c.name} fill={CHART_PALETTE[i]} radius={[4, 4, 0, 0]} maxBarSize={40} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
}
