"use client";

import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import type { MeasurableData } from "@/hooks/useScorecard";
import {
  useScorecardsList,
  useScorecardDetail,
} from "@/hooks/useScorecards";
import { canManageScorecard } from "@/lib/scorecard-permissions";
import { ScorecardGrid } from "@/components/scorecard/ScorecardGrid";
import { ScorecardRollupView } from "@/components/scorecard/ScorecardRollupView";
import { ScorecardSelector } from "@/components/scorecard/ScorecardSelector";
import { CreateScorecardDialog } from "@/components/scorecard/CreateScorecardDialog";
import { ManageMembersDialog } from "@/components/scorecard/ManageMembersDialog";
import { AddMeasurableModal } from "@/components/scorecard/AddMeasurableModal";
import { DeleteMeasurableDialog } from "@/components/scorecard/DeleteMeasurableDialog";
import { exportToCSV } from "@/lib/csv-export";
import { isAdminRole } from "@/lib/role-permissions";
import { BarChart3, Plus, Users, Building2, X, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { AiButton } from "@/components/ui/AiButton";
import { PageHeader } from "@/components/layout/PageHeader";
import { toast } from "@/hooks/useToast";
import { useStaffV2Flag } from "@/lib/useStaffV2Flag";

export default function ScorecardPage() {
  const v2 = useStaffV2Flag();
  const { data: session } = useSession();
  const viewerRole = session?.user?.role as string | undefined;
  const viewerId = session?.user?.id;
  const isAdmin = isAdminRole(viewerRole);

  // Bucket O Stage 3: multi-scorecard list + selection. The user's
  // explicit selection lives in state; we derive the effective id by
  // falling back to the first accessible scorecard. URL persistence
  // is a future polish.
  const scorecardsList = useScorecardsList();
  const accessibleScorecards = useMemo(
    () => scorecardsList.data?.scorecards ?? [],
    [scorecardsList.data],
  );
  const [explicitScorecardId, setExplicitScorecardId] = useState<string | null>(
    null,
  );
  const selectedScorecardId =
    explicitScorecardId &&
    accessibleScorecards.some((s) => s.id === explicitScorecardId)
      ? explicitScorecardId
      : accessibleScorecards[0]?.id ?? null;

  const selectedSummary = accessibleScorecards.find(
    (s) => s.id === selectedScorecardId,
  );
  const {
    data: scorecard,
    isLoading,
    error,
    refetch,
  } = useScorecardDetail(selectedScorecardId);

  const [showAddMeasurable, setShowAddMeasurable] = useState(false);
  const [editingMeasurable, setEditingMeasurable] = useState<MeasurableData | null>(null);
  const [deletingMeasurable, setDeletingMeasurable] = useState<MeasurableData | null>(null);
  const [showCreateScorecard, setShowCreateScorecard] = useState(false);
  const [showManageMembers, setShowManageMembers] = useState(false);
  const [groupBy, setGroupBy] = useState<"person" | "service">("person");
  const [aiNarrative, setAiNarrative] = useState("");
  // 2026-06-02: removed "leadership" tab — it was a server-side
  // filter on `serviceId === null` which doubled up with the
  // existing All Measurables view. Multi-scorecard members + the
  // Org Rollup cover the same use cases without a second tab.
  const [tab, setTab] = useState<"all" | "rollup">("all");
  const queryClient = useQueryClient();

  const canManageSelected =
    !!selectedSummary &&
    !!viewerId &&
    canManageScorecard(
      { id: viewerId, role: viewerRole ?? null },
      { ownerId: selectedSummary.ownerId },
    );

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
      queryClient.invalidateQueries({ queryKey: ["scorecard-detail"] });
      setDeletingMeasurable(null);
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });

  const handleExport = () => {
    if (tab === "rollup") return;
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

  // The previous "leadership team" filter (serviceId === null) was
  // retired alongside the tab — every measurable in the scorecard is
  // shown on the All Measurables view. Keeping `filteredScorecard` as
  // an identity wrapper for now so the JSX below doesn't need to know
  // about the change.
  const filteredScorecard = scorecard;

  return (
    <div
      {...(v2 ? { "data-v2": "staff" } : {})}
      className="max-w-full mx-auto"
    >
      {/* Selector row — multi-scorecard list, create + manage members.
          Sits above the page header so it's the first thing a viewer
          interacts with when there's more than one scorecard. */}
      {accessibleScorecards.length > 0 ? (
        <div className="mb-4">
          <ScorecardSelector
            scorecards={accessibleScorecards}
            selectedId={selectedScorecardId}
            onSelect={setExplicitScorecardId}
            onCreate={isAdmin ? () => setShowCreateScorecard(true) : undefined}
            onManageMembers={
              canManageSelected ? () => setShowManageMembers(true) : undefined
            }
            canCreate={isAdmin}
            canManageSelected={canManageSelected}
          />
        </div>
      ) : null}

      {/* Banner shown to the owner when the selected scorecard has
          zero members — per the design doc, the orphan scorecard
          left over from the migration gets this prompt. */}
      {selectedSummary &&
      selectedSummary._count.members === 0 &&
      canManageSelected ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 flex items-start gap-2">
          <Users className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-medium">No members yet</p>
            <p className="text-amber-800">
              Invite people into <span className="font-medium">{selectedSummary.title}</span> so they can see it and be assigned as measurable owners.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowManageMembers(true)}
            className="rounded-md border border-amber-300 bg-card px-2.5 py-1 text-xs text-amber-900 hover:bg-amber-100"
          >
            Invite members
          </button>
        </div>
      ) : null}

      {/* Header */}
      <PageHeader
        title={selectedSummary?.title ?? "Scorecard"}
        description="Track your weekly measurables — trailing 13 weeks"
        helpTooltipId="scorecard-heading"
        helpTooltipContent="Track your centre's key measurables weekly. Green = on track, red = off track. Update numbers each week before your L10 meeting."
        primaryAction={{ label: "Add Measurable", icon: Plus, onClick: () => setShowAddMeasurable(true) }}
        toggles={[{
          options: [
            { icon: Users, label: "Group by person", value: "person" },
            { icon: Building2, label: "Group by centre", value: "service" },
          ],
          value: groupBy,
          onChange: (v) => setGroupBy(v as "person" | "service"),
        }]}
        secondaryActions={[
          {
            label: "Export PDF",
            icon: Download,
            hidden: !selectedScorecardId || !scorecard?.measurables?.length,
            onClick: async () => {
              if (!selectedScorecardId) return;
              try {
                const res = await fetch(`/api/scorecard/${selectedScorecardId}/pdf`);
                if (!res.ok) {
                  const msg = await res.text().catch(() => "");
                  throw new Error(msg || `Download failed (${res.status})`);
                }
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                const safe = (scorecard?.title ?? "scorecard").replace(/[^a-z0-9-_]+/gi, "-").toLowerCase();
                a.download = `amana-scorecard-${safe}-${new Date().toISOString().slice(0, 10)}.pdf`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
              } catch (err) {
                toast({
                  variant: "destructive",
                  description: err instanceof Error ? err.message : "Couldn't generate PDF",
                });
              }
            },
          },
          {
            label: "Export CSV",
            icon: Download,
            onClick: handleExport,
          },
        ]}
      >
        {/* AI Narrative — unique to Scorecard */}
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
      </PageHeader>

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

      {/* Sub-tabs.
          2026-06-02: dropped "Leadership Team" — it was a no-op
          filter on serviceId === null that confused users. For
          non-admins this section now renders nothing (only one
          option would have shown). Admin still sees the Org Rollup
          toggle. */}
      {isAdmin && (
        <div className="flex items-center gap-1 bg-surface rounded-lg p-0.5 mb-4">
          <button
            onClick={() => setTab("all")}
            className={cn(
              "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
              tab === "all" ? "bg-card text-brand shadow-sm" : "text-muted hover:text-foreground"
            )}
          >
            All Measurables
          </button>
          <button
            onClick={() => setTab("rollup")}
            className={cn(
              "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
              tab === "rollup" ? "bg-card text-brand shadow-sm" : "text-muted hover:text-foreground"
            )}
          >
            Org Rollup
          </button>
        </div>
      )}

      {/* Content */}
      {tab === "rollup" ? (
        <ScorecardRollupView enabled={tab === "rollup"} />
      ) : isLoading ? (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="flex items-center gap-4 px-4 py-3 border-b border-border/50 bg-surface/50">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-16" />
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-12" />
            ))}
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-border/50">
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
      ) : filteredScorecard && filteredScorecard.measurables.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="No Measurables Yet"
          description="Your Scorecard tracks weekly KPIs that tell you if the business is on track. Add your first measurable to start monitoring what matters."
          action={{ label: "Add Your First Measurable", onClick: () => setShowAddMeasurable(true) }}
        />
      ) : filteredScorecard ? (
        <ScorecardGrid
          scorecard={filteredScorecard}
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
        scorecardId={selectedScorecardId ?? undefined}
        scorecardOwner={selectedSummary?.owner}
      />

      <CreateScorecardDialog
        open={showCreateScorecard}
        onClose={() => setShowCreateScorecard(false)}
        onCreated={(id) => setExplicitScorecardId(id)}
      />

      {selectedSummary ? (
        <ManageMembersDialog
          open={showManageMembers}
          onClose={() => setShowManageMembers(false)}
          scorecardId={selectedSummary.id}
          scorecardTitle={selectedSummary.title}
          ownerId={selectedSummary.ownerId}
        />
      ) : null}

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
