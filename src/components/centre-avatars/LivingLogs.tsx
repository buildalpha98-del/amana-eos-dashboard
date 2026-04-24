"use client";

import { useState } from "react";
import {
  Plus,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { toast } from "@/hooks/useToast";
import {
  useAddCampaignLog,
  useAddCheckIn,
  useAddInsight,
  useAddSchoolLiaison,
  useApproveInsight,
  useDismissInsight,
  type CampaignLogRow,
  type CheckInRow,
  type InsightRow,
  type LiaisonRow,
  type UpdateLogRow,
} from "@/hooks/useCentreAvatars";
import type { CentreAvatarInsightSource } from "@prisma/client";

const INSIGHT_SOURCES: CentreAvatarInsightSource[] = [
  "coordinator_checkin",
  "parent_conversation",
  "parent_feedback",
  "complaint",
  "compliment",
  "social_comment_or_dm",
  "whatsapp_message",
  "enrolment_conversation",
  "exit_conversation",
  "other",
];

// ---------------------------------------------------------------------------
// Insights Log
// ---------------------------------------------------------------------------

export function InsightsLog({
  serviceId,
  insights,
}: {
  serviceId: string;
  insights: InsightRow[];
}) {
  const [adding, setAdding] = useState(false);
  const add = useAddInsight();
  const approve = useApproveInsight();
  const dismiss = useDismissInsight();

  const pending = insights.filter((i) => i.status === "pending_review");
  const visible = insights.filter((i) => i.status !== "dismissed");

  return (
    <LogSection
      title="Insights log"
      description={
        pending.length > 0
          ? `${pending.length} harvested insight${pending.length === 1 ? "" : "s"} awaiting review.`
          : "Harvested from NPS, quick feedback and parent feedback each morning."
      }
      onAdd={() => setAdding((v) => !v)}
      adding={adding}
    >
      {adding && (
        <InsightAddForm
          onCancel={() => setAdding(false)}
          onSubmit={async (data) => {
            try {
              await add.mutateAsync({ serviceId, ...data });
              setAdding(false);
              toast({ description: "Insight added." });
            } catch (err) {
              toast({
                variant: "destructive",
                description: err instanceof Error ? err.message : "Failed to add insight.",
              });
            }
          }}
          isSaving={add.isPending}
        />
      )}

      {visible.length === 0 ? (
        <p className="text-xs italic text-muted">No insights yet.</p>
      ) : (
        <ul className="space-y-2">
          {visible.map((i) => (
            <li
              key={i.id}
              className={`rounded-lg border px-3 py-2 ${
                i.status === "pending_review"
                  ? "border-amber-200 bg-amber-50/60"
                  : "border-border bg-surface/30"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span className="font-medium text-foreground/80">{formatDate(i.occurredAt)}</span>
                    <span className="rounded-full bg-surface px-2 py-0.5">{i.source.replace(/_/g, " ")}</span>
                    {i.harvestedFrom && (
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">
                        harvested · {i.harvestedFrom.replace(/_/g, " ")}
                      </span>
                    )}
                    {i.status === "pending_review" && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">
                        pending review
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-foreground">{i.insight}</p>
                  {i.impactOnAvatar && (
                    <p className="mt-1 text-xs text-muted">
                      <span className="font-medium text-foreground/70">Impact:</span> {i.impactOnAvatar}
                    </p>
                  )}
                </div>
                {i.status === "pending_review" && (
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => approve.mutate({ serviceId, insightId: i.id })}
                      disabled={approve.isPending}
                      className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                      title="Approve"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => dismiss.mutate({ serviceId, insightId: i.id })}
                      disabled={dismiss.isPending}
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs text-muted hover:text-foreground"
                      title="Dismiss"
                    >
                      <XCircle className="h-3.5 w-3.5" /> Dismiss
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </LogSection>
  );
}

function InsightAddForm({
  onSubmit,
  onCancel,
  isSaving,
}: {
  onSubmit: (d: {
    occurredAt: string;
    source: CentreAvatarInsightSource;
    insight: string;
    impactOnAvatar?: string | null;
  }) => Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [occurredAt, setOccurredAt] = useState(new Date().toISOString().slice(0, 10));
  const [source, setSource] = useState<CentreAvatarInsightSource>("parent_feedback");
  const [insight, setInsight] = useState("");
  const [impactOnAvatar, setImpactOnAvatar] = useState("");

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!insight.trim()) return;
        await onSubmit({
          occurredAt: new Date(occurredAt).toISOString(),
          source,
          insight: insight.trim(),
          impactOnAvatar: impactOnAvatar.trim() || null,
        });
      }}
      className="space-y-2 rounded-lg border border-border bg-surface/40 p-3"
    >
      <div className="grid grid-cols-2 gap-2">
        <input
          type="date"
          value={occurredAt}
          onChange={(e) => setOccurredAt(e.target.value)}
          required
          className="rounded-md border border-border bg-card px-2 py-1 text-xs"
        />
        <select
          value={source}
          onChange={(e) => setSource(e.target.value as CentreAvatarInsightSource)}
          className="rounded-md border border-border bg-card px-2 py-1 text-xs"
        >
          {INSIGHT_SOURCES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>
      <textarea
        value={insight}
        onChange={(e) => setInsight(e.target.value)}
        placeholder="What did they say / do?"
        rows={2}
        required
        className="w-full rounded-md border border-border bg-card px-2 py-1 text-xs"
      />
      <textarea
        value={impactOnAvatar}
        onChange={(e) => setImpactOnAvatar(e.target.value)}
        placeholder="Impact on the Avatar (optional)"
        rows={2}
        className="w-full rounded-md border border-border bg-card px-2 py-1 text-xs"
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border bg-card px-3 py-1 text-xs text-foreground/80 hover:bg-surface"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSaving || !insight.trim()}
          className="inline-flex items-center gap-1 rounded-md bg-brand px-3 py-1 text-xs font-medium text-white hover:bg-brand-hover disabled:opacity-50"
        >
          {isSaving && <Loader2 className="h-3 w-3 animate-spin" />} Add
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Campaign Log
// ---------------------------------------------------------------------------

export function CampaignLog({
  serviceId,
  campaigns,
}: {
  serviceId: string;
  campaigns: CampaignLogRow[];
}) {
  const [adding, setAdding] = useState(false);
  const add = useAddCampaignLog();

  return (
    <LogSection
      title="Campaign log"
      description="Past campaigns run against this centre — content, outcomes, learnings."
      onAdd={() => setAdding((v) => !v)}
      adding={adding}
    >
      {adding && (
        <CampaignAddForm
          onCancel={() => setAdding(false)}
          onSubmit={async (d) => {
            try {
              await add.mutateAsync({ serviceId, ...d });
              setAdding(false);
              toast({ description: "Campaign logged." });
            } catch (err) {
              toast({
                variant: "destructive",
                description: err instanceof Error ? err.message : "Failed to log campaign.",
              });
            }
          }}
          isSaving={add.isPending}
        />
      )}
      {campaigns.length === 0 ? (
        <p className="text-xs italic text-muted">No campaigns logged yet.</p>
      ) : (
        <ul className="space-y-2">
          {campaigns.map((c) => (
            <li key={c.id} className="rounded-lg border border-border bg-surface/30 px-3 py-2">
              <div className="text-xs text-muted">{formatDate(c.occurredAt)}</div>
              <div className="mt-0.5 text-sm font-medium text-foreground">{c.campaignName}</div>
              {c.contentUsed && <p className="mt-1 text-xs text-muted"><span className="font-medium text-foreground/70">Content:</span> {c.contentUsed}</p>}
              {c.result && <p className="mt-1 text-xs text-muted"><span className="font-medium text-foreground/70">Result:</span> {c.result}</p>}
              {c.learnings && <p className="mt-1 text-xs text-muted"><span className="font-medium text-foreground/70">Learnings:</span> {c.learnings}</p>}
            </li>
          ))}
        </ul>
      )}
    </LogSection>
  );
}

function CampaignAddForm({
  onSubmit,
  onCancel,
  isSaving,
}: {
  onSubmit: (d: {
    occurredAt: string;
    campaignName: string;
    contentUsed?: string | null;
    result?: string | null;
    learnings?: string | null;
  }) => Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [occurredAt, setOccurredAt] = useState(new Date().toISOString().slice(0, 10));
  const [campaignName, setCampaignName] = useState("");
  const [contentUsed, setContentUsed] = useState("");
  const [result, setResult] = useState("");
  const [learnings, setLearnings] = useState("");

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!campaignName.trim()) return;
        await onSubmit({
          occurredAt: new Date(occurredAt).toISOString(),
          campaignName: campaignName.trim(),
          contentUsed: contentUsed.trim() || null,
          result: result.trim() || null,
          learnings: learnings.trim() || null,
        });
      }}
      className="space-y-2 rounded-lg border border-border bg-surface/40 p-3"
    >
      <div className="grid grid-cols-2 gap-2">
        <input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} required className="rounded-md border border-border bg-card px-2 py-1 text-xs" />
        <input type="text" value={campaignName} onChange={(e) => setCampaignName(e.target.value)} placeholder="Campaign name" required className="rounded-md border border-border bg-card px-2 py-1 text-xs" />
      </div>
      <textarea value={contentUsed} onChange={(e) => setContentUsed(e.target.value)} placeholder="Content used" rows={2} className="w-full rounded-md border border-border bg-card px-2 py-1 text-xs" />
      <textarea value={result} onChange={(e) => setResult(e.target.value)} placeholder="Result" rows={2} className="w-full rounded-md border border-border bg-card px-2 py-1 text-xs" />
      <textarea value={learnings} onChange={(e) => setLearnings(e.target.value)} placeholder="Learnings" rows={2} className="w-full rounded-md border border-border bg-card px-2 py-1 text-xs" />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-md border border-border bg-card px-3 py-1 text-xs hover:bg-surface">Cancel</button>
        <button type="submit" disabled={isSaving || !campaignName.trim()} className="inline-flex items-center gap-1 rounded-md bg-brand px-3 py-1 text-xs font-medium text-white hover:bg-brand-hover disabled:opacity-50">
          {isSaving && <Loader2 className="h-3 w-3 animate-spin" />} Add
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Coordinator Check-ins
// ---------------------------------------------------------------------------

export function CheckInsLog({
  serviceId,
  checkIns,
}: {
  serviceId: string;
  checkIns: CheckInRow[];
}) {
  const [adding, setAdding] = useState(false);
  const add = useAddCheckIn();

  return (
    <LogSection
      title="Coordinator check-ins"
      description="1:1 conversations with the coordinator — what came up, what to follow up on."
      onAdd={() => setAdding((v) => !v)}
      adding={adding}
    >
      {adding && (
        <CheckInAddForm
          onCancel={() => setAdding(false)}
          onSubmit={async (d) => {
            try {
              await add.mutateAsync({ serviceId, ...d });
              setAdding(false);
              toast({ description: "Check-in logged." });
            } catch (err) {
              toast({
                variant: "destructive",
                description: err instanceof Error ? err.message : "Failed to log check-in.",
              });
            }
          }}
          isSaving={add.isPending}
        />
      )}
      {checkIns.length === 0 ? (
        <p className="text-xs italic text-muted">No check-ins logged yet.</p>
      ) : (
        <ul className="space-y-2">
          {checkIns.map((c) => (
            <li key={c.id} className="rounded-lg border border-border bg-surface/30 px-3 py-2">
              <div className="text-xs text-muted">
                {formatDate(c.occurredAt)}
                {c.coordinator?.name ? ` · ${c.coordinator.name}` : ""}
              </div>
              <p className="mt-1 text-sm text-foreground"><span className="font-medium text-foreground/70">Topics:</span> {c.topicsDiscussed}</p>
              {c.actionItems && <p className="mt-1 text-xs text-muted"><span className="font-medium text-foreground/70">Actions:</span> {c.actionItems}</p>}
              {c.followUpDate && <p className="mt-1 text-xs text-muted">Follow-up: {formatDate(c.followUpDate)}</p>}
            </li>
          ))}
        </ul>
      )}
    </LogSection>
  );
}

function CheckInAddForm({
  onSubmit,
  onCancel,
  isSaving,
}: {
  onSubmit: (d: {
    occurredAt: string;
    topicsDiscussed: string;
    actionItems?: string | null;
    followUpDate?: string | null;
  }) => Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [occurredAt, setOccurredAt] = useState(new Date().toISOString().slice(0, 10));
  const [topics, setTopics] = useState("");
  const [actions, setActions] = useState("");
  const [followUp, setFollowUp] = useState("");

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!topics.trim()) return;
        await onSubmit({
          occurredAt: new Date(occurredAt).toISOString(),
          topicsDiscussed: topics.trim(),
          actionItems: actions.trim() || null,
          followUpDate: followUp ? new Date(followUp).toISOString() : null,
        });
      }}
      className="space-y-2 rounded-lg border border-border bg-surface/40 p-3"
    >
      <input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} required className="rounded-md border border-border bg-card px-2 py-1 text-xs" />
      <textarea value={topics} onChange={(e) => setTopics(e.target.value)} placeholder="Topics discussed" rows={2} required className="w-full rounded-md border border-border bg-card px-2 py-1 text-xs" />
      <textarea value={actions} onChange={(e) => setActions(e.target.value)} placeholder="Action items" rows={2} className="w-full rounded-md border border-border bg-card px-2 py-1 text-xs" />
      <div>
        <label className="mb-1 block text-xs text-muted">Follow-up date</label>
        <input type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} className="rounded-md border border-border bg-card px-2 py-1 text-xs" />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-md border border-border bg-card px-3 py-1 text-xs hover:bg-surface">Cancel</button>
        <button type="submit" disabled={isSaving || !topics.trim()} className="inline-flex items-center gap-1 rounded-md bg-brand px-3 py-1 text-xs font-medium text-white hover:bg-brand-hover disabled:opacity-50">
          {isSaving && <Loader2 className="h-3 w-3 animate-spin" />} Add
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// School Liaison Log
// ---------------------------------------------------------------------------

export function SchoolLiaisonLog({
  serviceId,
  liaisons,
}: {
  serviceId: string;
  liaisons: LiaisonRow[];
}) {
  const [adding, setAdding] = useState(false);
  const add = useAddSchoolLiaison();

  return (
    <LogSection
      title="School liaison log"
      description="Conversations with school contacts — principal, marketing, newsletter editors."
      onAdd={() => setAdding((v) => !v)}
      adding={adding}
    >
      {adding && (
        <LiaisonAddForm
          onCancel={() => setAdding(false)}
          onSubmit={async (d) => {
            try {
              await add.mutateAsync({ serviceId, ...d });
              setAdding(false);
              toast({ description: "Liaison logged." });
            } catch (err) {
              toast({
                variant: "destructive",
                description: err instanceof Error ? err.message : "Failed to log liaison.",
              });
            }
          }}
          isSaving={add.isPending}
        />
      )}
      {liaisons.length === 0 ? (
        <p className="text-xs italic text-muted">No school contacts logged yet.</p>
      ) : (
        <ul className="space-y-2">
          {liaisons.map((l) => (
            <li key={l.id} className="rounded-lg border border-border bg-surface/30 px-3 py-2">
              <div className="text-xs text-muted">{formatDate(l.occurredAt)} · {l.contactName}</div>
              <p className="mt-1 text-sm text-foreground"><span className="font-medium text-foreground/70">Purpose:</span> {l.purpose}</p>
              {l.outcome && <p className="mt-1 text-xs text-muted"><span className="font-medium text-foreground/70">Outcome:</span> {l.outcome}</p>}
              {l.nextStep && <p className="mt-1 text-xs text-muted"><span className="font-medium text-foreground/70">Next:</span> {l.nextStep}</p>}
            </li>
          ))}
        </ul>
      )}
    </LogSection>
  );
}

function LiaisonAddForm({
  onSubmit,
  onCancel,
  isSaving,
}: {
  onSubmit: (d: {
    occurredAt: string;
    contactName: string;
    purpose: string;
    outcome?: string | null;
    nextStep?: string | null;
  }) => Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [occurredAt, setOccurredAt] = useState(new Date().toISOString().slice(0, 10));
  const [contactName, setContactName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [outcome, setOutcome] = useState("");
  const [nextStep, setNextStep] = useState("");

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!contactName.trim() || !purpose.trim()) return;
        await onSubmit({
          occurredAt: new Date(occurredAt).toISOString(),
          contactName: contactName.trim(),
          purpose: purpose.trim(),
          outcome: outcome.trim() || null,
          nextStep: nextStep.trim() || null,
        });
      }}
      className="space-y-2 rounded-lg border border-border bg-surface/40 p-3"
    >
      <div className="grid grid-cols-2 gap-2">
        <input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} required className="rounded-md border border-border bg-card px-2 py-1 text-xs" />
        <input type="text" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Contact name" required className="rounded-md border border-border bg-card px-2 py-1 text-xs" />
      </div>
      <textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Purpose of contact" rows={2} required className="w-full rounded-md border border-border bg-card px-2 py-1 text-xs" />
      <textarea value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="Outcome" rows={2} className="w-full rounded-md border border-border bg-card px-2 py-1 text-xs" />
      <textarea value={nextStep} onChange={(e) => setNextStep(e.target.value)} placeholder="Next step" rows={2} className="w-full rounded-md border border-border bg-card px-2 py-1 text-xs" />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-md border border-border bg-card px-3 py-1 text-xs hover:bg-surface">Cancel</button>
        <button type="submit" disabled={isSaving || !contactName.trim() || !purpose.trim()} className="inline-flex items-center gap-1 rounded-md bg-brand px-3 py-1 text-xs font-medium text-white hover:bg-brand-hover disabled:opacity-50">
          {isSaving && <Loader2 className="h-3 w-3 animate-spin" />} Add
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Update Log (readonly audit trail)
// ---------------------------------------------------------------------------

export function UpdateLog({ updates }: { updates: UpdateLogRow[] }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <h2 className="text-base font-semibold text-foreground">Update log</h2>
      <p className="mt-0.5 text-xs text-muted">Audit trail of every edit to this Avatar.</p>
      <div className="mt-4">
        {updates.length === 0 ? (
          <p className="text-xs italic text-muted">No updates yet.</p>
        ) : (
          <ul className="space-y-2">
            {updates.map((u) => (
              <li key={u.id} className="flex items-start gap-3 rounded-lg border border-border bg-surface/30 px-3 py-2">
                <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand" />
                <div className="flex-1">
                  <div className="text-xs text-muted">
                    {formatDate(u.occurredAt)} · {u.updatedBy?.name ?? "System"}
                  </div>
                  <div className="text-sm text-foreground">{u.summary}</div>
                  {u.sectionsChanged.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {u.sectionsChanged.map((s) => (
                        <span key={s} className="rounded-full bg-surface px-2 py-0.5 text-xs text-muted">
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function LogSection({
  title,
  description,
  onAdd,
  adding,
  children,
}: {
  title: string;
  description: string;
  onAdd: () => void;
  adding: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <p className="mt-0.5 text-xs text-muted">{description}</p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground/80 hover:bg-surface"
        >
          <Plus className="h-3.5 w-3.5" /> {adding ? "Close" : "Add"}
        </button>
      </div>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
