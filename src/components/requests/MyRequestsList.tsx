"use client";

import { useCreativeRequests } from "@/hooks/useCreativeRequests";
import { STATUS_LABELS, TYPE_LABELS } from "@/lib/creative-request/constants";
import { Skeleton } from "@/components/ui/Skeleton";

const STATUS_BADGE: Record<string, string> = {
  new: "bg-surface text-muted",
  briefed: "bg-status-confirmed-bg text-status-confirmed-fg",
  in_progress: "bg-status-confirmed-bg text-status-confirmed-fg",
  in_review: "bg-status-pending-bg text-status-pending-fg",
  changes_requested: "bg-status-pending-bg text-status-pending-fg",
  approved: "bg-status-in-care-bg text-status-in-care-fg",
  delivered: "bg-status-in-care-bg text-status-in-care-fg",
  cancelled: "bg-surface text-muted",
};

/** Plain-language status for requesters (JSM portal pattern). */
const REQUESTER_STATUS: Record<string, string> = {
  new: "Submitted — awaiting triage",
  briefed: "Brief confirmed",
  in_progress: "Being designed",
  in_review: "Ready for your review",
  changes_requested: "Changes underway",
  approved: "Approved",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export function MyRequestsList({ onOpen }: { onOpen: (id: string) => void }) {
  const { data, isLoading } = useCreativeRequests();

  if (isLoading) return <Skeleton className="h-48 rounded-lg" />;
  const requests = data?.requests ?? [];

  if (requests.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-8 text-center">
        <p className="text-sm text-muted">
          No requests yet. Need a poster, flyer or table cover? Hit “New request”.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="px-4 py-2.5 text-2xs font-semibold uppercase tracking-wide text-muted">Request</th>
            <th className="px-4 py-2.5 text-2xs font-semibold uppercase tracking-wide text-muted">Type</th>
            <th className="px-4 py-2.5 text-2xs font-semibold uppercase tracking-wide text-muted">Status</th>
            <th className="px-4 py-2.5 text-2xs font-semibold uppercase tracking-wide text-muted">Due</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <tr
              key={r.id}
              onClick={() => onOpen(r.id)}
              className="border-b border-border last:border-0 cursor-pointer hover:bg-surface"
            >
              <td className="px-4 py-3">
                <span className="font-mono text-2xs text-muted mr-2">{r.requestNumber}</span>
                <span className="text-foreground font-medium">{r.title}</span>
              </td>
              <td className="px-4 py-3 text-muted">{TYPE_LABELS[r.type]}</td>
              <td className="px-4 py-3">
                <span className={`text-2xs font-semibold rounded px-2 py-0.5 ${STATUS_BADGE[r.status] ?? ""}`}>
                  {REQUESTER_STATUS[r.status] ?? STATUS_LABELS[r.status]}
                </span>
              </td>
              <td className="px-4 py-3 text-muted whitespace-nowrap">
                {new Date(r.dueDate).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
