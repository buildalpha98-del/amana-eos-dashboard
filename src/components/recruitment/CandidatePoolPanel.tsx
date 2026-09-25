"use client";

/**
 * Candidate detail — the record a coordinator reads before ringing someone.
 *
 * Notes are an authored thread (CandidateNote), not the legacy single `notes`
 * box: several State Managers record why someone was or wasn't a fit over
 * months, and losing who-said-what made the field almost useless. Any legacy
 * content is shown above the thread rather than migrated, so nothing is lost.
 */

import { useState } from "react";
import { X, ExternalLink, Phone, Mail, Loader2 } from "lucide-react";
import {
  useCandidateNotes,
  useAddCandidateNote,
  useUpdateCandidate,
  useCandidateInterviews,
  useAddCandidateInterview,
  type PoolCandidate,
} from "@/hooks/useCandidatePool";
import {
  POOL_STAGES,
  POOL_STAGE_LABELS,
  POOL_SESSION_LABELS,
  POOL_DAY_LABELS,
  RIGHT_TO_WORK_LABELS,
  sourceLabel,
  poolReadiness,
  normaliseStage,
  NOT_HIRED_REASONS,
  NOT_HIRED_REASON_LABELS,
  REAPPROACHABLE_REASONS,
  notHiredReasonLabel,
  INTERVIEW_MODES,
  INTERVIEW_MODE_LABELS,
  INTERVIEW_OUTCOMES,
  INTERVIEW_OUTCOME_LABELS,
  type NotHiredReason,
  type RightToWork,
  type PoolSession,
  type PoolDay,
} from "@/lib/recruitment/pool";
import { Button } from "@/components/ui/Button";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";

const QUALIFICATION_LABELS: Record<string, string> = {
  cert_iii: "Certificate III",
  diploma: "Diploma",
  bachelor: "Bachelor",
  masters: "Masters",
  other: "Other",
};

function fmtDate(d: string | null): string {
  if (!d) return "—";
  const dt = new Date(d);
  return Number.isNaN(dt.getTime())
    ? "—"
    : dt.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-2xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="text-sm text-foreground mt-0.5">{value || "—"}</dd>
    </div>
  );
}

export function CandidatePoolPanel({
  candidate,
  onClose,
}: {
  candidate: PoolCandidate | null;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const [loggingInterview, setLoggingInterview] = useState(false);
  const [iv, setIv] = useState({
    heldAt: new Date().toISOString().slice(0, 10),
    mode: "in_person",
    panel: "",
    notes: "",
    outcome: "progress",
  });
  const { data: notesData, isLoading: notesLoading } = useCandidateNotes(
    candidate?.id ?? null,
  );
  const addNote = useAddCandidateNote(candidate?.id ?? "");
  const { data: interviewData, isLoading: interviewsLoading } =
    useCandidateInterviews(candidate?.id ?? null);
  const addInterview = useAddCandidateInterview(candidate?.id ?? "");
  const update = useUpdateCandidate();

  if (!candidate) return null;
  const c = candidate;
  const readiness = poolReadiness({
    wwccNumber: c.wwccNumber,
    wwccExpiry: c.wwccExpiry,
    hasFirstAid: c.hasFirstAid,
  });

  function patch(body: Record<string, unknown>) {
    update.mutate({ id: c.id, ...body });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <aside
        className="w-full max-w-xl h-full overflow-y-auto bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-heading font-semibold tracking-tight text-foreground">
              {c.name}
            </h2>
            <p className="text-sm text-muted mt-1">
              {sourceLabel(c.source)} · applied {fmtDate(c.appliedAt)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close candidate"
            className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="px-6 py-5 space-y-6">
          {/* Act on them */}
          <div className="flex flex-wrap gap-2">
            {c.phone && (
              <a
                href={`tel:${c.phone}`}
                className="inline-flex items-center gap-1.5 text-sm text-brand hover:underline"
              >
                <Phone className="w-3.5 h-3.5" />{c.phone}
              </a>
            )}
            {c.email && (
              <a
                href={`mailto:${c.email}`}
                className="inline-flex items-center gap-1.5 text-sm text-brand hover:underline"
              >
                <Mail className="w-3.5 h-3.5" />{c.email}
              </a>
            )}
            {c.resumeFileUrl && (
              <a
                href={c.resumeFileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-brand hover:underline"
              >
                Résumé <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          <div
            className={cn(
              "rounded-lg border px-3 py-2 text-sm",
              readiness.status === "ready"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                : readiness.status === "expiring"
                  ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                  : "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200",
            )}
          >
            {readiness.reason}
          </div>

          {/* Stage + rating + contact stamp */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block">
              <span className="text-2xs uppercase tracking-wide text-muted">Stage</span>
              <select
                value={POOL_STAGES.includes(c.stage as never) ? c.stage : "applied"}
                onChange={(e) => patch({ stage: e.target.value })}
                className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
              >
                {POOL_STAGES.map((s) => (
                  <option key={s} value={s}>{POOL_STAGE_LABELS[s]}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-2xs uppercase tracking-wide text-muted">Rating</span>
              <select
                value={c.rating ?? ""}
                onChange={(e) =>
                  patch({ rating: e.target.value ? Number(e.target.value) : null })
                }
                className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
              >
                <option value="">Not rated</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>{n} / 5</option>
                ))}
              </select>
            </label>
            <div>
              <span className="text-2xs uppercase tracking-wide text-muted">Last contacted</span>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-sm text-foreground">{fmtDate(c.lastContactedAt)}</span>
                <button
                  type="button"
                  onClick={() => {
                    patch({ lastContactedAt: new Date().toISOString() });
                    toast({ description: "Marked as contacted today." });
                  }}
                  className="text-2xs text-brand hover:underline"
                >
                  Mark today
                </button>
              </div>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Field label="Suburb" value={[c.suburb, c.postcode].filter(Boolean).join(" ")} />
            <Field label="Preferred region" value={c.preferredRegion} />
            <Field
              label="Qualification"
              value={
                c.qualification
                  ? `${QUALIFICATION_LABELS[c.qualification] ?? c.qualification}${c.studying ? " (studying)" : ""}`
                  : c.studying
                    ? "Studying"
                    : "None"
              }
            />
            <Field
              label="Right to work"
              value={
                c.rightToWork
                  ? RIGHT_TO_WORK_LABELS[c.rightToWork as RightToWork] ?? c.rightToWork
                  : null
              }
            />
            <Field label="WWCC" value={c.wwccNumber} />
            <Field label="WWCC expiry" value={fmtDate(c.wwccExpiry)} />
            <Field label="First aid" value={c.hasFirstAid ? "Yes" : "Not recorded"} />
            <Field label="Own transport" value={c.hasTransport ? "Yes" : "No"} />
            <Field label="Most recent role" value={c.previousRole} />
            <Field label="Most recent employer" value={c.previousEmployer} />
            <Field
              label="Years with children"
              value={c.yearsExperience != null ? `${c.yearsExperience}` : null}
            />
            <Field label="Earliest start" value={fmtDate(c.earliestStart)} />
            <Field
              label="Sessions"
              value={
                c.availableSessions.length
                  ? c.availableSessions
                      .map((s) => POOL_SESSION_LABELS[s as PoolSession] ?? s)
                      .join(", ")
                  : "Not stated"
              }
            />
            <Field
              label="Days"
              value={
                c.availableDays.length
                  ? c.availableDays.map((d) => POOL_DAY_LABELS[d as PoolDay] ?? d).join(", ")
                  : "Not stated"
              }
            />
            {c.vacancy && (
              <Field
                label="Applied to"
                value={`${c.vacancy.role.replace(/_/g, " ")}${
                  c.vacancy.service?.name ? ` — ${c.vacancy.service.name}` : c.vacancy.region ? ` — ${c.vacancy.region}` : ""
                }`}
              />
            )}
            {c.aiScreenScore != null && (
              <Field label="AI screen" value={`${c.aiScreenScore} / 100`} />
            )}
          </dl>

          {/* Why we didn't hire them — only once that's the outcome. Asking
              for a reason before a decision exists just adds noise. */}
          {normaliseStage(c.stage) === "not_suitable" && (
            <section className="rounded-lg border border-border bg-surface p-4">
              <h3 className="text-sm font-semibold text-foreground mb-2">
                Why we didn&apos;t hire
              </h3>
              <select
                value={c.notHiredReason ?? ""}
                onChange={(e) => patch({ notHiredReason: e.target.value || null })}
                className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
              >
                <option value="">Not recorded</option>
                {NOT_HIRED_REASONS.map((r) => (
                  <option key={r} value={r}>{NOT_HIRED_REASON_LABELS[r]}</option>
                ))}
              </select>
              <textarea
                defaultValue={c.notHiredNote ?? ""}
                onBlur={(e) => {
                  const next = e.target.value.trim() || null;
                  if (next !== (c.notHiredNote ?? null)) patch({ notHiredNote: next });
                }}
                rows={2}
                placeholder="The detail — what specifically, in your words."
                className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40"
              />
              {c.notHiredReason &&
                REAPPROACHABLE_REASONS.includes(c.notHiredReason as NotHiredReason) && (
                  <p className="mt-2 text-2xs text-emerald-700 dark:text-emerald-300">
                    Worth re-contacting &mdash; {notHiredReasonLabel(c.notHiredReason).toLowerCase()} was
                    their call or our timing, not a judgement on them.
                  </p>
                )}
            </section>
          )}

          {/* Interviews */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-foreground">Interviews</h3>
              {!loggingInterview && (
                <button
                  type="button"
                  onClick={() => setLoggingInterview(true)}
                  className="text-2xs text-brand hover:underline"
                >
                  Record an interview
                </button>
              )}
            </div>

            {c.interviewNotes && (
              <div className="mb-3 rounded-lg border border-border bg-surface p-3">
                <p className="text-2xs uppercase tracking-wide text-muted mb-1">
                  Earlier interview notes
                </p>
                <p className="text-sm text-foreground whitespace-pre-wrap">
                  {c.interviewNotes}
                </p>
              </div>
            )}

            {loggingInterview && (
              <form
                className="space-y-2 rounded-lg border border-border p-3 mb-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!iv.notes.trim()) return;
                  addInterview.mutate(
                    {
                      heldAt: new Date(iv.heldAt).toISOString(),
                      mode: iv.mode,
                      panel: iv.panel.trim() || null,
                      notes: iv.notes.trim(),
                      outcome: iv.outcome,
                    },
                    {
                      onSuccess: () => {
                        setLoggingInterview(false);
                        setIv({ ...iv, panel: "", notes: "" });
                      },
                    },
                  );
                }}
              >
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-2xs uppercase tracking-wide text-muted">Date</span>
                    <input
                      type="date"
                      value={iv.heldAt}
                      onChange={(e) => setIv({ ...iv, heldAt: e.target.value })}
                      className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
                    />
                  </label>
                  <label className="block">
                    <span className="text-2xs uppercase tracking-wide text-muted">How</span>
                    <select
                      value={iv.mode}
                      onChange={(e) => setIv({ ...iv, mode: e.target.value })}
                      className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
                    >
                      {INTERVIEW_MODES.map((m) => (
                        <option key={m} value={m}>{INTERVIEW_MODE_LABELS[m]}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="block">
                  <span className="text-2xs uppercase tracking-wide text-muted">
                    Anyone else in the room
                  </span>
                  <input
                    value={iv.panel}
                    onChange={(e) => setIv({ ...iv, panel: e.target.value })}
                    placeholder="e.g. centre coordinator"
                    className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
                  />
                </label>
                <textarea
                  value={iv.notes}
                  onChange={(e) => setIv({ ...iv, notes: e.target.value })}
                  rows={4}
                  placeholder="How it went, what they said, anything to follow up…"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40"
                />
                <label className="block">
                  <span className="text-2xs uppercase tracking-wide text-muted">
                    Your recommendation
                  </span>
                  <select
                    value={iv.outcome}
                    onChange={(e) => setIv({ ...iv, outcome: e.target.value })}
                    className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
                  >
                    {INTERVIEW_OUTCOMES.map((o) => (
                      <option key={o} value={o}>{INTERVIEW_OUTCOME_LABELS[o]}</option>
                    ))}
                  </select>
                </label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setLoggingInterview(false)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={!iv.notes.trim() || addInterview.isPending}
                    className="flex-1"
                  >
                    {addInterview.isPending && (
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    )}
                    Save interview
                  </Button>
                </div>
              </form>
            )}

            <div className="space-y-3">
              {interviewsLoading && <p className="text-sm text-muted">Loading…</p>}
              {interviewData?.interviews.map((i) => (
                <div key={i.id} className="border-l-2 border-border pl-3">
                  <p className="text-2xs text-muted">
                    {fmtDate(i.heldAt)}
                    {i.mode
                      ? ` · ${INTERVIEW_MODE_LABELS[i.mode as keyof typeof INTERVIEW_MODE_LABELS] ?? i.mode}`
                      : ""}
                    {i.conductedBy ? ` · ${i.conductedBy.name}` : ""}
                    {i.panel ? ` with ${i.panel}` : ""}
                    {i.outcome
                      ? ` · ${INTERVIEW_OUTCOME_LABELS[i.outcome as keyof typeof INTERVIEW_OUTCOME_LABELS] ?? i.outcome}`
                      : ""}
                  </p>
                  <p className="text-sm text-foreground whitespace-pre-wrap mt-0.5">
                    {i.notes}
                  </p>
                </div>
              ))}
              {!interviewsLoading && (interviewData?.interviews.length ?? 0) === 0 && !c.interviewNotes && (
                <p className="text-sm text-muted">No interviews recorded.</p>
              )}
            </div>
          </section>

          {/* Notes */}
          <section>
            <h3 className="text-sm font-semibold text-foreground mb-2">Notes</h3>

            {c.notes && (
              <div className="mb-3 rounded-lg border border-border bg-surface p-3">
                <p className="text-2xs uppercase tracking-wide text-muted mb-1">
                  Earlier notes
                </p>
                <p className="text-sm text-foreground whitespace-pre-wrap">{c.notes}</p>
              </div>
            )}

            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                const body = note.trim();
                if (!body) return;
                addNote.mutate(body, { onSuccess: () => setNote("") });
              }}
            >
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Why they'd be a good fit, how the call went, what to follow up…"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40"
              />
              <Button type="submit" disabled={!note.trim() || addNote.isPending}>
                {addNote.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                Add note
              </Button>
            </form>

            <div className="mt-4 space-y-3">
              {notesLoading && <p className="text-sm text-muted">Loading notes…</p>}
              {notesData?.notes.map((n) => (
                <div key={n.id} className="border-l-2 border-border pl-3">
                  <p className="text-2xs text-muted">
                    {n.author?.name ?? "Unknown"} ·{" "}
                    {new Date(n.createdAt).toLocaleString("en-AU", {
                      day: "numeric",
                      month: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                  <p className="text-sm text-foreground whitespace-pre-wrap mt-0.5">
                    {n.body}
                  </p>
                </div>
              ))}
              {!notesLoading && (notesData?.notes.length ?? 0) === 0 && (
                <p className="text-sm text-muted">No notes yet.</p>
              )}
            </div>
          </section>

          <div className="pt-2 border-t border-border">
            {c.archivedAt ? (
              <Button variant="outline" onClick={() => patch({ archivedAt: null })}>
                Restore to pool
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => patch({ archivedAt: new Date().toISOString() })}
              >
                Archive
              </Button>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
