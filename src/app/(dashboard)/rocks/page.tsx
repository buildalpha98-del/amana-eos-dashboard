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

export default function RocksPage() {
  const [quarter, setQuarter] = useState(getCurrentQuarter());
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [selectedRockId, setSelectedRockId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { data: rocks, isLoading } = useRocks(quarter);

  const handleRockClick = (rock: RockData) => {
    setSelectedRockId(rock.id);
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Rocks</h2>
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
                  ? "bg-white text-[#1B4D3E] shadow-sm"
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
                  ? "bg-white text-[#1B4D3E] shadow-sm"
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
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#1B4D3E] text-white text-sm font-medium rounded-lg hover:bg-[#164032] transition-colors shadow-sm"
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

      {/* Summary Bar */}
      {rocks && rocks.length > 0 && (
        <div className="flex items-center gap-4 mb-4 px-1">
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
          <span className="text-sm text-[#1B4D3E]">
            {rocks.filter((r) => r.status === "complete").length} complete
          </span>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <div className="animate-spin w-8 h-8 border-2 border-[#1B4D3E] border-t-transparent rounded-full" />
        </div>
      ) : rocks && rocks.length > 0 ? (
        view === "kanban" ? (
          <RockKanban rocks={rocks} onRockClick={handleRockClick} />
        ) : (
          <RockListView rocks={rocks} onRockClick={handleRockClick} />
        )
      ) : (
        /* Empty State */
        <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-xl border border-gray-200">
          <div className="w-16 h-16 rounded-2xl bg-[#1B4D3E]/5 flex items-center justify-center mb-4">
            <Mountain className="w-8 h-8 text-[#1B4D3E]/30" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">
            No Rocks for {quarter.replace("-", " ")}
          </h3>
          <p className="text-gray-500 mt-2 max-w-md">
            Rocks are your most important 90-day priorities. Set 3-7 Rocks per
            quarter to keep the team focused on what matters most.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-6 inline-flex items-center gap-1.5 px-5 py-2.5 bg-[#1B4D3E] text-white text-sm font-medium rounded-lg hover:bg-[#164032] transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Create Your First Rock
          </button>
        </div>
      )}

      {/* Detail Panel */}
      {selectedRockId && (
        <RockDetailPanel
          rockId={selectedRockId}
          onClose={() => setSelectedRockId(null)}
        />
      )}

      {/* Create Modal */}
      <CreateRockModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        quarter={quarter}
      />
    </div>
  );
}
