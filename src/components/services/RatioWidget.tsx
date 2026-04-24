"use client";

/**
 * RatioWidget — compact live-ratio display, refreshes every 60s.
 *
 * Placement:
 *   - Services Today tab (compact view)
 *   - Services Ratios sub-tab (full view with historical snapshots)
 *
 * Shows per-session educator:child ratio with traffic-light colouring against
 * the service's min ratio. Highlights when below ratio.
 */

import { useMemo } from "react";
import { AlertTriangle, Check, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRatios, type RatioLive, type SessionTypeKey } from "@/hooks/useRatios";

const SESSION_LABELS: Record<SessionTypeKey, string> = {
  bsc: "Before school",
  asc: "After school",
  vc: "Vacation care",
};

export function RatioWidget({
  serviceId,
  compact = false,
}: {
  serviceId: string;
  compact?: boolean;
}) {
  const { data, isLoading } = useRatios(serviceId);
  const live = data?.live ?? [];

  const active = useMemo(
    () => live.filter((r) => r.educatorCount > 0 || r.childCount > 0),
    [live],
  );

  if (isLoading) {
    return (
      <div className="warm-card-dense p-3 text-sm text-[color:var(--color-muted)]">
        Checking ratios…
      </div>
    );
  }

  if (active.length === 0) {
    return (
      <div className="warm-card-dense p-3 text-sm text-[color:var(--color-muted)] flex items-center gap-2">
        <Users className="w-4 h-4" />
        No one signed in right now.
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", compact && "grid grid-cols-1 gap-2")}>
      {active.map((r) => (
        <RatioRow key={r.sessionType} row={r} />
      ))}
    </div>
  );
}

function RatioRow({ row }: { row: RatioLive }) {
  const tone = row.belowRatio ? "below" : "ok";
  return (
    <div
      className={cn(
        "warm-card-dense p-3 flex items-center gap-3",
        tone === "below"
          ? "border-[color:var(--color-danger)]/40 bg-rose-50/50"
          : "border-[color:var(--color-border)]",
      )}
    >
      <div
        className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
          tone === "below"
            ? "bg-rose-100 text-rose-700"
            : "bg-emerald-100 text-emerald-700",
        )}
      >
        {tone === "below" ? (
          <AlertTriangle className="w-5 h-5" />
        ) : (
          <Check className="w-5 h-5" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold">
            {SESSION_LABELS[row.sessionType]}
          </span>
          <span className="text-[11px] text-[color:var(--color-muted)]">
            · min {row.minRatio}
          </span>
        </div>
        <p className="text-[13px] text-[color:var(--color-foreground)] mt-0.5">
          <span className="font-bold">{row.ratioText}</span>{" "}
          <span className="text-[color:var(--color-muted)]">
            ({row.educatorCount} educator{row.educatorCount === 1 ? "" : "s"} ·{" "}
            {row.childCount} child{row.childCount === 1 ? "" : "ren"})
          </span>
        </p>
        {row.belowRatio && (
          <p className="text-[11px] font-medium text-[color:var(--color-danger)] mt-0.5">
            Below ratio — needs another educator
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Standalone Ratios sub-tab — widget + historical DataTable-style list.
 */
export function ServiceRatiosTab({ serviceId }: { serviceId: string }) {
  const { data } = useRatios(serviceId);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[11px] font-heading font-semibold text-[color:var(--color-muted)] uppercase tracking-[0.08em] mb-3">
          Live ratio
        </h2>
        <RatioWidget serviceId={serviceId} />
      </div>

      <div>
        <h2 className="text-[11px] font-heading font-semibold text-[color:var(--color-muted)] uppercase tracking-[0.08em] mb-3">
          Recent snapshots
        </h2>
        {!data?.snapshots || data.snapshots.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]">
            No snapshots yet — the hourly cron writes rows throughout the day.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[color:var(--color-border)]">
            <table className="w-full text-[13px]">
              <thead className="bg-[color:var(--color-cream-deep)]">
                <tr>
                  <Th>Captured</Th>
                  <Th>Session</Th>
                  <Th>Ratio</Th>
                  <Th>Educators</Th>
                  <Th>Children</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {data.snapshots.map((s) => {
                  const t = new Date(s.capturedAt);
                  return (
                    <tr
                      key={s.id}
                      className="border-t border-[color:var(--color-border)]"
                    >
                      <Td>
                        {t.toLocaleString(undefined, {
                          day: "numeric",
                          month: "short",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </Td>
                      <Td className="capitalize">{s.sessionType}</Td>
                      <Td className="font-semibold">{s.ratioText}</Td>
                      <Td>{s.educatorCount}</Td>
                      <Td>{s.childCount}</Td>
                      <Td>
                        {s.belowRatio ? (
                          <span className="text-[color:var(--color-danger)] font-medium">
                            Below
                          </span>
                        ) : (
                          <span className="text-emerald-700 font-medium">OK</span>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-2 text-left font-semibold text-[11px] uppercase tracking-wide text-[color:var(--color-muted)]">
      {children}
    </th>
  );
}

function Td({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={cn("px-3 py-2", className)}>{children}</td>;
}
