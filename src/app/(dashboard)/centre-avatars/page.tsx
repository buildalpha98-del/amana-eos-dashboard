"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useCentreAvatars, type CentreAvatarSummary } from "@/hooks/useCentreAvatars";
import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { Target, AlertCircle, Clock, Sparkles, X } from "lucide-react";

type FilterMode = "all" | "fresh" | "needs-review" | "pending-insights";

const FRESHNESS_META = {
  fresh: { label: "Fresh", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  aging: { label: "Aging", className: "bg-amber-100 text-amber-700 border-amber-200" },
  stale: { label: "Stale", className: "bg-rose-100 text-rose-700 border-rose-200" },
} as const;

export default function CentreAvatarsPage() {
  const { data: avatars, isLoading, error, refetch } = useCentreAvatars();
  const [filter, setFilter] = useState<FilterMode>("all");

  const totals = useMemo(() => {
    if (!avatars) return { total: 0, fresh: 0, aging: 0, stale: 0, pendingInsights: 0 };
    return avatars.reduce(
      (acc, a) => {
        acc.total += 1;
        acc[a.freshness] += 1;
        acc.pendingInsights += a.pendingInsightsCount;
        return acc;
      },
      { total: 0, fresh: 0, aging: 0, stale: 0, pendingInsights: 0 },
    );
  }, [avatars]);

  const filteredAvatars = useMemo(() => {
    if (!avatars) return [];
    switch (filter) {
      case "fresh":
        return avatars.filter((a) => a.freshness === "fresh");
      case "needs-review":
        return avatars.filter((a) => a.freshness !== "fresh");
      case "pending-insights":
        return avatars.filter((a) => a.pendingInsightsCount > 0);
      default:
        return avatars;
    }
  }, [avatars, filter]);

  const grouped = useMemo(() => {
    const map = new Map<string, CentreAvatarSummary[]>();
    for (const a of filteredAvatars) {
      const key = a.state ?? "Other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredAvatars]);

  const filterLabel: Record<FilterMode, string> = {
    "all": "all centres",
    "fresh": "fresh centres only",
    "needs-review": "centres needing review",
    "pending-insights": "centres with pending insights",
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Centre Avatars"
        description="The family profile of each centre — who we serve, what they want, how we earn their loyalty."
      />

      {/* Summary stats — clickable filters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile
          icon={Target}
          label="Total Avatars"
          value={totals.total}
          tone="default"
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        <StatTile
          icon={Clock}
          label="Fresh"
          value={totals.fresh}
          tone="fresh"
          active={filter === "fresh"}
          onClick={() => setFilter(filter === "fresh" ? "all" : "fresh")}
        />
        <StatTile
          icon={AlertCircle}
          label="Aging / Stale"
          value={totals.aging + totals.stale}
          tone="warn"
          active={filter === "needs-review"}
          onClick={() => setFilter(filter === "needs-review" ? "all" : "needs-review")}
        />
        <StatTile
          icon={Sparkles}
          label="Pending Insights"
          value={totals.pendingInsights}
          tone={totals.pendingInsights > 0 ? "warn" : "default"}
          active={filter === "pending-insights"}
          onClick={() => setFilter(filter === "pending-insights" ? "all" : "pending-insights")}
        />
      </div>

      {filter !== "all" && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs">
          <span className="text-muted">Filtered by:</span>
          <span className="font-medium text-foreground">{filterLabel[filter]}</span>
          <span className="text-muted">·</span>
          <span className="font-medium tabular-nums">{filteredAvatars.length} of {totals.total}</span>
          <button
            type="button"
            onClick={() => setFilter("all")}
            className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs hover:bg-surface"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        </div>
      )}

      {error && (
        <ErrorState
          title="Failed to load Centre Avatars"
          error={error as Error}
          onRetry={refetch}
        />
      )}

      {!error && isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      )}

      {!error && !isLoading && (avatars?.length ?? 0) === 0 && (
        <EmptyState
          icon={Target}
          title="No Centre Avatars yet"
          description="One Avatar per service should appear here. Ask Jayden to seed the database — then refresh."
          variant="inline"
        />
      )}

      {!error && !isLoading && (avatars?.length ?? 0) > 0 && filteredAvatars.length === 0 && (
        <EmptyState
          icon={Target}
          title="No centres match this filter"
          description="Try a different stat tile, or clear the filter to see everything."
          variant="inline"
        />
      )}

      {!error && !isLoading &&
        grouped.map(([state, items]) => (
          <section key={state} className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground/80">
                {state}
              </h2>
              <span className="text-xs text-muted">{items.length} centres</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {items.map((a) => (
                <AvatarCard key={a.id} avatar={a} />
              ))}
            </div>
          </section>
        ))}
    </div>
  );
}

function AvatarCard({ avatar }: { avatar: CentreAvatarSummary }) {
  const meta = FRESHNESS_META[avatar.freshness];
  const updatedDate = new Date(avatar.lastUpdatedAt);
  return (
    <Link
      href={`/centre-avatars/${avatar.serviceId}`}
      className="block rounded-xl border border-border bg-card p-4 transition-colors hover:border-brand/40 hover:bg-surface/60"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-foreground line-clamp-2">
          {avatar.serviceName}
        </h3>
        <span
          className={`shrink-0 rounded-md border px-2 py-0.5 text-xs font-medium ${meta.className}`}
        >
          {meta.label}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-3 text-xs text-muted">
        <span>
          Updated {avatar.daysSinceUpdate === 0 ? "today" : `${avatar.daysSinceUpdate}d ago`}
          {avatar.lastUpdatedBy?.name ? ` · ${avatar.lastUpdatedBy.name}` : ""}
        </span>
      </div>
      {avatar.pendingInsightsCount > 0 && (
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
          <Sparkles className="h-3 w-3" />
          {avatar.pendingInsightsCount} pending insight
          {avatar.pendingInsightsCount === 1 ? "" : "s"}
        </div>
      )}
      <p className="mt-3 text-xs text-muted">Opened {formatRelative(avatar.lastUpdatedAt)}</p>
      <p className="sr-only">Last updated at {updatedDate.toISOString()}</p>
    </Link>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  tone,
  active = false,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone: "default" | "fresh" | "warn";
  active?: boolean;
  onClick?: () => void;
}) {
  const toneClasses =
    tone === "fresh"
      ? "text-emerald-700 bg-emerald-50 border-emerald-100"
      : tone === "warn"
        ? "text-amber-700 bg-amber-50 border-amber-100"
        : "text-foreground bg-card border-border";

  const ringClass = active ? "ring-2 ring-brand ring-offset-1 ring-offset-background" : "";

  if (!onClick) {
    return (
      <div className={`rounded-xl border p-4 ${toneClasses}`}>
        <div className="flex items-center gap-2 text-xs font-medium opacity-80">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`text-left rounded-xl border p-4 transition-all hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${toneClasses} ${ringClass}`}
    >
      <div className="flex items-center gap-2 text-xs font-medium opacity-80">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </button>
  );
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}
