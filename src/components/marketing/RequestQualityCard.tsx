"use client";

import { useQuery } from "@tanstack/react-query";
import { ThumbsUp } from "lucide-react";
import type { CreativeRequestType } from "@prisma/client";
import { fetchApi } from "@/lib/fetch-api";
import { Skeleton } from "@/components/ui/Skeleton";
import { TYPE_LABELS } from "@/lib/creative-request/constants";

interface QualityByType {
  type: CreativeRequestType;
  csatCount: number;
  csatRate: number | null;
  decidedCount: number;
  firstProofRate: number | null;
}

interface QualityData {
  days: number;
  csat: { positive: number; negative: number; rate: number | null };
  firstProof: { approved: number; decided: number; rate: number | null };
  byType: QualityByType[];
}

function useRequestQuality(days: number) {
  return useQuery({
    queryKey: ["creative-request-quality", days],
    queryFn: () =>
      fetchApi<QualityData>(
        `/api/marketing/creative-request-quality?days=${days}`,
      ),
    retry: 2,
    staleTime: 60_000,
  });
}

const pct = (rate: number | null): string =>
  rate === null ? "—" : `${Math.round(rate * 100)}%`;

/**
 * Creative-request quality loop: delivery CSAT (requester 👍 rate) and
 * first-proof approval rate (plain approvals only), overall + per type.
 * Self-contained like EmailAnalytics — owns its query.
 */
export function RequestQualityCard() {
  const { data, isLoading } = useRequestQuality(90);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-56" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
        <ThumbsUp className="h-4 w-4 text-brand" />
        Request Quality · last {data.days} days
      </h3>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-2xs uppercase tracking-wide text-muted">
            Delivery CSAT
          </div>
          <div className="text-2xl font-semibold text-foreground mt-1">
            {pct(data.csat.rate)}
          </div>
          <div className="text-2xs text-muted mt-1">
            {data.csat.positive} 👍 · {data.csat.negative} 👎
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-2xs uppercase tracking-wide text-muted">
            First-proof approval
          </div>
          <div className="text-2xl font-semibold text-foreground mt-1">
            {pct(data.firstProof.rate)}
          </div>
          <div className="text-2xs text-muted mt-1">
            {data.firstProof.approved} of {data.firstProof.decided} first proofs
          </div>
        </div>
      </div>

      {data.byType.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-2xs uppercase tracking-wide text-muted border-b border-border">
                <th className="py-1.5 pr-3 font-semibold">Type</th>
                <th className="py-1.5 pr-3 font-semibold">CSAT</th>
                <th className="py-1.5 pr-3 font-semibold">Ratings</th>
                <th className="py-1.5 pr-3 font-semibold">First proof</th>
                <th className="py-1.5 font-semibold">Decided</th>
              </tr>
            </thead>
            <tbody>
              {data.byType.map((row) => (
                <tr key={row.type} className="border-b border-border/50">
                  <td className="py-1.5 pr-3 text-foreground">
                    {TYPE_LABELS[row.type]}
                  </td>
                  <td className="py-1.5 pr-3 text-foreground">{pct(row.csatRate)}</td>
                  <td className="py-1.5 pr-3 text-muted">{row.csatCount}</td>
                  <td className="py-1.5 pr-3 text-foreground">
                    {pct(row.firstProofRate)}
                  </td>
                  <td className="py-1.5 text-muted">{row.decidedCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-2xs text-muted">
        Ratings come from requesters after delivery · first-proof rate counts
        plain approvals only
      </p>
    </div>
  );
}
