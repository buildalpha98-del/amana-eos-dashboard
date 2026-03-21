"use client";

import { useState } from "react";
import { useRocks, type RockData } from "@/hooks/useRocks";
import { getCurrentQuarter } from "@/lib/utils";
import { QuarterSelector } from "@/components/rocks/QuarterSelector";
import { RockKanban } from "@/components/rocks/RockKanban";
import { RockListView } from "@/components/rocks/RockListView";
import { RockDetailPanel } from "@/components/rocks/RockDetailPanel";
import { CreateRockModal } from "@/components/rocks/CreateRockModal";
import { Mountain, Plus, LayoutGrid, List } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { HelpTooltip } from "@/components/ui/HelpTooltip";

export default function RocksPage() {
  const [quarter, setQuarter] = useState(getCurrentQuarter());
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [selectedRockId, setSelectedRockId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { data: rocks, isLoading, error, refetch } = useRocks(quarter);

  const handleRockClick = (rock: RockData) => {
    setSelectedRockId(rock.id);
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            Rocks <HelpTooltip id="rocks-heading" content="Rocks are your 90-day priorities. Each quarter, set 3-7 rocks that move the business forward. Mark them On Track or Off Track weekly." />
          </h2>
          <p className="text-sm text-gray-500">
            Track your quarterly 90-day goals
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* View Toggle */}
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setView("kanban")}
              className={cn(
                "p-1.5 rounded-md transition-colors",
                view === "kanban"
                  ? "bg-white text-brand shadow-sm"
                  : "text-gray-400 hover:text-gray-600"
              )}
              title="Kanban view"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView("list")}
              className={cn(
                "p-1.5 rounded-md transition-colors",
                view === "list"
                  ? "bg-white text-brand shadow-sm"
                  : "text-gray-400 hover:text-gray-600"
              )}
              title="List view"
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          {/* Add Rock */}
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-hover transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Add Rock
          </button>
        </div>
      </div>

      {/* Quarter Selector */}
      <div className="mb-6 overflow-x-auto">
        <QuarterSelector value={quarter} onChange={setQuarter} />
      </div>

      {/* Error State */}
      {error && (
        <ErrorState
          title="Failed to load rocks"
          error={error as Error}
          onRetry={refetch}
        />
      )}

      {/* Summary Bar */}
      {!error && rocks && rocks.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 mb-4 px-1">
          <span className="text-sm text-gray-500">
            <span className="font-semibold text-gray-900">{rocks.length}</span>{" "}
            Rocks
          </span>
          <span className="text-gray-300">|</span>
          <span className="text-sm text-emerald-600">
            {rocks.filter((r) => r.status === "on_track").length} on track
          </span>
          <span className="text-sm text-red-600">
            {rocks.filter((r) => r.status === "off_track").length} off track
          </span>
          <span className="text-sm text-brand">
            {rocks.filter((r) => r.status === "complete").length} complete
          </span>
        </div>
      )}

      {/* Content */}
      {error ? null : isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-2 w-full" />
              <div className="flex gap-2">
                <Skeleton className="h-6 w-6 rounded-full" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          ))}
        </div>
      ) : rocks && rocks.length > 0 ? (
        view === "kanban" ? (
          <RockKanban rocks={rocks} onRockClick={handleRockClick} />
        ) : (
          <RockListView rocks={rocks} onRockClick={handleRockClick} />
        )
      ) : (
        <EmptyState
          icon={Mountain}
          title={`No Rocks for ${quarter.replace("-", " ")}`}
          description="Rocks are your most important 90-day priorities. Set 3-7 Rocks per quarter to keep the team focused on what matters most."
          action={{ label: "Create Your First Rock", onClick: () => setShowCreate(true) }}
        />
      )}

      {/* Detail Panel */}
      <RockDetailPanel
        open={!!selectedRockId}
        rockId={selectedRockId ?? ""}
        onClose={() => setSelectedRockId(null)}
      />

      {/* Create Modal */}
      <CreateRockModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        quarter={quarter}
      />
    </div>
  );
}
