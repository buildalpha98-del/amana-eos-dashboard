"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useScorecard } from "@/hooks/useScorecard";
import type { MeasurableData } from "@/hooks/useScorecard";
import { ScorecardGrid } from "@/components/scorecard/ScorecardGrid";
import { AddMeasurableModal } from "@/components/scorecard/AddMeasurableModal";
import { DeleteMeasurableDialog } from "@/components/scorecard/DeleteMeasurableDialog";
import { ExportButton } from "@/components/ui/ExportButton";
import { exportToCSV } from "@/lib/csv-export";
import { BarChart3, Plus, Users, Building2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { HelpTooltip } from "@/components/shared/HelpTooltip";
import { AiButton } from "@/components/ui/AiButton";

export default function ScorecardPage() {
  const { data: scorecard, isLoading, error, refetch } = useScorecard();
  const [showAddMeasurable, setShowAddMeasurable] = useState(false);
  const [editingMeasurable, setEditingMeasurable] = useState<MeasurableData | null>(null);
  const [deletingMeasurable, setDeletingMeasurable] = useState<MeasurableData | null>(null);
  const [groupBy, setGroupBy] = useState<"person" | "service">("person");
  const [aiNarrative, setAiNarrative] = useState("");
  const queryClient = useQueryClient();

  const deleteMeasurable = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/measurables/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete measurable");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scorecard"] });
      setDeletingMeasurable(null);
    },
  });

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
        owner: m.owner?.name ?? "Unassigned",
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
          <h2 className="text-xl font-semibold text-gray-900">
            Scorecard <HelpTooltip term="scorecard" />
          </h2>
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
                  ? "bg-white text-brand shadow-sm"
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
                  ? "bg-white text-brand shadow-sm"
                  : "text-gray-400 hover:text-gray-600"
              )}
              title="Group by centre"
            >
              <Building2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Centre</span>
            </button>
          </div>

          <AiButton
            templateSlug="scorecard/narrative"
            variables={{
              measurableCount: String(scorecard?.measurables?.length ?? 0),
              onTrackSummary: scorecard?.measurables
                ? (() => {
                    const total = scorecard.measurables.length;
                    const onTrack = scorecard.measurables.filter((m) => {
                      const last = m.entries[m.entries.length - 1];
                      return last?.onTrack;
                    }).length;
                    return `${onTrack}/${total} on track`;
                  })()
                : "no data",
              measurables: scorecard?.measurables
                ?.slice(0, 10)
                .map((m) => `${m.title} (${m.owner?.name ?? "unassigned"}): goal ${m.goalDirection} ${m.goalValue}, last=${m.entries[m.entries.length - 1]?.value ?? "N/A"}`)
                .join("; ") || "none",
            }}
            onResult={(text) => setAiNarrative(text)}
            label="AI Narrative"
            size="sm"
            section="scorecard"
            disabled={!scorecard?.measurables?.length}
          />
          <ExportButton
            onClick={handleExport}
            disabled={!scorecard?.measurables || scorecard.measurables.length === 0}
          />
          <button
            onClick={() => setShowAddMeasurable(true)}
            className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-hover transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add Measurable</span>
            <span className="sm:hidden">Add</span>
          </button>
        </div>
      </div>

      {/* AI Narrative */}
      {aiNarrative && (
        <div className="mb-6 rounded-xl border border-purple-200 bg-purple-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 text-sm text-purple-900 whitespace-pre-wrap">{aiNarrative}</div>
            <button onClick={() => setAiNarrative("")} className="text-purple-400 hover:text-purple-600 flex-shrink-0">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center gap-4 px-4 py-3 border-b border-gray-100 bg-gray-50">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-16" />
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-12" />
            ))}
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-gray-50">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-16" />
              {Array.from({ length: 6 }).map((_, j) => (
                <Skeleton key={j} className="h-4 w-12" />
              ))}
            </div>
          ))}
        </div>
      ) : error ? (
        <ErrorState
          title="Failed to load scorecard"
          error={error as Error}
          onRetry={refetch}
        />
      ) : scorecard && scorecard.measurables.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="No Measurables Yet"
          description="Your Scorecard tracks weekly KPIs that tell you if the business is on track. Add your first measurable to start monitoring what matters."
          action={{ label: "Add Your First Measurable", onClick: () => setShowAddMeasurable(true) }}
        />
      ) : scorecard ? (
        <ScorecardGrid
          scorecard={scorecard}
          groupBy={groupBy}
          onEdit={(m) => {
            setEditingMeasurable(m);
            setShowAddMeasurable(true);
          }}
          onDelete={(m) => setDeletingMeasurable(m)}
        />
      ) : null}

      <AddMeasurableModal
        open={showAddMeasurable}
        onClose={() => {
          setShowAddMeasurable(false);
          setEditingMeasurable(null);
        }}
        editingMeasurable={editingMeasurable}
      />

      <DeleteMeasurableDialog
        measurable={deletingMeasurable}
        onClose={() => setDeletingMeasurable(null)}
        onConfirm={() => {
          if (deletingMeasurable) {
            deleteMeasurable.mutate(deletingMeasurable.id);
          }
        }}
        isDeleting={deleteMeasurable.isPending}
      />
    </div>
  );
}
