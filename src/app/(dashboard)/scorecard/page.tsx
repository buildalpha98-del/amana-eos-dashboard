"use client";

import { useState } from "react";
import { useScorecard } from "@/hooks/useScorecard";
import { ScorecardGrid } from "@/components/scorecard/ScorecardGrid";
import { AddMeasurableModal } from "@/components/scorecard/AddMeasurableModal";
import { ExportButton } from "@/components/ui/ExportButton";
import { exportToCSV } from "@/lib/csv-export";
import { BarChart3, Plus, Users, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ScorecardPage() {
  const { data: scorecard, isLoading, error } = useScorecard();
  const [showAddMeasurable, setShowAddMeasurable] = useState(false);
  const [groupBy, setGroupBy] = useState<"person" | "service">("person");

  const handleExport = () => {
    if (!scorecard?.measurables || scorecard.measurables.length === 0) return;

    // Collect all unique weeks across all measurables, sorted
    const allWeeks = Array.from(
      new Set(
        scorecard.measurables.flatMap((m) =>
          m.entries.map((e) => e.weekOf)
        )
      )
    ).sort();

    // Build dynamic columns: Owner, Title, Goal, Unit, then one column per week
    const columns = [
      { key: "owner", header: "Owner" },
      { key: "title", header: "Title" },
      { key: "goal", header: "Goal" },
      { key: "unit", header: "Unit" },
      ...allWeeks.map((week) => ({
        key: `week_${week}`,
        header: new Date(week).toLocaleDateString("en-AU", {
          day: "2-digit",
          month: "2-digit",
        }),
      })),
    ];

    const rows = scorecard.measurables.map((m) => {
      const row: Record<string, unknown> = {
        owner: m.owner.name,
        title: m.title,
        goal: `${m.goalDirection === "above" ? ">=" : m.goalDirection === "below" ? "<=" : "="} ${m.goalValue}`,
        unit: m.unit || "",
      };
      // Map entries by weekOf for quick lookup
      const entryMap = new Map(m.entries.map((e) => [e.weekOf, e.value]));
      allWeeks.forEach((week) => {
        row[`week_${week}`] = entryMap.get(week) ?? "";
      });
      return row;
    });

    exportToCSV(rows, "scorecard-export", columns);
  };

  return (
    <div className="max-w-full mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Scorecard</h2>
          <p className="text-sm text-gray-500">
            Track your weekly measurables — trailing 13 weeks
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Group By Toggle */}
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setGroupBy("person")}
              className={cn(
                "inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors",
                groupBy === "person"
                  ? "bg-white text-[#004E64] shadow-sm"
                  : "text-gray-400 hover:text-gray-600"
              )}
              title="Group by person"
            >
              <Users className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Person</span>
            </button>
            <button
              onClick={() => setGroupBy("service")}
              className={cn(
                "inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors",
                groupBy === "service"
                  ? "bg-white text-[#004E64] shadow-sm"
                  : "text-gray-400 hover:text-gray-600"
              )}
              title="Group by centre"
            >
              <Building2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Centre</span>
            </button>
          </div>

          <ExportButton
            onClick={handleExport}
            disabled={!scorecard?.measurables || scorecard.measurables.length === 0}
          />
          <button
            onClick={() => setShowAddMeasurable(true)}
            className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-[#004E64] text-white text-sm font-medium rounded-lg hover:bg-[#003D52] transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add Measurable</span>
            <span className="sm:hidden">Add</span>
          </button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <div className="animate-spin w-8 h-8 border-2 border-[#004E64] border-t-transparent rounded-full" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-xl border border-gray-200">
          <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
            <BarChart3 className="w-8 h-8 text-red-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">
            Scorecard not available
          </h3>
          <p className="text-gray-500 mt-2 max-w-md">
            No scorecard has been configured yet. Add a measurable to create
            your scorecard automatically.
          </p>
          <button
            onClick={() => setShowAddMeasurable(true)}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-[#004E64] text-white text-sm font-medium rounded-lg hover:bg-[#003D52] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add First Measurable
          </button>
        </div>
      ) : scorecard ? (
        <ScorecardGrid scorecard={scorecard} groupBy={groupBy} />
      ) : null}

      <AddMeasurableModal
        open={showAddMeasurable}
        onClose={() => setShowAddMeasurable(false)}
      />
    </div>
  );
}
