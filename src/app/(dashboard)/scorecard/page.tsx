"use client";

import { useState } from "react";
import { useScorecard } from "@/hooks/useScorecard";
import { ScorecardGrid } from "@/components/scorecard/ScorecardGrid";
import { AddMeasurableModal } from "@/components/scorecard/AddMeasurableModal";
import { ExportButton } from "@/components/ui/ExportButton";
import { exportToCSV } from "@/lib/csv-export";
import { BarChart3, Plus } from "lucide-react";

export default function ScorecardPage() {
  const { data: scorecard, isLoading, error } = useScorecard();
  const [showAddMeasurable, setShowAddMeasurable] = useState(false);

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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Scorecard</h2>
          <p className="text-sm text-gray-500">
            Track your weekly measurables — trailing 13 weeks
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ExportButton
            onClick={handleExport}
            disabled={!scorecard?.measurables || scorecard.measurables.length === 0}
          />
          <button
            onClick={() => setShowAddMeasurable(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#004E64] text-white text-sm font-medium rounded-lg hover:bg-[#003D52] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Measurable
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
        <ScorecardGrid scorecard={scorecard} />
      ) : null}

      <AddMeasurableModal
        open={showAddMeasurable}
        onClose={() => setShowAddMeasurable(false)}
      />
    </div>
  );
}
