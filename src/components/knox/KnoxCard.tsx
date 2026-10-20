"use client";

import { useId, useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useApproveAction, useDismissAction, type KnoxPendingAction } from "@/hooks/useKnox";
import { followUpTodoLines, formatKnoxTime } from "@/lib/knox/format";

/**
 * One open Knox suggestion. Approving applies the change Knox stored at
 * propose time (the client never sends or alters it); dismissing records an
 * optional reason.
 */
export function KnoxCard({ card }: { card: KnoxPendingAction }) {
  const approve = useApproveAction();
  const dismiss = useDismissAction();
  const [dismissing, setDismissing] = useState(false);
  const [reason, setReason] = useState("");
  const reasonId = useId();
  const busy = approve.isPending || dismiss.isPending;
  const todoLines = card.kind === "create_followup_todos" ? followUpTodoLines(card.payload) : [];

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <div>
        <p className="text-sm font-medium text-foreground">Knox suggests: {card.summary}</p>
        {todoLines.length > 0 && (
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-foreground" aria-label="To-dos this creates">
            {todoLines.map((line, i) => (
              <li key={`${i}-${line}`}>{line}</li>
            ))}
          </ul>
        )}
        {card.rationale && <p className="mt-0.5 text-sm text-muted">{card.rationale}</p>}
        <p className="mt-1 text-2xs text-muted">
          Open until {formatKnoxTime(card.expiresAt)}
        </p>
      </div>

      {dismissing ? (
        <div className="space-y-2">
          <label htmlFor={reasonId} className="block text-xs font-medium text-foreground">
            Why not? <span className="text-muted">(optional)</span>
          </label>
          <textarea
            id={reasonId}
            rows={2}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-base sm:text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              loading={dismiss.isPending}
              disabled={busy}
              onClick={() => dismiss.mutate({ id: card.id, reason })}
            >
              Dismiss suggestion
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setDismissing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            loading={approve.isPending}
            disabled={busy}
            iconLeft={<Check className="h-4 w-4" />}
            onClick={() => approve.mutate({ id: card.id, serviceId: card.serviceId })}
          >
            Approve
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            iconLeft={<X className="h-4 w-4" />}
            onClick={() => setDismissing(true)}
          >
            Dismiss
          </Button>
        </div>
      )}
    </div>
  );
}
