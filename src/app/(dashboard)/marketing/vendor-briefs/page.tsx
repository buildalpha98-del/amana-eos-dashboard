"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  useSeedTermReadiness,
  useVendorBriefs,
} from "@/hooks/useVendorBriefs";
import { BriefTable } from "@/components/marketing/vendor-briefs/brief-table";
import { BriefDetailPanel } from "@/components/marketing/vendor-briefs/brief-detail-panel";
import {
  NewBriefModal,
  type NewBriefPrefill,
} from "@/components/marketing/vendor-briefs/new-brief-modal";
import { TermMatrix } from "@/components/marketing/vendor-briefs/term-matrix";
import { nextTermWithin } from "@/lib/vendor-brief/term-dates";
import type { TermReadinessCategory } from "@prisma/client";
import { toast } from "@/hooks/useToast";

const TABS = [
  { id: "in-flight", label: "In Flight" },
  { id: "term-readiness", label: "Term Readiness" },
  { id: "archive", label: "Archive" },
] as const;

type Tab = (typeof TABS)[number]["id"];

export default function VendorBriefsPage() {
  return (
    <Suspense fallback={null}>
      <VendorBriefsPageInner />
    </Suspense>
  );
}

function VendorBriefsPageInner() {
  const router = useRouter();
  const search = useSearchParams();

  // URL-driven state — supports cockpit drill-down.
  const tabParam = (search.get("tab") ?? "in-flight") as Tab;
  const tab: Tab = TABS.some((t) => t.id === tabParam) ? tabParam : "in-flight";
  const openBriefId = search.get("open");
  const urlTermYear = search.get("termYear");
  const urlTermNumber = search.get("termNumber");

  const defaultTerm = useMemo(() => nextTermWithin(12), []);

  const [termYear, setTermYear] = useState<number>(
    urlTermYear ? Number(urlTermYear) : defaultTerm?.year ?? new Date().getFullYear(),
  );
  const [termNumber, setTermNumber] = useState<number>(
    urlTermNumber ? Number(urlTermNumber) : defaultTerm?.term ?? 1,
  );

  const [newBriefOpen, setNewBriefOpen] = useState(false);
  const [newBriefPrefill, setNewBriefPrefill] = useState<NewBriefPrefill | undefined>();

  const setTab = (next: Tab) => {
    const params = new URLSearchParams(Array.from(search.entries()));
    params.set("tab", next);
    params.delete("open"); // close detail panel on tab change
    router.replace(`?${params.toString()}`);
  };

  const setOpenBrief = (id: string | null) => {
    const params = new URLSearchParams(Array.from(search.entries()));
    if (id) params.set("open", id);
    else params.delete("open");
    router.replace(`?${params.toString()}`);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <PageHeader
        title="Vendor & Printing"
        description="Brief Jinan, track delivery, prep for next term."
        primaryAction={{
          label: "New brief",
          icon: Plus,
          onClick: () => {
            setNewBriefPrefill(undefined);
            setNewBriefOpen(true);
          },
        }}
      />

      {/* Tabs */}
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border">
        <div className="flex">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-pressed={tab === t.id}
              className={`relative px-4 py-2 text-sm font-medium transition-colors ${
                tab === t.id
                  ? "text-brand"
                  : "text-foreground/70 hover:text-foreground"
              }`}
            >
              {t.label}
              {tab === t.id && (
                <span className="absolute -bottom-px left-0 right-0 h-0.5 bg-brand" />
              )}
            </button>
          ))}
        </div>

        {tab === "term-readiness" && (
          <TermSelector
            termYear={termYear}
            termNumber={termNumber}
            onChange={(y, n) => {
              setTermYear(y);
              setTermNumber(n);
            }}
          />
        )}
      </div>

      {/* Tab content */}
      {tab === "in-flight" && <InFlightTab onOpenBrief={setOpenBrief} />}
      {tab === "archive" && <ArchiveTab onOpenBrief={setOpenBrief} />}
      {tab === "term-readiness" && (
        <TermReadinessTab
          termYear={termYear}
          termNumber={termNumber}
          onOpenBrief={setOpenBrief}
          onEmptyCellClick={(serviceId, category) => {
            setNewBriefPrefill({
              serviceId,
              termYear,
              termNumber,
              termReadinessCategory: category,
            });
            setNewBriefOpen(true);
          }}
        />
      )}

      <BriefDetailPanel
        briefId={openBriefId}
        onClose={() => setOpenBrief(null)}
      />

      <NewBriefModal
        open={newBriefOpen}
        onClose={() => setNewBriefOpen(false)}
        prefill={newBriefPrefill}
        onCreated={(id) => setOpenBrief(id)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function InFlightTab({ onOpenBrief }: { onOpenBrief: (id: string) => void }) {
  const { data: briefs, isLoading } = useVendorBriefs({ status: "in_flight" });

  if (isLoading || !briefs) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-surface/30 px-4 py-6 text-sm text-muted">
        Loading briefs…
      </div>
    );
  }

  // Compact summary above the table.
  const counts = briefs.reduce(
    (acc, b) => {
      if (b.status === "brief_sent" || b.status === "awaiting_ack") {
        acc.awaitingAck += 1;
        if (b.slaState === "ack_overdue" || b.slaState === "breached") acc.ackOverdue += 1;
      } else if (b.status === "awaiting_quote") {
        acc.awaitingQuote += 1;
        if (b.slaState === "quote_overdue" || b.slaState === "breached") acc.quoteOverdue += 1;
      } else if (
        b.status === "approved" ||
        b.status === "ordered" ||
        b.status === "quote_received"
      ) {
        acc.inProduction += 1;
      }
      return acc;
    },
    { awaitingAck: 0, ackOverdue: 0, awaitingQuote: 0, quoteOverdue: 0, inProduction: 0 },
  );

  return (
    <div className="space-y-3">
      <p className="rounded-md border border-border bg-surface/40 px-3 py-2 text-xs text-foreground/80">
        <span className="font-medium">{counts.awaitingAck}</span> awaiting acknowledgement
        {counts.ackOverdue > 0 && (
          <span className="text-rose-700"> ({counts.ackOverdue} overdue)</span>
        )}
        {" · "}
        <span className="font-medium">{counts.awaitingQuote}</span> awaiting quote
        {counts.quoteOverdue > 0 && (
          <span className="text-rose-700"> ({counts.quoteOverdue} overdue)</span>
        )}
        {" · "}
        <span className="font-medium">{counts.inProduction}</span> in production
      </p>
      <BriefTable briefs={briefs} onOpenBrief={onOpenBrief} />
    </div>
  );
}

function ArchiveTab({ onOpenBrief }: { onOpenBrief: (id: string) => void }) {
  const { data: briefs, isLoading } = useVendorBriefs({ status: "archived" });
  const [showCancelled, setShowCancelled] = useState(false);

  if (isLoading || !briefs) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-surface/30 px-4 py-6 text-sm text-muted">
        Loading archive…
      </div>
    );
  }

  const filtered = showCancelled ? briefs : briefs.filter((b) => b.status !== "cancelled");

  return (
    <div className="space-y-3">
      <label className="inline-flex items-center gap-2 text-xs text-foreground/80">
        <input
          type="checkbox"
          checked={showCancelled}
          onChange={(e) => setShowCancelled(e.target.checked)}
          className="h-4 w-4 rounded border-border text-brand"
        />
        Show cancelled
      </label>
      <BriefTable briefs={filtered} onOpenBrief={onOpenBrief} />
    </div>
  );
}

function TermReadinessTab({
  termYear,
  termNumber,
  onOpenBrief,
  onEmptyCellClick,
}: {
  termYear: number;
  termNumber: number;
  onOpenBrief: (id: string) => void;
  onEmptyCellClick: (serviceId: string, category: TermReadinessCategory) => void;
}) {
  const seed = useSeedTermReadiness();
  const [confirming, setConfirming] = useState(false);

  const runSeed = async () => {
    try {
      const result = await seed.mutateAsync({ termYear, termNumber });
      toast({
        description: `${result.created} draft brief${result.created === 1 ? "" : "s"} created${
          result.skipped > 0 ? ` (${result.skipped} cells already had briefs)` : ""
        }.`,
      });
      setConfirming(false);
    } catch {
      // hook toasts
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface/30 px-3 py-2 text-xs">
        <span className="text-foreground/80">
          Pre-populating creates a draft brief for any empty cell in this term&apos;s matrix.
        </span>
        {confirming ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setConfirming(false)}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-xs"
            >
              Cancel
            </button>
            <button
              onClick={runSeed}
              disabled={seed.isPending}
              className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {seed.isPending ? "Creating..." : "Create drafts"}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="inline-flex items-center gap-1 rounded-md border border-brand/30 bg-brand/5 px-3 py-1.5 text-xs font-medium text-brand hover:bg-brand/10"
          >
            <Sparkles className="h-3.5 w-3.5" /> Pre-populate this term
          </button>
        )}
      </div>

      <TermMatrix
        termYear={termYear}
        termNumber={termNumber}
        onOpenBrief={onOpenBrief}
        onEmptyCellClick={onEmptyCellClick}
      />
    </div>
  );
}

function TermSelector({
  termYear,
  termNumber,
  onChange,
}: {
  termYear: number;
  termNumber: number;
  onChange: (year: number, number: number) => void;
}) {
  // Generate the next 8 terms (2 years × 4 terms) starting from current year.
  const now = new Date();
  const baseYear = now.getUTCFullYear();
  const options: Array<{ year: number; number: number; label: string }> = [];
  for (let y = baseYear; y <= baseYear + 1; y++) {
    for (let n = 1; n <= 4; n++) {
      options.push({ year: y, number: n, label: `Term ${n} ${y}` });
    }
  }

  const value = `${termYear}-${termNumber}`;

  return (
    <select
      value={value}
      onChange={(e) => {
        const [yStr, nStr] = e.target.value.split("-");
        onChange(Number(yStr), Number(nStr));
      }}
      className="rounded-md border border-border bg-card px-3 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
    >
      {options.map((o) => (
        <option key={`${o.year}-${o.number}`} value={`${o.year}-${o.number}`}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
