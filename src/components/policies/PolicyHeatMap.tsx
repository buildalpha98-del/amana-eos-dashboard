"use client";

import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import { StaffAvatar } from "@/components/staff/StaffAvatar";
import { usePolicyHeatMap } from "@/hooks/usePolicies";
import { PolicyHeatMapCell } from "./PolicyHeatMapCell";

export function PolicyHeatMap() {
  const { data, isLoading, error, refetch } = usePolicyHeatMap();

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const policies = useMemo(() => data?.policies ?? [], [data]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20" role="status" aria-live="polite">
        <Loader2 className="w-8 h-8 animate-spin text-brand" />
        <span className="sr-only">Loading policy heat-map</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card border border-red-200 rounded-xl p-6 text-sm text-red-700">
        <p className="font-medium mb-2">Failed to load policy heat-map</p>
        <p className="mb-3">{(error as Error).message}</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="px-3 py-1.5 text-sm font-medium rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (rows.length === 0 || policies.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-10 text-center text-sm text-muted">
        No staff or no published policies yet.
      </div>
    );
  }

  const summary = data?.summary;

  return (
    <div className="space-y-6">
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard label="Staff" value={summary.totalStaff} />
          <SummaryCard label="Fully acknowledged" value={summary.fullyAcknowledged} colorClass="text-emerald-700 bg-emerald-50" />
          <SummaryCard label="Partial" value={summary.partial} colorClass="text-amber-700 bg-amber-50" />
          <SummaryCard label="None" value={summary.none} colorClass="text-red-700 bg-red-50" />
        </div>
      )}

      <div
        data-testid="policy-heat-map-grid"
        className="bg-card border border-border rounded-xl overflow-x-auto"
      >
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 bg-card text-left px-4 py-3 font-semibold text-foreground/80 border-b border-border whitespace-nowrap"
              >
                Staff
              </th>
              {policies.map((p) => (
                <th
                  key={p.id}
                  scope="col"
                  className="px-2 py-3 font-semibold text-foreground/80 text-center border-b border-border whitespace-nowrap"
                  title={p.title}
                >
                  <div className="max-w-[8rem] truncate text-xs font-medium">
                    {p.title}
                  </div>
                  <div className="text-[10px] text-muted">v{p.version}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.userId} className="group">
                <th
                  scope="row"
                  className="sticky left-0 z-[5] bg-card group-hover:bg-surface/30 text-left px-4 py-2 border-b border-border/50 whitespace-nowrap"
                >
                  <div className="flex items-center gap-3">
                    <StaffAvatar user={{ id: row.userId, name: row.userName }} size="xs" />
                    <div>
                      <div className="font-medium text-foreground">{row.userName}</div>
                      <div className="text-xs text-muted">{row.serviceName}</div>
                    </div>
                  </div>
                </th>
                {policies.map((p) => {
                  const ack = row.acknowledgements.find((a) => a.policyId === p.id);
                  const status = !ack
                    ? "missing"
                    : ack.policyVersion === p.version
                    ? "acknowledged"
                    : "stale";
                  return (
                    <td
                      key={p.id}
                      className="px-1 py-2 text-center border-b border-border/50 group-hover:bg-surface/30"
                      data-cell-user={row.userId}
                      data-cell-policy={p.id}
                    >
                      <div className="flex justify-center">
                        <PolicyHeatMapCell
                          status={status}
                          ackedVersion={ack?.policyVersion ?? null}
                          currentVersion={p.version}
                          policyTitle={p.title}
                          userName={row.userName}
                          acknowledgedAt={ack?.acknowledgedAt ?? null}
                        />
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  colorClass = "text-brand bg-brand/5",
}: {
  label: string;
  value: number;
  colorClass?: string;
}) {
  return (
    <div className={`rounded-xl p-4 text-center ${colorClass}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs font-medium mt-0.5">{label}</div>
    </div>
  );
}
