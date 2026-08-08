"use client";

import { useState } from "react";
import { X, MailOpen, MousePointerClick, Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEscapeClose } from "@/hooks/useEscapeClose";
import {
  useSendReport,
  useCancelScheduledSend,
} from "@/hooks/useEmailTemplates";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  sent: { bg: "bg-green-100 dark:bg-green-950/50", text: "text-green-700" },
  partial: { bg: "bg-amber-100 dark:bg-amber-950/50", text: "text-amber-700" },
  failed: { bg: "bg-red-100 dark:bg-red-950/50", text: "text-red-700" },
  scheduled: { bg: "bg-blue-100 dark:bg-blue-950/50", text: "text-blue-700" },
  // Deliberately neutral — a cancelled send is a non-event, not an error.
  cancelled: { bg: "bg-foreground/10", text: "text-muted" },
};

/**
 * Per-send engagement report slide-over. Data conventions (mirrors the
 * /api/email/reports route):
 * - Rates use the post-suppression attempted-recipient count as denominator.
 * - The 24h curve excludes later events (they still count in the totals).
 * - Link table counts recipients whose FIRST click was that link.
 */
export function SendReportPanel({
  deliveryLogId,
  onClose,
}: {
  deliveryLogId: string;
  onClose: () => void;
}) {
  useEscapeClose(onClose);
  const { data, isLoading, isError } = useSendReport(deliveryLogId);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const cancelSend = useCancelScheduledSend();

  const maxHourly = data
    ? Math.max(...data.hourly.map((h) => h.opens + h.clicks), 1)
    : 1;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="bg-card w-full sm:max-w-xl h-full overflow-y-auto border-l border-border p-5 sm:p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Send report"
      >
        {isError ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <p className="text-sm text-muted">
              Report not available for this send
            </p>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        ) : isLoading || !data ? (
          <Skeleton className="h-64 rounded-lg" />
        ) : (
          <>
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-2xs font-mono text-muted uppercase tracking-wide">
                  Send report
                  {data.log.messageType
                    ? ` · ${data.log.messageType.replace(/_/g, " ")}`
                    : ""}
                </div>
                <h2 className="text-xl font-heading font-semibold tracking-tight text-foreground mt-1 truncate">
                  {data.log.subject ?? "Untitled send"}
                </h2>
                <div className="text-sm text-muted mt-1 flex items-center gap-2 flex-wrap">
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded-full text-2xs font-medium",
                      STATUS_COLORS[data.log.status]?.bg ?? "bg-surface",
                      STATUS_COLORS[data.log.status]?.text ?? "text-muted",
                    )}
                  >
                    {data.log.status}
                  </span>
                  <span>
                    {new Date(data.log.createdAt).toLocaleDateString("en-AU", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span>· {data.log.recipientCount} recipients</span>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-foreground transition-colors shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Actions — kept ABOVE the !hasEvents branch: a scheduled send
                has no events yet, and hiding Cancel there would defeat it. */}
            {data.canCancel && (
              <div className="mt-4">
                <Button
                  variant="destructive"
                  size="sm"
                  iconLeft={<Ban className="h-3.5 w-3.5" />}
                  onClick={() => setConfirmCancel(true)}
                >
                  Cancel scheduled send
                </Button>
                <ConfirmDialog
                  open={confirmCancel}
                  onOpenChange={setConfirmCancel}
                  title="Cancel this scheduled send?"
                  description={`"${data.log.subject ?? "This send"}" to ${data.log.recipientCount} recipient(s) will not go out. This cannot be undone.`}
                  confirmLabel="Cancel send"
                  variant="danger"
                  loading={cancelSend.isPending}
                  onConfirm={() =>
                    cancelSend.mutate(deliveryLogId, {
                      onSuccess: () => setConfirmCancel(false),
                    })
                  }
                />
              </div>
            )}

            {!data.hasEvents ? (
              <div className="mt-8 rounded-xl border border-border bg-surface px-4 py-8 text-center">
                <p className="text-sm text-muted">
                  No tracking data — this send predates event tracking or
                  hasn&apos;t been opened yet
                </p>
              </div>
            ) : (
              <div className="mt-6 space-y-6">
                {/* Headline rates */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-surface rounded-xl p-4 border border-border">
                    <div className="flex items-center gap-2 mb-1">
                      <MailOpen className="h-3.5 w-3.5 text-foreground/40" />
                      <span className="text-2xs font-medium text-foreground/50 uppercase tracking-wide">
                        Unique opens
                      </span>
                    </div>
                    <p className="text-2xl font-bold text-foreground">
                      {data.stats.uniqueOpens.toLocaleString()}
                      <span className="text-sm font-medium text-muted ml-2">
                        {data.stats.openRate}%
                      </span>
                    </p>
                  </div>
                  <div className="bg-surface rounded-xl p-4 border border-border">
                    <div className="flex items-center gap-2 mb-1">
                      <MousePointerClick className="h-3.5 w-3.5 text-foreground/40" />
                      <span className="text-2xs font-medium text-foreground/50 uppercase tracking-wide">
                        Unique clicks
                      </span>
                    </div>
                    <p className="text-2xl font-bold text-foreground">
                      {data.stats.uniqueClicks.toLocaleString()}
                      <span className="text-sm font-medium text-muted ml-2">
                        {data.stats.clickRate}%
                      </span>
                    </p>
                  </div>
                </div>

                {/* Delivered / bounced */}
                <div className="flex items-center gap-6 rounded-xl border border-border bg-surface px-4 py-3 text-sm">
                  <div>
                    <span className="text-muted">Delivered</span>{" "}
                    <span className="font-semibold text-foreground">
                      {data.stats.delivered.toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted">Bounced</span>{" "}
                    <span
                      className={cn(
                        "font-semibold",
                        data.stats.bounced > 0 ? "text-red-600" : "text-foreground",
                      )}
                    >
                      {data.stats.bounced.toLocaleString()}
                    </span>
                  </div>
                </div>
                <p className="text-2xs text-muted -mt-4">
                  Rates are calculated against {data.log.recipientCount}{" "}
                  attempted recipients (after suppression), not deliveries.
                </p>

                {/* First-24h curve */}
                <div className="bg-surface rounded-xl p-4 border border-border">
                  <p className="text-xs font-medium text-foreground/50 mb-3">
                    First 24 hours
                  </p>
                  <div className="flex items-end gap-[2px] h-24">
                    {data.hourly.map((h) => (
                      <div
                        key={h.hour}
                        className="flex-1 flex flex-col justify-end gap-[1px] group relative"
                        title={`Hour ${h.hour}: ${h.opens} opens, ${h.clicks} clicks`}
                      >
                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 hidden group-hover:block bg-foreground text-background text-2xs px-1.5 py-0.5 rounded whitespace-nowrap z-10">
                          {h.opens}o / {h.clicks}c
                        </div>
                        <div
                          className="bg-brand rounded-t"
                          style={{
                            height: `${(h.clicks / maxHourly) * 100}%`,
                            minHeight: h.clicks > 0 ? "3px" : "0",
                          }}
                        />
                        <div
                          className="bg-brand/40 rounded-t"
                          style={{
                            height: `${(h.opens / maxHourly) * 100}%`,
                            minHeight: h.opens > 0 ? "3px" : "0",
                          }}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between mt-1 text-2xs text-foreground/30">
                    <span>Send</span>
                    <span>+24h</span>
                  </div>
                  <p className="text-2xs text-muted mt-2 flex items-center gap-3">
                    <span className="inline-flex items-center gap-1">
                      <span className="inline-block h-2 w-2 rounded-sm bg-brand/40" />
                      Opens
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="inline-block h-2 w-2 rounded-sm bg-brand" />
                      Clicks
                    </span>
                    <span>· events after 24h count in totals only</span>
                  </p>
                </div>

                {/* Top links */}
                {data.topLinks.length > 0 && (
                  <div className="bg-surface rounded-xl border border-border overflow-hidden">
                    <div className="px-4 py-3 border-b border-border">
                      <p className="text-xs font-medium text-foreground/50">
                        Top links
                      </p>
                    </div>
                    <div className="divide-y divide-border">
                      {data.topLinks.map((l) => (
                        <div
                          key={l.link}
                          className="px-4 py-2.5 flex items-center gap-3 text-xs"
                        >
                          <span className="flex-1 min-w-0 truncate text-foreground" title={l.link}>
                            {l.link}
                          </span>
                          <span className="font-semibold text-foreground whitespace-nowrap">
                            {l.clickers.toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="text-2xs text-muted px-4 py-2 border-t border-border">
                      Counts recipients whose first click was this link — later
                      clicks by the same recipient aren&apos;t tracked.
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
