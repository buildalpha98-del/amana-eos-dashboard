"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CentrePerformance } from "@/hooks/usePerformance";
import { usePerformance } from "@/hooks/usePerformance";
import {
  ArrowUp,
  ArrowDown,
  Minus,
  X,
  ChevronDown,
  BarChart3,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ComparisonCentre {
  id: string;
  name: string;
  code: string;
  state: string;
  current: {
    overall: number;
    financial: number;
    operational: number;
    compliance: number;
    satisfaction: number;
    teamCulture: number;
  };
  previous: {
    overall: number;
    financial: number;
    operational: number;
    compliance: number;
    satisfaction: number;
    teamCulture: number;
  } | null;
  trend: string;
}

interface CompareResponse {
  centres: ComparisonCentre[];
  regional: {
    state: string;
    centreCount: number;
    avgScore: number;
    topPerformer: string;
  }[];
}

// ─── Pillar Config ──────────────────────────────────────────────────────────

const PILLARS = [
  { key: "overall", label: "Overall Score" },
  { key: "financial", label: "Financial" },
  { key: "operational", label: "Operational" },
  { key: "compliance", label: "Compliance" },
  { key: "satisfaction", label: "Satisfaction" },
  { key: "teamCulture", label: "Team & Culture" },
] as const;

type PillarKey = (typeof PILLARS)[number]["key"];

// ─── Helpers ────────────────────────────────────────────────────────────────

function getScoreColor(score: number): string {
  if (score >= 80) return "text-emerald-700";
  if (score >= 60) return "text-amber-700";
  return "text-red-700";
}

function getScoreBg(score: number): string {
  if (score >= 80) return "bg-emerald-50";
  if (score >= 60) return "bg-amber-50";
  return "bg-red-50";
}

function DeltaBadge({ current, previous }: { current: number; previous: number | null }) {
  if (previous === null) return <span className="text-[10px] text-gray-300">--</span>;
  const delta = current - previous;
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-400">
        <Minus className="w-3 h-3" /> 0
      </span>
    );
  }
  if (delta > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600 font-medium">
        <ArrowUp className="w-3 h-3" /> +{delta}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] text-red-600 font-medium">
      <ArrowDown className="w-3 h-3" /> {delta}
    </span>
  );
}

// ─── Multi-Select Dropdown ──────────────────────────────────────────────────

function CentreSelector({
  allCentres,
  selectedIds,
  onToggle,
  onClear,
}: {
  allCentres: CentrePerformance[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) return allCentres;
    const q = search.toLowerCase();
    return allCentres.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        (c.state?.toLowerCase() || "").includes(q)
    );
  }, [allCentres, search]);

  const selectedCentres = allCentres.filter((c) => selectedIds.includes(c.id));

  return (
    <div className="relative">
      {/* Selected chips + trigger */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 min-w-[280px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-left hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#004E64]/20 transition-colors"
      >
        <BarChart3 className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <div className="flex-1 flex flex-wrap gap-1 min-h-[20px]">
          {selectedCentres.length === 0 ? (
            <span className="text-gray-400">Select 2-5 centres to compare...</span>
          ) : (
            selectedCentres.map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1 bg-[#004E64]/10 text-[#004E64] rounded px-1.5 py-0.5 text-xs font-medium"
              >
                {c.code}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggle(c.id);
                  }}
                  className="hover:text-red-600 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))
          )}
        </div>
        <ChevronDown className={cn("w-4 h-4 text-gray-400 transition-transform", open && "rotate-180")} />
      </button>

      {/* Dropdown */}
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 w-full min-w-[280px] bg-white rounded-lg border border-gray-200 shadow-lg overflow-hidden">
            {/* Search */}
            <div className="p-2 border-b border-gray-100">
              <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-50 rounded-md">
                <Search className="w-4 h-4 text-gray-400" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search centres..."
                  className="flex-1 bg-transparent text-sm text-gray-700 placeholder-gray-400 focus:outline-none"
                />
              </div>
            </div>

            {/* Options */}
            <div className="max-h-60 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="px-4 py-3 text-sm text-gray-400 text-center">
                  No centres found
                </div>
              ) : (
                filtered.map((c) => {
                  const isSelected = selectedIds.includes(c.id);
                  const isDisabled = !isSelected && selectedIds.length >= 5;

                  return (
                    <button
                      key={c.id}
                      onClick={() => {
                        if (!isDisabled) onToggle(c.id);
                      }}
                      disabled={isDisabled}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors",
                        isSelected
                          ? "bg-[#004E64]/5 text-[#004E64]"
                          : "hover:bg-gray-50 text-gray-700",
                        isDisabled && "opacity-40 cursor-not-allowed"
                      )}
                    >
                      <div
                        className={cn(
                          "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0",
                          isSelected
                            ? "bg-[#004E64] border-[#004E64]"
                            : "border-gray-300"
                        )}
                      >
                        {isSelected && (
                          <svg
                            className="w-3 h-3 text-white"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={3}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{c.name}</p>
                        <p className="text-xs text-gray-400">
                          {c.code} {c.state ? `- ${c.state}` : ""}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "text-xs font-bold px-1.5 py-0.5 rounded",
                          c.score >= 80
                            ? "bg-emerald-100 text-emerald-700"
                            : c.score >= 60
                            ? "bg-amber-100 text-amber-700"
                            : "bg-red-100 text-red-700"
                        )}
                      >
                        {c.score}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer */}
            {selectedIds.length > 0 && (
              <div className="border-t border-gray-100 px-4 py-2 flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  {selectedIds.length} of 5 selected
                </span>
                <button
                  onClick={() => {
                    onClear();
                    setOpen(false);
                  }}
                  className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function CentreComparison() {
  const { data: allCentres } = usePerformance();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const toggleId = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const clearAll = () => setSelectedIds([]);

  // Fetch comparison data when 2+ centres selected
  const {
    data: compareData,
    isLoading: compareLoading,
    error: compareError,
  } = useQuery<CompareResponse>({
    queryKey: ["performance-compare", selectedIds],
    queryFn: async () => {
      const res = await fetch(
        `/api/performance/compare?serviceIds=${selectedIds.join(",")}`
      );
      if (!res.ok) throw new Error("Failed to fetch comparison data");
      return res.json();
    },
    enabled: selectedIds.length >= 2,
  });

  const centres = compareData?.centres || [];

  // Find the winner for each pillar row
  function getWinnerId(pillarKey: PillarKey): string | null {
    if (centres.length === 0) return null;
    let maxScore = -1;
    let winnerId: string | null = null;
    for (const c of centres) {
      const score = c.current[pillarKey];
      if (score > maxScore) {
        maxScore = score;
        winnerId = c.id;
      }
    }
    return winnerId;
  }

  return (
    <div className="space-y-6">
      {/* Selector */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <h3 className="text-base font-semibold text-gray-900 mb-1">
              Compare Centres
            </h3>
            <p className="text-sm text-gray-500">
              Select 2 to 5 centres to compare side-by-side across all pillars.
            </p>
          </div>
          <CentreSelector
            allCentres={allCentres || []}
            selectedIds={selectedIds}
            onToggle={toggleId}
            onClear={clearAll}
          />
        </div>
      </div>

      {/* Empty State */}
      {selectedIds.length < 2 && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Select at least 2 centres</p>
          <p className="text-sm text-gray-400 mt-1">
            Use the selector above to pick centres for comparison.
          </p>
        </div>
      )}

      {/* Loading */}
      {selectedIds.length >= 2 && compareLoading && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="w-8 h-8 border-2 border-[#004E64] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading comparison data...</p>
        </div>
      )}

      {/* Error */}
      {compareError && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-red-500 text-sm">
            Failed to load comparison data. Please try again.
          </p>
        </div>
      )}

      {/* Comparison Table */}
      {centres.length >= 2 && !compareLoading && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 md:px-6 py-4 border-b border-gray-200">
            <h3 className="text-base md:text-lg font-semibold text-gray-900">
              Side-by-Side Comparison
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-40">
                    Pillar
                  </th>
                  {centres.map((c) => (
                    <th
                      key={c.id}
                      className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider min-w-[120px]"
                    >
                      <div>
                        <p className="truncate">{c.name}</p>
                        <p className="text-[10px] text-gray-400 font-normal normal-case mt-0.5">
                          {c.code} {c.state ? `- ${c.state}` : ""}
                        </p>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {PILLARS.map((pillar) => {
                  const winnerId = getWinnerId(pillar.key);
                  return (
                    <tr
                      key={pillar.key}
                      className={cn(
                        "hover:bg-gray-50/50 transition-colors",
                        pillar.key === "overall" && "bg-gray-50/50"
                      )}
                    >
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "text-sm text-gray-700",
                            pillar.key === "overall" && "font-semibold text-gray-900"
                          )}
                        >
                          {pillar.label}
                        </span>
                      </td>
                      {centres.map((c) => {
                        const score = c.current[pillar.key];
                        const prevScore = c.previous
                          ? c.previous[pillar.key]
                          : null;
                        const isWinner = c.id === winnerId;

                        return (
                          <td key={c.id} className="px-3 py-3 text-center">
                            <div
                              className={cn(
                                "inline-flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg",
                                isWinner && "ring-2 ring-[#004E64]/30",
                                getScoreBg(score)
                              )}
                            >
                              <span
                                className={cn(
                                  "text-lg font-bold",
                                  getScoreColor(score),
                                  isWinner && "underline decoration-2 underline-offset-2"
                                )}
                              >
                                {score}
                              </span>
                              <DeltaBadge current={score} previous={prevScore} />
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="px-4 md:px-6 py-3 border-t border-gray-100 flex flex-wrap items-center gap-4 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded ring-2 ring-[#004E64]/30 bg-white" />
              Highest in row
            </span>
            <span className="flex items-center gap-1">
              <ArrowUp className="w-3 h-3 text-emerald-500" />
              Improved from previous period
            </span>
            <span className="flex items-center gap-1">
              <ArrowDown className="w-3 h-3 text-red-500" />
              Declined from previous period
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
