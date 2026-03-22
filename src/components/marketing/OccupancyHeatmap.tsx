"use client";

import { useState, useEffect } from "react";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowUpDown,
  Sparkles,
} from "lucide-react";

interface CentreOccupancy {
  serviceId: string;
  serviceName: string;
  serviceCode: string;
  state: string | null;
  schoolPopulation: number;
  currentASC: number;
  currentBSC: number;
  ascTarget: number;
  bscTarget: number;
  ascPenetration: number;
  bscPenetration: number;
  ascGap: number;
  bscGap: number;
  totalGap: number;
  ascStatus: "red" | "amber" | "green";
  bscStatus: "red" | "amber" | "green";
  weekOnWeekTrend: number;
  status: "red" | "amber" | "green";
  parentSegment: string | null;
  parentDriver: string | null;
  launchDate: string | null;
  launchPhase: string | null;
  thisWeekAttended: number;
}

interface OccupancyData {
  centres: CentreOccupancy[];
  network: {
    totalCurrentWeekly: number;
    target: number;
    percentage: number;
  };
}

type SortKey = "gap" | "penetration" | "state";

const STATUS_COLORS = {
  red: { dot: "bg-red-500", border: "border-red-300", bg: "bg-red-50" },
  amber: { dot: "bg-amber-500", border: "border-amber-300", bg: "bg-amber-50" },
  green: { dot: "bg-green-500", border: "border-green-300", bg: "bg-green-50" },
};

const DRIVER_LABELS: Record<string, string> = {
  homework: "Homework",
  quran: "Quran / Iqra",
  enrichment: "Enrichment",
  working_parents: "Working Parents",
  working_parent: "Working Parent",
  traffic: "Traffic",
  sports: "Sports",
};

export function OccupancyHeatmap({ serviceId }: { serviceId?: string }) {
  const [data, setData] = useState<OccupancyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortKey>("gap");
  const [stateFilter, setStateFilter] = useState("");

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (stateFilter) params.set("state", stateFilter);
    fetch(`/api/marketing/occupancy?${params}`)
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [stateFilter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" />
      </div>
    );
  }

  if (!data) return null;

  // Filter by serviceId if provided
  let centres = data.centres;
  if (serviceId) {
    centres = centres.filter((c) => c.serviceId === serviceId);
  }

  // Sort
  const sorted = [...centres].sort((a, b) => {
    if (sortBy === "gap") return b.totalGap - a.totalGap;
    if (sortBy === "penetration") return a.ascPenetration - b.ascPenetration;
    return (a.state ?? "").localeCompare(b.state ?? "");
  });

  // Network progress bar colour
  const netPct = data.network.percentage;
  const netColour = netPct >= 70 ? "bg-green-500" : netPct >= 40 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="space-y-6">
      {/* Network Counter */}
      <div className="bg-card rounded-xl border p-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              Network Weekly Attendances
            </h3>
            <p className="text-sm text-muted">
              All centres combined — target 2,000 per week
            </p>
          </div>
          <div className="text-right">
            <span className="text-3xl font-bold text-foreground">
              {data.network.totalCurrentWeekly.toLocaleString()}
            </span>
            <span className="text-lg text-muted"> / 2,000</span>
          </div>
        </div>
        <div className="w-full bg-border rounded-full h-4">
          <div
            className={`${netColour} h-4 rounded-full transition-all`}
            style={{ width: `${Math.min(netPct, 100)}%` }}
          />
        </div>
        <p className="text-xs text-muted mt-1 text-right">{netPct}%</p>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <select
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value)}
          className="px-3 py-1.5 border border-border rounded-md text-sm"
        >
          <option value="">All States</option>
          <option value="NSW">NSW</option>
          <option value="VIC">VIC</option>
        </select>
        <div className="flex items-center gap-1 text-sm text-muted">
          <ArrowUpDown className="h-3.5 w-3.5" />
          Sort:
        </div>
        {(["gap", "penetration", "state"] as SortKey[]).map((key) => (
          <button
            key={key}
            onClick={() => setSortBy(key)}
            className={`px-3 py-1 text-xs rounded-full ${
              sortBy === key
                ? "bg-brand/10 text-brand"
                : "bg-surface text-muted hover:bg-border"
            }`}
          >
            {key === "gap" ? "Biggest Gap" : key === "penetration" ? "Lowest Penetration" : "State"}
          </button>
        ))}
      </div>

      {/* Centre Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {sorted.map((centre) => (
          <CentreCard key={centre.serviceId} centre={centre} />
        ))}
      </div>
    </div>
  );
}

function CentreCard({ centre }: { centre: CentreOccupancy }) {
  const statusStyle = STATUS_COLORS[centre.status];

  return (
    <div
      className={`bg-card rounded-lg border-2 ${statusStyle.border} p-4 space-y-3`}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-semibold text-foreground text-sm">
            {centre.serviceName}
          </h4>
          <div className="flex items-center gap-2 mt-0.5">
            {centre.state && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface text-muted font-medium">
                {centre.state}
              </span>
            )}
            <span className="text-xs text-muted">
              Pop: {centre.schoolPopulation.toLocaleString()}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {centre.launchPhase === "launch" && (
            <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
              <Sparkles className="h-3 w-3" />
              NEW
            </span>
          )}
          <TrendBadge value={centre.weekOnWeekTrend} />
        </div>
      </div>

      {/* ASC Row */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted font-medium">ASC</span>
          <span className="text-muted">
            {centre.currentASC} / {centre.ascTarget}
            <span className="text-muted ml-1">({centre.ascPenetration}%)</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-border rounded-full h-2">
            <div
              className={`h-2 rounded-full ${STATUS_COLORS[centre.ascStatus].dot}`}
              style={{
                width: `${Math.min(
                  centre.ascTarget > 0
                    ? (centre.currentASC / centre.ascTarget) * 100
                    : 0,
                  100,
                )}%`,
              }}
            />
          </div>
          {centre.ascGap > 0 && (
            <span className="text-[10px] text-red-600 font-medium whitespace-nowrap">
              -{centre.ascGap}
            </span>
          )}
        </div>
      </div>

      {/* BSC Row */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted font-medium">BSC</span>
          <span className="text-muted">
            {centre.currentBSC} / {centre.bscTarget}
            <span className="text-muted ml-1">({centre.bscPenetration}%)</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-border rounded-full h-2">
            <div
              className={`h-2 rounded-full ${STATUS_COLORS[centre.bscStatus].dot}`}
              style={{
                width: `${Math.min(
                  centre.bscTarget > 0
                    ? (centre.currentBSC / centre.bscTarget) * 100
                    : 0,
                  100,
                )}%`,
              }}
            />
          </div>
          {centre.bscGap > 0 && (
            <span className="text-[10px] text-red-600 font-medium whitespace-nowrap">
              -{centre.bscGap}
            </span>
          )}
        </div>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1.5 pt-1">
        {centre.parentSegment && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 capitalize">
            {centre.parentSegment}
          </span>
        )}
        {centre.parentDriver && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface text-muted">
            {DRIVER_LABELS[centre.parentDriver] || centre.parentDriver}
          </span>
        )}
      </div>
    </div>
  );
}

function TrendBadge({ value }: { value: number }) {
  if (value > 0) {
    return (
      <span className="flex items-center gap-0.5 text-[10px] text-green-700 bg-green-50 px-1.5 py-0.5 rounded-full">
        <TrendingUp className="h-3 w-3" />
        +{value}%
      </span>
    );
  }
  if (value < 0) {
    return (
      <span className="flex items-center gap-0.5 text-[10px] text-red-700 bg-red-50 px-1.5 py-0.5 rounded-full">
        <TrendingDown className="h-3 w-3" />
        {value}%
      </span>
    );
  }
  return (
    <span className="flex items-center gap-0.5 text-[10px] text-muted bg-surface/50 px-1.5 py-0.5 rounded-full">
      <Minus className="h-3 w-3" />
      0%
    </span>
  );
}
