"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { useWhatsAppGrid, useAddToOneOnOne } from "@/hooks/useWhatsAppCompliance";
import { QuickEntryPanel } from "./QuickEntryPanel";
import { WeekGrid } from "./WeekGrid";
import { NetworkGroupPanel } from "./NetworkGroupPanel";
import { TwoWeekConcernsPanel } from "./TwoWeekConcernsPanel";
import { CoordinatorHistorySidePanel } from "./CoordinatorHistorySidePanel";
import { toast } from "@/hooks/useToast";

export default function WhatsAppComplianceContent() {
  const { data: grid, isLoading, isError, error, refetch } = useWhatsAppGrid();
  const [historyServiceId, setHistoryServiceId] = useState<string | null>(null);
  const addToOneOnOne = useAddToOneOnOne();

  const flaggedSet = useMemo(
    () => new Set(grid?.patterns.twoWeekConcerns.map((c) => c.serviceId) ?? []),
    [grid?.patterns.twoWeekConcerns],
  );

  const showCoverageBanner = grid && grid.summary.cellsChecked > 0 && grid.summary.coverage < 80;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="WhatsApp Compliance"
        description={
          grid
            ? `Week ${grid.week.weekNumber} · ${grid.week.start} → ${grid.week.end} · daily check-in takes ~5 min`
            : "Daily check-in takes ~5 min"
        }
      />

      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {isError && (
        <ErrorState
          title="Couldn't load compliance data"
          error={error ?? undefined}
          onRetry={() => refetch()}
        />
      )}

      {grid && (
        <>
          {showCoverageBanner && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Your check-in coverage is {grid.summary.coverage}% this week — daily checks are more useful when consistent.
            </div>
          )}

          <QuickEntryPanel grid={grid} />

          <WeekGrid
            grid={grid}
            flaggedServiceIds={flaggedSet}
            onOpenHistory={setHistoryServiceId}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <NetworkGroupPanel
              group="engagement"
              title="Engagement Group"
              count={grid.networkPosts.engagement.count}
              target={grid.networkPosts.engagement.target}
              floor={grid.networkPosts.engagement.floor}
              posts={grid.networkPosts.engagement.posts}
            />
            <NetworkGroupPanel
              group="announcements"
              title="Announcements Group"
              count={grid.networkPosts.announcements.count}
              target={grid.networkPosts.announcements.target}
              floor={grid.networkPosts.announcements.floor}
              posts={grid.networkPosts.announcements.posts}
            />
          </div>

          <TwoWeekConcernsPanel
            concerns={grid.patterns.twoWeekConcerns}
            onViewHistory={setHistoryServiceId}
            onAddToOneOnOne={async (concern) => {
              try {
                await addToOneOnOne.mutateAsync({
                  serviceId: concern.serviceId,
                  coordinatorName: concern.coordinatorName,
                });
                toast({ description: "Added to next Monday's 1:1 agenda." });
              } catch {
                // hook toast
              }
            }}
          />
        </>
      )}

      <CoordinatorHistorySidePanel
        serviceId={historyServiceId}
        onClose={() => setHistoryServiceId(null)}
      />
    </div>
  );
}
