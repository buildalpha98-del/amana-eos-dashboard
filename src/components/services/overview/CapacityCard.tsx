"use client";

import { useQuery } from "@tanstack/react-query";
import { useWaitlist, useOfferSpot } from "@/hooks/useWaitlist";
import { fetchApi } from "@/lib/fetch-api";
import { cn } from "@/lib/utils";
import { Users } from "lucide-react";

export function CapacityCard({
  service,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  service: any;
}) {
  const { data: waitlistData } = useWaitlist(service.id);
  const offerSpot = useOfferSpot();

  // Fetch enrolled count for this service
  const { data: enrolledData } = useQuery<{ count: number }>({
    queryKey: ["enrolled-count", service.id],
    queryFn: () =>
      fetchApi<{ count: number }>(
        `/api/enquiries/stats?serviceId=${service.id}`
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ).then((stats: any) => ({
        count:
          (stats.countByStage?.enrolled || 0) +
          (stats.countByStage?.first_session || 0) +
          (stats.countByStage?.retained || 0),
      })),
    staleTime: 30_000,
    retry: 2,
  });

  const capacity = service.capacity ?? 0;
  const enrolled = enrolledData?.count ?? 0;
  const waitlistCount = waitlistData?.total ?? 0;
  const utilisation = capacity > 0 ? (enrolled / capacity) * 100 : 0;

  const barColor =
    utilisation > 95
      ? "bg-red-500"
      : utilisation > 80
      ? "bg-amber-500"
      : "bg-emerald-500";

  return (
    <div>
      <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">
        <Users className="w-3.5 h-3.5 inline mr-1" />
        Capacity & Waitlist
      </label>

      {capacity > 0 ? (
        <div className="space-y-3">
          {/* Capacity bar */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted">
                {enrolled} enrolled / {capacity} capacity
              </span>
              <span className="text-xs font-medium text-foreground">
                {Math.round(utilisation)}%
              </span>
            </div>
            <div className="w-full h-2 bg-surface rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                style={{ width: `${Math.min(utilisation, 100)}%` }}
              />
            </div>
          </div>

          {/* Waitlist info */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "text-xs px-2 py-0.5 rounded-full font-medium",
                  waitlistCount > 0
                    ? "bg-amber-100 text-amber-700"
                    : "bg-surface text-muted"
                )}
              >
                {waitlistCount} {waitlistCount === 1 ? "family" : "families"} waiting
              </span>
            </div>
            {waitlistCount > 0 && (
              <button
                onClick={() => offerSpot.mutate(service.id)}
                disabled={offerSpot.isPending}
                className="text-xs px-3 py-1.5 bg-brand text-white rounded-md hover:bg-brand/90 disabled:opacity-50 transition-colors"
              >
                {offerSpot.isPending ? "Offering..." : "Offer Next Spot"}
              </button>
            )}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted">
          Set capacity in contact details above to track utilisation.
        </p>
      )}
    </div>
  );
}
