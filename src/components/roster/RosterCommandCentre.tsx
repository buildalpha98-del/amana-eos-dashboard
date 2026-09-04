"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useServices } from "@/hooks/useServices";
import { ServiceWeeklyShiftsGrid } from "@/components/services/ServiceWeeklyShiftsGrid";
import { WeekPicker, currentWeekStartIso } from "@/components/roster/WeekPicker";
import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { cn } from "@/lib/utils";

interface RosterCommandCentreProps {
  /**
   * Service section to auto-expand on load (a Director of Service's own
   * centre). Null (admin roles) starts with every section collapsed — each
   * expanded grid costs 5 queries, so nothing loads until asked for.
   */
  defaultExpandedServiceId: string | null;
}

/**
 * `/roster` command centre (staff-portal-v2 Chunk 5): every centre's weekly
 * shifts grid behind one page-level WeekPicker. Members only ever see their
 * own centre here — `GET /api/services` applies `getCentreScope`, so the
 * scoping is server-side, not cosmetic.
 */
export function RosterCommandCentre({ defaultExpandedServiceId }: RosterCommandCentreProps) {
  const [weekStart, setWeekStart] = useState(currentWeekStartIso);
  const { data: services, isLoading, error } = useServices("active");

  // `expanded` drives visibility; `mounted` tracks which grids have EVER
  // been opened. A grid fires 5 queries (shifts, team, bookings, cost,
  // certs), so it mounts lazily on first expand and then stays mounted
  // (hidden via CSS) so re-opening a section doesn't refetch everything.
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    defaultExpandedServiceId ? { [defaultExpandedServiceId]: true } : {},
  );
  const [mounted, setMounted] = useState<Record<string, boolean>>(() =>
    defaultExpandedServiceId ? { [defaultExpandedServiceId]: true } : {},
  );

  const toggle = (serviceId: string) => {
    setExpanded((prev) => ({ ...prev, [serviceId]: !prev[serviceId] }));
    setMounted((prev) => (prev[serviceId] ? prev : { ...prev, [serviceId]: true }));
  };

  return (
    <div className="p-6 md:p-10 space-y-6">
      <PageHeader
        title="Roster"
        description="Weekly shifts across every centre — open slots, ratios and publishing in one place."
      >
        <WeekPicker weekStart={weekStart} onWeekChange={setWeekStart} />
      </PageHeader>

      {error ? (
        <ErrorState error={error} />
      ) : isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : !services || services.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted">
          No active services found.
        </div>
      ) : (
        <div className="space-y-3">
          {services.map((service) => {
            const isOpen = !!expanded[service.id];
            return (
              <section
                key={service.id}
                className="rounded-xl border border-border bg-card"
                data-testid={`roster-section-${service.id}`}
              >
                <button
                  type="button"
                  onClick={() => toggle(service.id)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface/60 transition-colors rounded-xl"
                >
                  <span className="flex items-baseline gap-2 min-w-0">
                    <span className="text-base font-semibold text-foreground truncate">
                      {service.name}
                    </span>
                    {service.suburb && (
                      <span className="text-sm text-muted truncate">{service.suburb}</span>
                    )}
                  </span>
                  <ChevronDown
                    className={cn(
                      "w-4 h-4 shrink-0 text-muted transition-transform",
                      isOpen && "rotate-180",
                    )}
                    aria-hidden
                  />
                </button>
                {mounted[service.id] && (
                  <div className={cn("border-t border-border p-4", !isOpen && "hidden")}>
                    <ServiceWeeklyShiftsGrid
                      serviceId={service.id}
                      serviceName={service.name}
                      weekStart={weekStart}
                    />
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
