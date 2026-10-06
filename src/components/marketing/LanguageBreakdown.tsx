"use client";

/**
 * Languages by centre — which language families at each school want to
 * hear from us in. Use it to decide which languages to produce flyers and
 * info packs in; then target them with an email audience's "Preferred
 * language" rule.
 */

import { useQuery } from "@tanstack/react-query";
import { Languages } from "lucide-react";
import { fetchApi } from "@/lib/fetch-api";
import { Skeleton } from "@/components/ui/Skeleton";

interface Breakdown {
  centres: {
    serviceId: string;
    name: string;
    total: number;
    unknown: number;
    languages: { language: string; families: number }[];
  }[];
  overall: { language: string; families: number }[];
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

export function LanguageBreakdown({ serviceId }: { serviceId?: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["marketing", "language-breakdown", serviceId ?? "all"],
    queryFn: () =>
      fetchApi<Breakdown>(
        `/api/marketing/language-breakdown${serviceId ? `?serviceId=${serviceId}` : ""}`,
      ),
    retry: 2,
    staleTime: 5 * 60_000,
  });

  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-start gap-2">
        <Languages className="w-5 h-5 text-brand mt-0.5" />
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Families&apos; preferred language
          </h3>
          <p className="text-xs text-muted mt-0.5">
            One family per primary carer. Plan translated material from this,
            then target it with an email audience&apos;s &ldquo;Preferred
            language&rdquo; rule.
          </p>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-32 w-full rounded-lg" />
      ) : !data || data.centres.every((c) => c.total === 0) ? (
        <p className="text-sm text-muted">No family contacts yet.</p>
      ) : (
        <>
          {data.overall.length > 0 && !serviceId && (
            <div className="flex flex-wrap gap-2">
              {data.overall.slice(0, 8).map((l) => (
                <span
                  key={l.language}
                  className="text-xs rounded-full bg-brand/10 text-brand px-2.5 py-1 font-medium"
                >
                  {l.language} · {l.families}
                </span>
              ))}
            </div>
          )}
          <div className="divide-y divide-border">
            {data.centres
              .filter((c) => c.total > 0)
              .map((c) => (
                <div key={c.serviceId} className="py-3 space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">{c.name}</p>
                    <p className="text-2xs text-muted">
                      {c.total} {c.total === 1 ? "family" : "families"}
                      {c.unknown > 0 && ` · ${c.unknown} not recorded`}
                    </p>
                  </div>
                  {/* Stacked bar — share of families by language. */}
                  <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface">
                    {c.languages.map((l, i) => (
                      <div
                        key={l.language}
                        title={`${l.language}: ${l.families}`}
                        className={i === 0 ? "bg-brand" : i === 1 ? "bg-accent" : "bg-brand/40"}
                        style={{ width: `${pct(l.families, c.total)}%` }}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-muted">
                    {c.languages.length === 0
                      ? "No languages recorded yet"
                      : c.languages
                          .slice(0, 5)
                          .map((l) => `${l.language} ${pct(l.families, c.total)}%`)
                          .join(" · ")}
                  </p>
                </div>
              ))}
          </div>
        </>
      )}
    </section>
  );
}
