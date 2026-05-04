"use client";

import { useState } from "react";
import { useRocks, type RockData } from "@/hooks/useRocks";
import { getCurrentQuarter } from "@/lib/utils";
import { QuarterSelector } from "@/components/rocks/QuarterSelector";
import { RockKanban } from "@/components/rocks/RockKanban";
import { RockListView } from "@/components/rocks/RockListView";
import { RockDetailPanel } from "@/components/rocks/RockDetailPanel";
import { CreateRockModal } from "@/components/rocks/CreateRockModal";
import { Mountain, Plus, LayoutGrid, List, Download } from "lucide-react";
import { exportToCsv } from "@/lib/csv-export";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { PageHeader } from "@/components/layout/PageHeader";

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
    <div
      data-v2="staff"
      className="max-w-7xl mx-auto"
    >
      {/* Header */}
      <PageHeader
        title="Rocks"
        description="Track your quarterly 90-day goals"
        helpTooltipId="rocks-heading"
        helpTooltipContent="Rocks are your 90-day priorities. Each quarter, set 3-7 rocks that move the business forward. Mark them On Track or Off Track weekly."
        primaryAction={{ label: "Add Rock", icon: Plus, onClick: () => setShowCreate(true) }}
        toggles={[{
          options: [
            { icon: LayoutGrid, label: "Kanban view", value: "kanban" },
            { icon: List, label: "List view", value: "list" },
          ],
          value: view,
          onChange: (v) => setView(v as "kanban" | "list"),
        }]}
        secondaryActions={[
          {
            label: "Export CSV",
            icon: Download,
            onClick: () =>
              exportToCsv(
                `amana-rocks-${new Date().toISOString().slice(0, 10)}`,
                rocks || [],
                [
                  { header: "ID", accessor: (r) => r.id },
                  { header: "Title", accessor: (r) => r.title },
                  { header: "Owner", accessor: (r) => r.owner?.name ?? "Unassigned" },
                  { header: "Quarter", accessor: (r) => r.quarter },
                  { header: "Status", accessor: (r) => r.status },
                  { header: "Progress", accessor: (r) => `${r.percentComplete}%` },
                  { header: "Priority", accessor: (r) => r.priority },
                  { header: "Type", accessor: (r) => r.rockType },
                  { header: "Todos", accessor: (r) => r._count?.todos ?? 0 },
                  { header: "Issues", accessor: (r) => r._count?.issues ?? 0 },
                ],
              ),
          },
        ]}
      />

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
          <span className="text-sm text-muted">
            <span className="font-semibold text-foreground">{rocks.length}</span>{" "}
            Rocks
          </span>
          <span className="text-border">|</span>
          <span className="text-sm text-success">
            {rocks.filter((r) => r.status === "on_track").length} on track
          </span>
          <span className="text-sm text-danger">
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
            <div key={i} className="bg-card rounded-xl border border-border p-4 space-y-3">
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
