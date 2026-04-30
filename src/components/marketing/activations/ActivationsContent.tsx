"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { useActivations, type ActivationRow, type ActivationView } from "@/hooks/useActivations";
import { ActivationsListTable } from "./ActivationsListTable";
import { TermGrid } from "./TermGrid";
import { ActivationDetailPanel } from "./ActivationDetailPanel";
import { NewActivationModal } from "./NewActivationModal";
import { Plus, AlertCircle, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

const TABS = [
  { key: "in_flight", label: "In Flight" },
  { key: "term_grid", label: "Term Grid" },
  { key: "archive", label: "Archive" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function viewForTab(tab: TabKey): ActivationView | undefined {
  if (tab === "in_flight") return "in_flight";
  if (tab === "archive") return "archive";
  return undefined;
}

export default function ActivationsContent() {
  const [tab, setTab] = useState<TabKey>("in_flight");
  const [selected, setSelected] = useState<ActivationRow | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newDefaults, setNewDefaults] = useState<{ serviceId?: string }>({});

  const { data, isLoading, isError, error, refetch } = useActivations({ view: viewForTab(tab) });
  // Always fetch full list (regardless of tab) to power the detail-panel lookup
  // when navigating via the term grid.
  const { data: allData } = useActivations({});
  const allMap = useMemo(() => {
    const m = new Map<string, ActivationRow>();
    for (const a of allData?.activations ?? []) m.set(a.id, a);
    for (const a of data?.activations ?? []) m.set(a.id, a);
    return m;
  }, [allData?.activations, data?.activations]);

  const hasUnassigned = data && data.unassignedCampaigns.length > 0;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Activations"
        description="Concept → recap. Per-centre tracking, per-term progress."
        primaryAction={{ label: "New activation", icon: Plus, onClick: () => { setNewDefaults({}); setNewOpen(true); } }}
      />

      <div className="border-b border-border">
        <nav className="flex gap-0 -mb-px">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "px-4 py-3 text-sm font-medium border-b-2 transition-colors",
                tab === t.key
                  ? "border-brand text-brand"
                  : "border-transparent text-muted hover:text-foreground hover:border-border",
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {tab !== "term_grid" && (
        <>
          {isLoading && <Skeleton className="h-32 w-full" />}
          {isError && (
            <ErrorState title="Couldn't load activations" error={error ?? undefined} onRetry={() => refetch()} />
          )}

          {tab === "in_flight" && hasUnassigned && data && (
            <UnassignedBanner unassigned={data.unassignedCampaigns} />
          )}

          {data && <ActivationsListTable activations={data.activations} onSelect={setSelected} />}
        </>
      )}

      {tab === "term_grid" && (
        <TermGrid
          onAddActivation={(serviceId) => { setNewDefaults({ serviceId }); setNewOpen(true); }}
          onSelectActivation={(activationId) => {
            const found = allMap.get(activationId);
            if (found) setSelected(found);
          }}
        />
      )}

      <ActivationDetailPanel activation={selected} onClose={() => setSelected(null)} />
      <NewActivationModal open={newOpen} onClose={() => setNewOpen(false)} initialServiceId={newDefaults.serviceId} />
    </div>
  );
}

function UnassignedBanner({ unassigned }: { unassigned: NonNullable<ReturnType<typeof useActivations>["data"]>["unassignedCampaigns"] }) {
  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <header className="flex items-start gap-2 mb-3">
        <AlertCircle className="w-5 h-5 text-amber-700 mt-0.5 shrink-0" />
        <div>
          <h3 className="text-sm font-semibold text-amber-900">
            {unassigned.length} campaign{unassigned.length === 1 ? "" : "s"} awaiting centre assignment
          </h3>
          <p className="text-xs text-amber-800 mt-0.5">
            These campaigns won&apos;t appear as activations until you assign them to one or more centres.
            Open the campaign in the Marketing tab → scroll to <strong>Activation Assignments</strong> → tick centres → save.
          </p>
        </div>
      </header>
      <ul className="space-y-2">
        {unassigned.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-card p-2.5">
            <div className="min-w-0">
              <div className="font-medium text-foreground truncate">{c.name}</div>
              <div className="text-xs text-muted capitalize">{c.type} · {c.status}</div>
            </div>
            <Link
              href={`/marketing?campaignId=${c.id}`}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-border bg-card text-xs font-medium text-brand hover:bg-surface shrink-0"
            >
              Assign centres
              <ExternalLink className="w-3 h-3" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
