"use client";

import { Check, Copy, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";
import {
  acknowledgedAt,
  assessmentClocks,
  subjectAcknowledgedAt,
  subjectNeedsAck,
  useAcknowledge,
  useCanUseKnox,
  useKnoxSubject,
  type KnoxAssessment,
  type KnoxClockData,
  type KnoxPendingAction,
} from "@/hooks/useKnox";
import {
  fillChildName,
  flaggedHeadline,
  formatKnoxTime,
  type KnoxSubjectType,
} from "@/lib/knox/format";
import { KnoxClock, useNow } from "./KnoxClock";
import { KnoxCard } from "./KnoxCard";
import { KnoxTierChip, tierTint } from "./KnoxBadge";

function isOpen(card: KnoxPendingAction, now: number): boolean {
  return !card.committedAt && !card.dismissedAt && new Date(card.expiresAt).getTime() > now;
}

function rationaleText(a: KnoxAssessment): string | null {
  if (!a.rationale) return null;
  return a.source === "rules_and_model" ? `Knox suggests: ${a.rationale}` : a.rationale;
}

/**
 * Acknowledge control. The button shows ONLY when the caller says the record
 * still needs acknowledging (alerts went out and nothing covers them — the API
 * 409s otherwise); acknowledging stamps every alert of the record. The alert
 * rows carry no acknowledger name, so the confirmation shows the time alone.
 */
export function KnoxAckControl({
  assessmentId,
  showButton,
  acknowledgedAt: at,
}: {
  assessmentId: string;
  showButton: boolean;
  acknowledgedAt: string | null;
}) {
  const ack = useAcknowledge();
  if (showButton) {
    return (
      <Button
        size="sm"
        loading={ack.isPending}
        iconLeft={<Check className="h-4 w-4" />}
        onClick={() => ack.mutate(assessmentId)}
      >
        Acknowledge
      </Button>
    );
  }
  if (!at) return null;
  return (
    <p className="inline-flex items-center gap-1 text-xs text-muted">
      <Check className="h-3.5 w-3.5" aria-hidden />
      Acknowledged at {formatKnoxTime(at)}
    </p>
  );
}

function DraftBlock({ title, text, childName }: { title: string; text: string; childName?: string | null }) {
  const filled = fillChildName(text, childName);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(filled);
      toast({ description: `${title} copied` });
    } catch {
      toast({ variant: "destructive", description: "Couldn't copy — select the text and copy it instead" });
    }
  };
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-foreground">{title} (Knox draft — check before sending)</p>
        <Button size="xs" variant="ghost" iconLeft={<Copy className="h-3.5 w-3.5" />} onClick={copy}>
          Copy
        </Button>
      </div>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-surface p-3 font-sans text-sm text-foreground">
        {filled}
      </pre>
    </div>
  );
}

function AssessmentDetail({
  assessment,
  childName,
  needsAck,
  ackAt,
  clocks,
}: {
  assessment: KnoxAssessment;
  /** Live clocks for the record (recomputed now), not the stored snapshot. */
  clocks: KnoxClockData[];
  childName?: string | null;
  /** Record-level: some assessment of this record still needs acknowledging. */
  needsAck: boolean;
  /** Record-level: newest acknowledgement time, if any. */
  ackAt: string | null;
}) {
  const rationale = rationaleText(assessment);
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">
          {flaggedHeadline(assessment.ruleHits, assessment.tier)}
        </p>
        {rationale && <p className="text-sm text-foreground/85">{rationale}</p>}
      </div>

      {clocks.length > 0 && (
        <div className="space-y-1">
          {clocks.map((c) => (
            <KnoxClock key={`${c.kind}-${c.dueAt}`} clock={c} />
          ))}
        </div>
      )}

      {assessment.missingFields.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted">Knox flagged missing:</span>
          {assessment.missingFields.map((f) => (
            <span key={f} className="rounded-full border border-border bg-card px-2 py-0.5 text-2xs text-foreground">
              {f}
            </span>
          ))}
        </div>
      )}

      <KnoxAckControl assessmentId={assessment.id} showButton={needsAck} acknowledgedAt={ackAt} />

      {(assessment.parentNoticeDraft || assessment.regulatorPackDraft) && (
        <div className="space-y-3">
          {assessment.parentNoticeDraft && (
            <DraftBlock title="Parent notice" text={assessment.parentNoticeDraft} childName={childName} />
          )}
          {assessment.regulatorPackDraft && (
            <DraftBlock title="Regulator pack" text={assessment.regulatorPackDraft} childName={childName} />
          )}
        </div>
      )}
    </div>
  );
}

function ResolvedCardLine({ card }: { card: KnoxPendingAction }) {
  const status = card.committedAt
    ? `Approved ${formatKnoxTime(card.committedAt)}`
    : card.dismissedAt
      ? `Dismissed ${formatKnoxTime(card.dismissedAt)}${card.dismissReason ? ` — ${card.dismissReason}` : ""}`
      : `Expired ${formatKnoxTime(card.expiresAt)}`;
  return (
    <li className="text-xs text-muted">
      <span className="text-foreground">{card.summary}</span> · {status}
    </li>
  );
}

export interface KnoxPanelProps {
  subjectType: KnoxSubjectType;
  subjectId: string;
  /** Used to fill `{{child_name}}` in drafts (first name only). */
  childName?: string | null;
  /** From an alert deep link: opens History when that assessment is not the latest. */
  focusAssessmentId?: string;
}

/** Knox's triage for one record: latest assessment, open cards, drafts and history. */
export function KnoxPanel({ subjectType, subjectId, childName, focusAssessmentId }: KnoxPanelProps) {
  const canUse = useCanUseKnox();
  const { data, isLoading, isError, error, refetch } = useKnoxSubject(subjectType, subjectId);
  const now = useNow();

  if (!canUse) return null;

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 space-y-2" aria-busy="true">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-full max-w-md" />
        <Skeleton className="h-4 w-48" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm text-muted">
        <ShieldAlert className="h-4 w-4" aria-hidden />
        Couldn&apos;t load Knox triage{error instanceof Error && error.message ? `: ${error.message}` : ""}.
        <Button size="xs" variant="secondary" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const assessments = data?.assessments ?? [];
  const cards = data?.cards ?? [];
  const [latest, ...earlier] = assessments;

  if (!latest) {
    return (
      <p className="inline-flex items-center gap-1.5 text-xs text-muted">
        <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
        Knox hasn&apos;t assessed this record yet.
      </p>
    );
  }

  const openCards = cards.filter((c) => isOpen(c, now));
  const resolvedCards = cards.filter((c) => !isOpen(c, now));

  return (
    <section
      aria-label="Knox triage"
      className={cn("rounded-xl border p-4 space-y-4", tierTint(latest.tier))}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex flex-wrap items-center gap-2">
        <KnoxTierChip tier={latest.tier} />
        <span className="text-2xs text-muted">Assessed {formatKnoxTime(latest.createdAt)}</span>
      </div>

      <AssessmentDetail
        assessment={latest}
        childName={childName}
        needsAck={subjectNeedsAck(assessments)}
        ackAt={subjectAcknowledgedAt(assessments)}
        clocks={data?.liveClocks ?? assessmentClocks(latest)}
      />

      {openCards.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Waiting for your decision</p>
          {openCards.map((c) => (
            <KnoxCard key={c.id} card={c} />
          ))}
        </div>
      )}

      {(earlier.length > 0 || resolvedCards.length > 0) && (
        <details open={!!focusAssessmentId && earlier.some((a) => a.id === focusAssessmentId)}>
          <summary className="cursor-pointer text-xs font-medium text-muted hover:text-foreground">
            History ({earlier.length} earlier {earlier.length === 1 ? "assessment" : "assessments"}
            {resolvedCards.length > 0 && `, ${resolvedCards.length} closed ${resolvedCards.length === 1 ? "card" : "cards"}`})
          </summary>
          <div className="mt-3 space-y-4">
            {earlier.map((a) => (
              <div key={a.id} className="space-y-2 border-l-2 border-border pl-3">
                <div className="flex flex-wrap items-center gap-2">
                  <KnoxTierChip tier={a.tier} />
                  <span className="text-2xs text-muted">{formatKnoxTime(a.createdAt)}</span>
                </div>
                <p className="text-sm text-foreground">{flaggedHeadline(a.ruleHits, a.tier)}</p>
                {rationaleText(a) && <p className="text-xs text-muted">{rationaleText(a)}</p>}
                <KnoxAckControl assessmentId={a.id} showButton={false} acknowledgedAt={acknowledgedAt(a)} />
              </div>
            ))}
            {resolvedCards.length > 0 && <ul className="space-y-1">{resolvedCards.map((c) => <ResolvedCardLine key={c.id} card={c} />)}</ul>}
          </div>
        </details>
      )}
    </section>
  );
}
