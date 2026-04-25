"use client";

import { useCoordinatorHistory } from "@/hooks/useWhatsAppCompliance";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/Sheet";
import { Skeleton } from "@/components/ui/Skeleton";

interface CoordinatorHistorySidePanelProps {
  serviceId: string | null;
  onClose: () => void;
}

const STATUS_BG: Record<"green" | "amber" | "red", string> = {
  green: "bg-green-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
};

export function CoordinatorHistorySidePanel({ serviceId, onClose }: CoordinatorHistorySidePanelProps) {
  const open = !!serviceId;
  const { data, isLoading, isError, error } = useCoordinatorHistory(serviceId);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        <SheetTitle>Coordinator History</SheetTitle>
        <SheetDescription>8 weeks of posting compliance.</SheetDescription>

        {isLoading && (
          <div className="space-y-3 mt-4">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}

        {isError && (
          <p className="mt-4 text-sm text-red-700">
            Failed to load history: {error?.message ?? "Unknown error"}
          </p>
        )}

        {data && (
          <div className="mt-4 space-y-4">
            <div>
              <div className="text-base font-semibold text-foreground">{data.serviceName}</div>
              <div className="text-xs text-muted">
                {data.coordinatorName ?? "Unknown coordinator"}
              </div>
            </div>

            <div>
              <h4 className="text-xs font-medium text-muted mb-2">Weekly post count</h4>
              <ul className="space-y-1">
                {data.weeks.map((w) => {
                  const total = w.posted + w.notPosted + w.notChecked + w.excluded;
                  const postedPct = total === 0 ? 0 : (w.posted / total) * 100;
                  const notPostedPct = total === 0 ? 0 : (w.notPosted / total) * 100;
                  const notCheckedPct = total === 0 ? 0 : (w.notChecked / total) * 100;
                  const excludedPct = total === 0 ? 0 : (w.excluded / total) * 100;
                  return (
                    <li key={w.weekStart} className="text-xs">
                      <div className="flex justify-between mb-0.5">
                        <span className="text-muted">{w.weekStart}</span>
                        <span className="flex items-center gap-1">
                          <span
                            className={`inline-block w-2 h-2 rounded-full ${STATUS_BG[w.status]}`}
                            aria-hidden
                          />
                          {w.posted}/{w.target}
                        </span>
                      </div>
                      <div className="h-3 rounded-md overflow-hidden bg-surface flex" role="img" aria-label={`Posted ${w.posted}, not posted ${w.notPosted}, not checked ${w.notChecked}, excluded ${w.excluded}`}>
                        {postedPct > 0 && <div style={{ width: `${postedPct}%` }} className="bg-green-500" />}
                        {notPostedPct > 0 && <div style={{ width: `${notPostedPct}%` }} className="bg-red-500" />}
                        {excludedPct > 0 && <div style={{ width: `${excludedPct}%` }} className="bg-blue-300" />}
                        {notCheckedPct > 0 && <div style={{ width: `${notCheckedPct}%` }} className="bg-gray-200" />}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-muted">
                <LegendDot colour="bg-green-500" label="Posted" />
                <LegendDot colour="bg-red-500" label="Did not post" />
                <LegendDot colour="bg-blue-300" label="Excluded (leave/closed)" />
                <LegendDot colour="bg-gray-200" label="Not checked" />
              </div>
            </div>

            <div>
              <h4 className="text-xs font-medium text-muted mb-2">Recent notes</h4>
              {data.notes.length === 0 ? (
                <p className="text-xs text-muted">No notes recorded.</p>
              ) : (
                <ul className="space-y-1.5">
                  {data.notes.map((n) => (
                    <li key={n.id} className="rounded-md border border-border p-2 text-xs">
                      <div className="text-muted">{n.date}</div>
                      <div className="text-foreground mt-0.5">{n.notes}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function LegendDot({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block w-2 h-2 rounded-full ${colour}`} aria-hidden />
      {label}
    </span>
  );
}
