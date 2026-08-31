"use client";

/**
 * The families whose money we handle, and their billing arrangements.
 *
 * WHY IT'S HERE: this list already existed under Growth → Families, but
 * that page is about enrolment progress — who's mid-form, who needs a
 * reminder. When you're actually doing billing you want the opposite
 * columns: what cycle they're on, when the next debit falls, whether it
 * has a cap, and whether it's paused. Same records, different job, so
 * this renders the billing view of them wherever billing is done.
 *
 * Pass `serviceId` for a centre's own families. That scopes the list AND
 * the bulk panel's "all families" — a coordinator pressing apply must not
 * be able to reach families at another centre.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Search, ChevronRight, Pause, Ban } from "lucide-react";
import { fetchApi } from "@/lib/fetch-api";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { FamilyDiscountsCard } from "./FamilyDiscountsCard";
import { BulkBillingPanel } from "@/components/families/BulkBillingPanel";
import { anchorDayLabel, formatCents } from "@/lib/family-billing";

interface FamilyRow {
  id: string;
  email: string;
  name: string | null;
  familyName: string | null;
  services: { id: string; name: string }[];
  billing: {
    frequency: string | null;
    anchorDay: number | null;
    limitCents: number | null;
    nextBillingDate: string | null;
    weeks: number | null;
    autoInvoice: boolean;
    pauseDebiting: boolean;
  };
  deactivated?: boolean;
  children: { id: string; name: string }[];
}

function formatDate(v: string | null): string {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function FamilyBillingSection({
  serviceId,
  serviceName,
}: {
  serviceId?: string;
  serviceName?: string;
}) {
  const [search, setSearch] = useState("");

  const { data, isLoading, error, refetch } = useQuery<{
    families: FamilyRow[];
  }>({
    queryKey: ["families", { serviceId: serviceId ?? null }],
    queryFn: () =>
      fetchApi(
        `/api/families${serviceId ? `?serviceId=${encodeURIComponent(serviceId)}` : ""}`,
      ),
    retry: 2,
  });

  const families = useMemo(() => data?.families ?? [], [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return families;
    return families.filter((f) =>
      [f.familyName, f.name, f.email, ...f.children.map((c) => c.name)]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q)),
    );
  }, [families, search]);

  const options = families.map((f) => ({
    id: f.id,
    label: f.familyName ?? f.name ?? f.email,
  }));

  // Worth surfacing: a paused family looks perfectly normal in a list of
  // billing dates, right up until you wonder why they never got invoiced.
  const paused = families.filter((f) => f.billing.pauseDebiting).length;
  const unset = families.filter((f) => !f.billing.frequency).length;

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState
        title="Couldn't load families"
        error={error as Error}
        onRetry={refetch}
      />
    );
  }

  return (
    <div className="space-y-4">
      <BulkBillingPanel
        families={options}
        serviceId={serviceId}
        serviceName={serviceName}
      />

      {/* Discounts belong to families, so they live with the families —
          not on the room, the way OWNA files them. Only shown for a
          single centre: a discount is granted against one service's
          fees. */}
      {serviceId && (
        <FamilyDiscountsCard
          serviceId={serviceId}
          families={options.map((o) => ({ id: o.id, name: o.label }))}
        />
      )}

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search family, parent or child…"
            aria-label="Search families"
            className="w-full pl-9 pr-3 py-2 text-base sm:text-sm border border-border rounded-xl bg-card focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
        </div>
        <p className="text-xs text-muted">
          {filtered.length} of {families.length}
          {unset > 0 && ` · ${unset} with no billing cycle set`}
          {paused > 0 && ` · ${paused} paused`}
        </p>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted py-6 text-center">
          {families.length === 0
            ? serviceName
              ? `No families are linked to ${serviceName} yet.`
              : "No family accounts yet."
            : "No families match that search."}
        </p>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          {/* Desktop header — the columns you actually need when billing */}
          <div className="hidden sm:grid grid-cols-12 gap-3 px-4 py-2.5 bg-surface text-2xs font-semibold uppercase tracking-wide text-muted">
            <span className="col-span-3">Family</span>
            <span className="col-span-3">Cycle</span>
            <span className="col-span-2">Next debit</span>
            <span className="col-span-2">Limit</span>
            <span className="col-span-2">Children</span>
          </div>

          <ul className="divide-y divide-border">
            {filtered.map((f) => (
              <li key={f.id}>
                <Link
                  href={`/families/${f.id}`}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-1 sm:gap-3 px-4 py-3 hover:bg-surface transition-colors items-center"
                >
                  <div className="sm:col-span-3 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate flex items-center gap-1.5">
                      {f.familyName ?? f.name ?? f.email}
                      {f.deactivated && (
                        <Ban
                          className="w-3.5 h-3.5 text-amber-600 shrink-0"
                          aria-label="Portal access switched off"
                        />
                      )}
                    </p>
                    <p className="text-xs text-muted truncate">{f.email}</p>
                  </div>

                  <div className="sm:col-span-3 min-w-0">
                    <p className="text-sm text-foreground truncate">
                      {f.billing.frequency ? (
                        [
                          f.billing.frequency,
                          anchorDayLabel(
                            f.billing.frequency,
                            f.billing.anchorDay,
                          ),
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      ) : (
                        <span className="text-amber-700 dark:text-amber-300">
                          Not set up
                        </span>
                      )}
                    </p>
                    {f.billing.pauseDebiting && (
                      <p className="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1">
                        <Pause className="w-3 h-3" /> Debiting paused
                      </p>
                    )}
                    {!f.billing.autoInvoice && !f.billing.pauseDebiting && (
                      <p className="text-xs text-muted">Manual invoicing</p>
                    )}
                  </div>

                  <span className="sm:col-span-2 text-sm text-foreground">
                    <span className="sm:hidden text-muted text-xs">
                      Next debit:{" "}
                    </span>
                    {formatDate(f.billing.nextBillingDate)}
                  </span>

                  <span className="sm:col-span-2 text-sm text-foreground">
                    <span className="sm:hidden text-muted text-xs">Limit: </span>
                    {formatCents(f.billing.limitCents) ?? "—"}
                  </span>

                  <span className="sm:col-span-2 flex items-center justify-between gap-2 text-sm text-muted truncate">
                    <span className="truncate">
                      {f.children.length === 0
                        ? "—"
                        : f.children.map((c) => c.name).join(", ")}
                    </span>
                    <ChevronRight className="w-4 h-4 shrink-0" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
