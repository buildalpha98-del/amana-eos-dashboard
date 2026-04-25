"use client";

import type { VendorBriefListItem } from "@/hooks/useVendorBriefs";
import { SlaPill } from "./sla-pill";
import { StatusPill } from "./status-pill";

const TYPE_LABELS: Record<string, string> = {
  signage: "Signage",
  uniform: "Uniform",
  print_collateral: "Print",
  merchandise: "Merch",
  event_supplies: "Event",
  other: "Other",
};

export function BriefTable({
  briefs,
  onOpenBrief,
}: {
  briefs: VendorBriefListItem[];
  onOpenBrief: (id: string) => void;
}) {
  if (briefs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-surface/30 px-4 py-8 text-center text-sm text-muted">
        No briefs match this filter.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-surface/40 text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Brief #</th>
            <th className="px-3 py-2 text-left font-medium">Title</th>
            <th className="px-3 py-2 text-left font-medium">Type</th>
            <th className="px-3 py-2 text-left font-medium">Centre</th>
            <th className="px-3 py-2 text-left font-medium">Vendor</th>
            <th className="px-3 py-2 text-left font-medium">Status</th>
            <th className="px-3 py-2 text-left font-medium">SLA</th>
          </tr>
        </thead>
        <tbody>
          {briefs.map((b) => (
            <tr
              key={b.id}
              onClick={() => onOpenBrief(b.id)}
              className="cursor-pointer border-b border-border/60 transition-colors hover:bg-surface/40"
            >
              <td className="px-3 py-2 font-mono text-xs text-foreground/80">
                {b.briefNumber}
                {b.escalatedAt && (
                  <span className="ml-2 rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">
                    escalated
                  </span>
                )}
              </td>
              <td className="px-3 py-2 max-w-md truncate text-foreground">
                {b.title}
              </td>
              <td className="px-3 py-2 text-xs text-foreground/80">
                {TYPE_LABELS[b.type] ?? b.type}
              </td>
              <td className="px-3 py-2 text-xs text-foreground/80">
                {b.serviceName ?? <span className="italic text-muted">Portfolio</span>}
              </td>
              <td className="px-3 py-2 text-xs text-foreground/80">
                {b.vendorContactName ?? <span className="italic text-muted">—</span>}
              </td>
              <td className="px-3 py-2">
                <StatusPill status={b.status} />
              </td>
              <td className="px-3 py-2">
                <SlaPill state={b.slaState} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
