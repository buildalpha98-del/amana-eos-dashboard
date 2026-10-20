"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertOctagon, BellRing, ClipboardCheck, History, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { KnoxPanel, KnoxAckControl } from "@/components/knox/KnoxPanel";
import { KnoxCard } from "@/components/knox/KnoxCard";
import { KnoxTierChip, tierTint } from "@/components/knox/KnoxBadge";
import {
  acknowledgedAt,
  needsAcknowledgement,
  useKnoxAccess,
  useKnoxInbox,
  type KnoxAssessment,
} from "@/hooks/useKnox";
import { ApiResponseError } from "@/lib/fetch-api";
import {
  SUBJECT_LABELS,
  flaggedHeadline,
  formatKnoxTime,
  parseSubjectRef,
  subjectHref,
  type KnoxSubjectType,
} from "@/lib/knox/format";
import { cn } from "@/lib/utils";

function Section({
  title,
  icon: Icon,
  count,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-base font-heading font-semibold text-foreground">
        <Icon className="h-4 w-4 text-muted" />
        {title}
        {count !== undefined && count > 0 && (
          <span className="rounded-full bg-surface px-2 py-0.5 text-2xs font-medium text-muted">{count}</span>
        )}
      </h2>
      {children}
    </section>
  );
}

function SubjectLink({ type, id, assessmentId }: { type: KnoxSubjectType; id: string; assessmentId?: string }) {
  return (
    <Link href={subjectHref(type, id, assessmentId)} className="text-xs font-medium text-brand hover:underline">
      Open {SUBJECT_LABELS[type].toLowerCase()}
    </Link>
  );
}

function AssessmentItem({ assessment, showAck }: { assessment: KnoxAssessment; showAck?: boolean }) {
  return (
    <li className={cn("rounded-lg border p-3 space-y-1.5", tierTint(assessment.tier))}>
      <div className="flex flex-wrap items-center gap-2">
        <KnoxTierChip tier={assessment.tier} />
        <span className="text-xs font-medium text-foreground">{SUBJECT_LABELS[assessment.subjectType]}</span>
        {assessment.service?.name && <span className="text-xs text-muted">· {assessment.service.name}</span>}
        <span className="text-2xs text-muted">· {formatKnoxTime(assessment.createdAt)}</span>
      </div>
      <p className="text-sm text-foreground">{flaggedHeadline(assessment.ruleHits, assessment.tier)}</p>
      <div className="flex flex-wrap items-center gap-3">
        {showAck && (
          <KnoxAckControl
            assessmentId={assessment.id}
            showButton={needsAcknowledgement(assessment)}
            acknowledgedAt={acknowledgedAt(assessment)}
          />
        )}
        <SubjectLink type={assessment.subjectType} id={assessment.subjectId} assessmentId={assessment.id} />
      </div>
    </li>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-lg" />
      ))}
    </div>
  );
}

function SubjectPanel({ raw }: { raw: string }) {
  const subject = parseSubjectRef(raw);
  if (!subject) {
    return <p className="text-sm text-muted">That Knox link isn&apos;t one we recognise.</p>;
  }
  return (
    <Section title={`${SUBJECT_LABELS[subject.type]} — Knox triage`} icon={ShieldAlert}>
      <KnoxPanel subjectType={subject.type} subjectId={subject.id} />
    </Section>
  );
}

function KnoxInboxContent() {
  const searchParams = useSearchParams();
  const subjectParam = searchParams.get("subject");
  const { canUse, loading: sessionLoading } = useKnoxAccess();
  const { data, isLoading, isError, error, refetch } = useKnoxInbox();

  if (sessionLoading) return <ListSkeleton />;

  if (!canUse) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Knox isn't available for your role"
        description="Knox alerts and approvals go to Directors of Service and leadership."
      />
    );
  }

  const forbidden = error instanceof ApiResponseError && error.status === 403;

  return (
    <div className="space-y-8">
      {subjectParam && <SubjectPanel raw={subjectParam} />}

      {isError ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm text-muted">
          <ShieldAlert className="h-4 w-4" aria-hidden />
          {forbidden ? "Knox isn't available for your role." : "Couldn't load the Knox inbox."}
          {!forbidden && (
            <Button size="xs" variant="secondary" onClick={() => refetch()}>
              Retry
            </Button>
          )}
        </div>
      ) : (
        <>
          <Section title="Awaiting acknowledgement" icon={BellRing} count={data?.awaitingAck.length}>
            {isLoading ? (
              <ListSkeleton />
            ) : data && data.awaitingAck.length > 0 ? (
              <ul className="space-y-2">
                {data.awaitingAck.map((a) => (
                  <AssessmentItem key={a.id} assessment={a} showAck />
                ))}
              </ul>
            ) : (
              <EmptyState icon={BellRing} variant="inline" title="Nothing waiting" description="Every Knox alert has been acknowledged." />
            )}
          </Section>

          <Section title="Pending cards" icon={ClipboardCheck} count={data?.openCards.length}>
            {isLoading ? (
              <ListSkeleton />
            ) : data && data.openCards.length > 0 ? (
              <div className="space-y-2">
                {data.openCards.map((c) => (
                  <div key={c.id} className="space-y-1">
                    {c.subjectType && c.subjectId && (
                      <div className="flex items-center gap-2 text-xs text-muted">
                        <span>{SUBJECT_LABELS[c.subjectType]}</span>
                        <span>·</span>
                        <SubjectLink type={c.subjectType} id={c.subjectId} assessmentId={c.assessmentId ?? undefined} />
                      </div>
                    )}
                    <KnoxCard card={c} />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={ClipboardCheck} variant="inline" title="No suggestions to review" />
            )}
          </Section>

          <Section title="Recent assessments (7 days)" icon={History} count={data?.recent.length}>
            {isLoading ? (
              <ListSkeleton />
            ) : data && data.recent.length > 0 ? (
              <ul className="space-y-2">
                {data.recent.map((a) => (
                  <AssessmentItem key={a.id} assessment={a} />
                ))}
              </ul>
            ) : (
              <EmptyState icon={History} variant="inline" title="No assessments this week" />
            )}
          </Section>

          {data && data.failedJobs.length > 0 && (
            <Section title="Failed jobs" icon={AlertOctagon} count={data.failedJobs.length}>
              <ul className="divide-y divide-border rounded-lg border border-border bg-card">
                {data.failedJobs.map((j) => (
                  <li key={j.id} className="p-3 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-medium text-foreground">{SUBJECT_LABELS[j.subjectType]}</span>
                      <span className="text-muted">
                        · {j.reason} · {j.attempts} {j.attempts === 1 ? "attempt" : "attempts"} · {formatKnoxTime(j.updatedAt)}
                      </span>
                      <SubjectLink type={j.subjectType} id={j.subjectId} />
                    </div>
                    {j.lastError && <p className="break-words font-mono text-xs text-danger">{j.lastError}</p>}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      )}
    </div>
  );
}

export default function KnoxPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Knox" description="Incident triage: alerts, clocks and approvals" />
      <Suspense fallback={<ListSkeleton />}>
        <KnoxInboxContent />
      </Suspense>
    </div>
  );
}
