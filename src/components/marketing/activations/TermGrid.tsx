"use client";

import { useState } from "react";
import { useTermGrid, type TermGridResponse } from "@/hooks/useActivations";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";

const STATUS_DOT: Record<"green" | "amber" | "red", string> = {
  green: "bg-green-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
};

const STATUS_LABEL: Record<"green" | "amber" | "red", string> = {
  green: "On target",
  amber: "Below target",
  red: "Off target",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", { day: "2-digit", month: "short" });
}

interface TermGridProps {
  termYear?: number;
  termNumber?: number;
  onAddActivation?: (serviceId: string) => void;
  onSelectActivation?: (activationId: string) => void;
}

export function TermGrid({ termYear, termNumber, onAddActivation, onSelectActivation }: TermGridProps) {
  const { data, isLoading, isError, error, refetch } = useTermGrid(termYear, termNumber);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (isError) return <ErrorState title="Couldn't load term grid" error={error ?? undefined} onRetry={() => refetch()} />;
  if (!data) return null;

  const totalsRagDot = data.termTotals.delivered >= data.termTotals.target
    ? "green"
    : data.termTotals.total >= data.termTotals.floor
      ? "amber"
      : "red";

  return (
    <section className="space-y-3">
      <header className="rounded-xl border border-border bg-card p-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold">Term {data.term.number} {data.term.year}</h3>
          <p className="text-xs text-muted">
            {fmtDate(data.term.startsOn)} → {fmtDate(data.term.endsOn)} · {data.term.weeksUntilEnd} week{data.term.weeksUntilEnd === 1 ? "" : "s"} until end
          </p>
        </div>
        <div className="text-sm flex items-center gap-2">
          <span className={`inline-block w-2.5 h-2.5 rounded-full ${STATUS_DOT[totalsRagDot]}`} aria-hidden />
          <span>
            <span className="font-semibold">{data.termTotals.delivered}</span>
            <span className="text-muted">/{data.termTotals.target} delivered</span>
            <span className="text-muted ml-2">({data.termTotals.total} total · floor {data.termTotals.floor})</span>
          </span>
        </div>
      </header>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface text-xs text-muted">
            <tr>
              <th className="text-left p-3 font-medium w-8" />
              <th className="text-left p-3 font-medium">Centre</th>
              <th className="text-left p-3 font-medium">Planned</th>
              <th className="text-left p-3 font-medium">Delivered</th>
              <th className="text-left p-3 font-medium">Cancelled</th>
              <th className="text-left p-3 font-medium">Status</th>
              <th className="text-right p-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {data.matrix.map((row) => {
              const isOpen = expandedRow === row.serviceId;
              return (
                <RowGroup
                  key={row.serviceId}
                  row={row}
                  isOpen={isOpen}
                  onToggle={() => setExpandedRow(isOpen ? null : row.serviceId)}
                  onAddActivation={onAddActivation}
                  onSelectActivation={onSelectActivation}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RowGroup({
  row,
  isOpen,
  onToggle,
  onAddActivation,
  onSelectActivation,
}: {
  row: TermGridResponse["matrix"][number];
  isOpen: boolean;
  onToggle: () => void;
  onAddActivation?: (serviceId: string) => void;
  onSelectActivation?: (activationId: string) => void;
}) {
  return (
    <>
      <tr className="border-t border-border hover:bg-surface/50">
        <td className="p-3">
          <button onClick={onToggle} className="text-muted hover:text-foreground" aria-label={isOpen ? "Collapse" : "Expand"}>
            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </td>
        <td className="p-3">
          <div className="font-medium text-foreground">{row.serviceName}</div>
          {row.state && <div className="text-[10px] text-muted">{row.state}</div>}
        </td>
        <td className="p-3 text-foreground">{row.counts.planned}</td>
        <td className="p-3 text-foreground">{row.counts.delivered}</td>
        <td className="p-3 text-muted">{row.counts.cancelled}</td>
        <td className="p-3">
          <span className="inline-flex items-center gap-1.5 text-xs">
            <span className={`inline-block w-2 h-2 rounded-full ${STATUS_DOT[row.status]}`} aria-hidden />
            {STATUS_LABEL[row.status]} ({row.counts.delivered + row.counts.planned}/{row.targetPerCentre})
          </span>
        </td>
        <td className="p-3 text-right">
          {onAddActivation && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddActivation(row.serviceId);
              }}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-brand hover:bg-surface"
            >
              <Plus className="w-3 h-3" />
              Add
            </button>
          )}
        </td>
      </tr>
      {isOpen && (
        <tr>
          <td colSpan={7} className="p-3 bg-surface/40">
            {row.activations.length === 0 ? (
              <p className="text-xs text-muted px-3 py-2">No activations for this centre yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {row.activations.map((a) => (
                  <li key={a.id}>
                    <button
                      onClick={() => onSelectActivation?.(a.id)}
                      className="w-full text-left flex items-center justify-between gap-2 rounded-md border border-border bg-card p-2 text-xs hover:border-brand"
                    >
                      <span>
                        <span className="font-medium text-foreground">{a.campaignName}</span>
                        <span className="text-muted ml-2 capitalize">{a.activationType?.replace(/_/g, " ") ?? "no type"}</span>
                      </span>
                      <span className="flex items-center gap-2 text-muted">
                        {a.scheduledFor && <span>{fmtDate(a.scheduledFor)}</span>}
                        <span className="px-1.5 py-0.5 rounded-full bg-surface border border-border">
                          {a.lifecycleStage}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
