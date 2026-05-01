"use client";

/**
 * ServiceRiskTab — hazards table, likelihood×severity matrix, approval workflow.
 *
 * List view shows status chips (Draft / Pending / Approved). Create modal lets
 * staff add hazards row-by-row (likelihood 1..5 × severity 1..5, computed risk
 * score colour-coded). Approve action is a single click; server-side enforces
 * "different user than author" rule.
 */

import { useMemo, useState, useTransition } from "react";
import {
  Plus,
  ShieldCheck,
  AlertTriangle,
  Check,
  Trash2,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { FilterBar } from "@/components/ui/v2/FilterBar";
import { AiButton } from "@/components/ui/AiButton";
import { toast } from "@/hooks/useToast";
import {
  useRiskAssessments,
  useCreateRiskAssessment,
  useApproveRiskAssessment,
  type Hazard,
  type RiskAssessmentItem,
} from "@/hooks/useRiskAssessments";

/**
 * Local hazard shape with a stable client-side `_uid`. React keys off `_uid`
 * so reordering / replacing the array (e.g. when AI seeds 4–8 hazards at
 * once) doesn't tear down + rebuild every input — which previously caused
 * a perceptible main-thread stall and contributed to the "Suggest hazards
 * froze the page" report from the 2026-04-30 training session.
 *
 * Stripped before submitting to the server (the API doesn't know about
 * `_uid` and validates strictly).
 */
type LocalHazard = Hazard & { _uid: string };

function uid(): string {
  // crypto.randomUUID is available in all targeted browsers (Safari 15.4+,
  // Chrome 92+, Firefox 95+) — Math.random fallback for jsdom test runners.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `h_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

/**
 * Extract the first JSON array from an LLM response. Sonnet usually returns
 * pure JSON when the prompt says "no prose", but it occasionally wraps the
 * array in a sentence ("Here are the hazards: [...]") or markdown fences.
 *
 * Strategy:
 *  1. Strip ```json / ``` fences (already handled before — keep the regex).
 *  2. Try a direct JSON.parse on the trimmed text.
 *  3. Fall back to extracting the first balanced `[...]` substring and
 *     parsing that. This survives prose-prefix and prose-suffix.
 *  4. If both fail, throw — caller decides what to show the user.
 */
function extractHazardsArray(raw: string): unknown {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    /* fall through to substring extraction */
  }

  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON array found in AI response");
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

const ACTIVITY_OPTIONS = [
  { value: "all", label: "All activities" },
  { value: "routine", label: "Routine" },
  { value: "incursion", label: "Incursion" },
  { value: "excursion", label: "Excursion" },
  { value: "special", label: "Special" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
];

function riskScoreColor(score: number): string {
  if (score >= 15) return "bg-rose-500 text-white";
  if (score >= 9) return "bg-amber-400 text-amber-900";
  if (score >= 4) return "bg-yellow-300 text-yellow-900";
  return "bg-emerald-400 text-emerald-900";
}

export function ServiceRiskTab({ serviceId }: { serviceId: string }) {
  const [activity, setActivity] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);

  const filters = useMemo(
    () => ({
      activityType: activity !== "all" ? activity : undefined,
      status:
        status !== "all"
          ? (status as "pending" | "approved")
          : undefined,
    }),
    [activity, status],
  );

  const { data, isLoading } = useRiskAssessments(serviceId, filters);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-heading font-semibold text-[color:var(--color-muted)] uppercase tracking-[0.08em]">
          Risk assessments
        </h2>
        <BrandButton onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4" />
          New assessment
        </BrandButton>
      </div>

      <FilterBar
        filters={[
          { key: "activity", label: "Activity", options: ACTIVITY_OPTIONS },
          { key: "status", label: "Status", options: STATUS_OPTIONS },
        ]}
        values={{ activity, status }}
        onChange={(k, v) => {
          if (k === "activity") setActivity(v);
          if (k === "status") setStatus(v);
        }}
        onReset={() => {
          setActivity("all");
          setStatus("all");
        }}
      />

      {isLoading ? (
        <div className="text-sm text-[color:var(--color-muted)] py-6">
          Loading risk assessments…
        </div>
      ) : !data?.items || data.items.length === 0 ? (
        <Empty onCreate={() => setCreateOpen(true)} />
      ) : (
        <ul className="space-y-3">
          {data.items.map((r) => (
            <RiskCard key={r.id} ra={r} serviceId={serviceId} />
          ))}
        </ul>
      )}

      {createOpen && (
        <CreateDialog
          serviceId={serviceId}
          onClose={() => setCreateOpen(false)}
        />
      )}
    </div>
  );
}

function Empty({ onCreate }: { onCreate: () => void }) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] bg-[color:var(--color-cream-soft)]",
        "border border-dashed border-[color:var(--color-border)] p-8 text-center",
      )}
    >
      <ShieldCheck className="w-8 h-8 mx-auto text-[color:var(--color-brand)]/60 mb-2" />
      <p className="text-sm font-medium">No risk assessments yet</p>
      <p className="text-xs text-[color:var(--color-muted)] mt-1 mb-4">
        Excursion events require an approved risk assessment before they can be
        created.
      </p>
      <BrandButton onClick={onCreate}>Start your first assessment</BrandButton>
    </div>
  );
}

function StatusChip({ ra }: { ra: RiskAssessmentItem }) {
  if (ra.approvedAt) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-[var(--radius-xs)] bg-emerald-100 text-emerald-800">
        <Check className="w-3 h-3" /> Approved
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-[var(--radius-xs)] bg-amber-100 text-amber-800">
      <AlertTriangle className="w-3 h-3" /> Pending
    </span>
  );
}

function RiskCard({
  ra,
  serviceId,
}: {
  ra: RiskAssessmentItem;
  serviceId: string;
}) {
  const approve = useApproveRiskAssessment(serviceId);
  const date = new Date(ra.date);
  return (
    <li className="warm-card-dense p-3">
      <header className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
            <span className="uppercase tracking-wide font-semibold text-[color:var(--color-brand)]">
              {ra.activityType}
            </span>
            <span className="text-[color:var(--color-muted)]">
              · {date.toLocaleDateString(undefined, {
                day: "numeric",
                month: "short",
              })}
            </span>
            <StatusChip ra={ra} />
          </div>
          <h3 className="text-sm font-semibold mt-0.5">{ra.title}</h3>
          {ra.location && (
            <p className="text-[12px] text-[color:var(--color-muted)] mt-0.5">
              {ra.location}
            </p>
          )}
        </div>
        {!ra.approvedAt && (
          <button
            type="button"
            onClick={() => approve.mutate({ raId: ra.id })}
            disabled={approve.isPending}
            className={cn(
              "inline-flex items-center gap-1 px-3 py-1.5 text-[12px] font-medium rounded-[var(--radius-sm)]",
              // Tablet tap target — approval is a one-shot action
              "min-h-[44px]",
              "bg-emerald-600 text-white hover:bg-emerald-700 transition-colors",
              "disabled:opacity-50",
            )}
          >
            <Check className="w-3.5 h-3.5" />
            Approve
          </button>
        )}
      </header>

      <div className="mt-2 space-y-1">
        {ra.hazards.map((h, i) => {
          const score = h.likelihood * h.severity;
          return (
            <div
              key={i}
              className="flex items-start gap-2 p-2 rounded-[var(--radius-sm)] bg-[color:var(--color-cream-deep)]"
            >
              <span
                className={cn(
                  "inline-flex items-center justify-center w-7 h-7 rounded-[var(--radius-xs)] text-[11px] font-bold shrink-0",
                  riskScoreColor(score),
                )}
                title={`L${h.likelihood} × S${h.severity} = ${score}`}
              >
                {score}
              </span>
              <div className="flex-1 min-w-0 text-[12px]">
                <p className="font-medium">{h.hazard}</p>
                <p className="text-[color:var(--color-muted)] mt-0.5">
                  Controls: {h.controls}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-[11px] text-[color:var(--color-muted)]">
        Author: {ra.author.name}
        {ra.approvedBy
          ? ` · Approved by ${ra.approvedBy.name}`
          : ""}
      </p>
    </li>
  );
}

function CreateDialog({
  serviceId,
  onClose,
}: {
  serviceId: string;
  onClose: () => void;
}) {
  const create = useCreateRiskAssessment(serviceId);
  const [title, setTitle] = useState("");
  const [activityType, setActivityType] =
    useState<RiskAssessmentItem["activityType"]>("routine");
  const [date, setDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [location, setLocation] = useState("");
  const [hazards, setHazards] = useState<LocalHazard[]>(() => [
    { _uid: uid(), hazard: "", likelihood: 1, severity: 1, controls: "" },
  ]);
  // Streaming preview — populated while AI is generating so the user can
  // see characters arriving in real time. Cleared once the final JSON is
  // parsed and merged into `hazards`. Without this, the only visible
  // feedback during a 10–25s generation was the AiButton's small spinner,
  // which staff reported as "the page froze".
  const [aiPreview, setAiPreview] = useState<string>("");
  // setHazards on a wholesale replacement re-renders ~30 form inputs, which
  // can stall the main thread for 100–300ms on slower devices. Wrapping in a
  // transition lets React keep the AiButton interactive (and the streaming
  // preview updating) while the form catches up.
  const [, startTransition] = useTransition();

  const valid =
    title.trim() &&
    date &&
    hazards.length > 0 &&
    hazards.every((h) => h.hazard.trim() && h.controls.trim());

  async function submit() {
    if (!valid) return;
    await create.mutateAsync({
      title: title.trim(),
      activityType,
      date,
      location: location.trim() || undefined,
      // Strip the client-only _uid before posting.
      hazards: hazards.map((h) => ({
        hazard: h.hazard.trim(),
        likelihood: h.likelihood,
        severity: h.severity,
        controls: h.controls.trim(),
      })),
    });
    onClose();
  }

  function updateHazard(_uid: string, patch: Partial<Hazard>) {
    setHazards((prev) =>
      prev.map((h) => (h._uid === _uid ? { ...h, ...patch } : h)),
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent size="lg">
        <DialogTitle className="text-base font-semibold mb-4">
          New risk assessment
        </DialogTitle>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Title">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-3 py-2.5 text-sm bg-[color:var(--color-cream-deep)] min-h-[44px]"
                placeholder="e.g. Zoo excursion — prep"
              />
            </Field>
            <Field label="Activity type">
              <select
                value={activityType}
                onChange={(e) =>
                  setActivityType(
                    e.target.value as RiskAssessmentItem["activityType"],
                  )
                }
                className="w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-3 py-2.5 text-sm bg-[color:var(--color-cream-deep)] min-h-[44px]"
              >
                <option value="routine">Routine</option>
                <option value="incursion">Incursion</option>
                <option value="excursion">Excursion</option>
                <option value="special">Special</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Date">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-3 py-2.5 text-sm bg-[color:var(--color-cream-deep)] min-h-[44px]"
              />
            </Field>
            <Field label="Location">
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-3 py-2.5 text-sm bg-[color:var(--color-cream-deep)] min-h-[44px]"
                placeholder="Optional"
              />
            </Field>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1 gap-2">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-muted)]">
                Hazards
              </span>
              <div className="flex items-center gap-2">
                <AiButton
                  size="sm"
                  templateSlug="nqs/risk-hazards-draft"
                  section="risk-assessments"
                  metadata={{ serviceId, activityType }}
                  variables={{
                    activityType,
                    location: location || "(unspecified)",
                    knownContext: title || "(no extra context)",
                  }}
                  // Stream so the educator sees characters arriving as they
                  // do — feedback that the page is alive during the model
                  // call. The full text is still delivered via onResult once
                  // the stream completes; we parse JSON there.
                  stream
                  onStream={(partial) => setAiPreview(partial)}
                  onResult={(text) => {
                    setAiPreview("");
                    try {
                      const parsed = extractHazardsArray(text);
                      if (!Array.isArray(parsed)) throw new Error("expected array");
                      const safe: LocalHazard[] = parsed
                        .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
                        .slice(0, 25)
                        .map((p) => ({
                          _uid: uid(),
                          hazard: String(p.hazard ?? "").slice(0, 200),
                          likelihood: Math.max(1, Math.min(5, Number(p.likelihood) || 1)),
                          severity: Math.max(1, Math.min(5, Number(p.severity) || 1)),
                          controls: String(p.controls ?? "").slice(0, 500),
                        }))
                        .filter((h) => h.hazard && h.controls);
                      if (safe.length > 0) {
                        // Big array swap → keep the AiButton interactive and
                        // the rest of the dialog responsive while the form
                        // re-renders.
                        startTransition(() => setHazards(safe));
                        toast({ description: `Drafted ${safe.length} hazards — review and edit before saving.` });
                      } else {
                        toast({
                          variant: "destructive",
                          description: "AI returned no usable hazards — try again with a clearer activity description.",
                        });
                      }
                    } catch {
                      toast({
                        variant: "destructive",
                        description: "AI didn't return valid JSON — please add hazards manually.",
                      });
                    }
                  }}
                  label="Suggest hazards"
                  disabled={!activityType}
                />
                <button
                  type="button"
                  onClick={() =>
                    setHazards((prev) => [
                      ...prev,
                      { _uid: uid(), hazard: "", likelihood: 1, severity: 1, controls: "" },
                    ])
                  }
                  className="text-[11px] font-medium text-[color:var(--color-brand)]"
                >
                  + Add hazard
                </button>
              </div>
            </div>
            {aiPreview && (
              <div
                role="status"
                aria-live="polite"
                className="rounded-[var(--radius-sm)] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900"
              >
                <div className="flex items-center gap-1.5 font-medium">
                  <Sparkles className="w-3.5 h-3.5" />
                  AI is drafting hazards…
                </div>
                <pre className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] text-amber-800">
                  {aiPreview}
                </pre>
              </div>
            )}
            <div className="space-y-2">
              {hazards.map((h) => {
                const score = h.likelihood * h.severity;
                return (
                  <div
                    key={h._uid}
                    className="p-2 rounded-[var(--radius-sm)] bg-[color:var(--color-cream-deep)] border border-[color:var(--color-border)]"
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center justify-center w-7 h-7 rounded-[var(--radius-xs)] text-[11px] font-bold shrink-0",
                          riskScoreColor(score),
                        )}
                      >
                        {score}
                      </span>
                      <input
                        value={h.hazard}
                        onChange={(e) =>
                          updateHazard(h._uid, { hazard: e.target.value })
                        }
                        placeholder="Hazard"
                        className="flex-1 rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-3 py-2.5 text-sm min-h-[44px]"
                      />
                      {hazards.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setHazards((prev) =>
                              prev.filter((x) => x._uid !== h._uid),
                            )
                          }
                          className="p-1 text-[color:var(--color-muted)] hover:text-[color:var(--color-danger)]"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <RatingPicker
                        label="Likelihood"
                        value={h.likelihood}
                        onChange={(v) => updateHazard(h._uid, { likelihood: v })}
                      />
                      <RatingPicker
                        label="Severity"
                        value={h.severity}
                        onChange={(v) => updateHazard(h._uid, { severity: v })}
                      />
                    </div>
                    <input
                      value={h.controls}
                      onChange={(e) =>
                        updateHazard(h._uid, { controls: e.target.value })
                      }
                      placeholder="Controls / mitigation"
                      className="w-full mt-2 rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-3 py-2.5 text-sm min-h-[44px]"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 text-sm font-medium text-[color:var(--color-muted)]"
            >
              Cancel
            </button>
            <BrandButton
              onClick={submit}
              disabled={!valid || create.isPending}
            >
              {create.isPending ? "Saving…" : "Save assessment"}
            </BrandButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RatingPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex-1 text-[11px] text-[color:var(--color-muted)]">
      <span className="block mb-0.5">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-2 py-1 text-sm bg-white"
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </label>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-muted)] mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}

function BrandButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 px-4 py-2 rounded-[var(--radius-sm)]",
        // Tablet tap target
        "min-h-[44px]",
        "bg-[color:var(--color-brand)] text-white text-[13px] font-medium",
        "hover:bg-[color:var(--color-brand-hover)] transition-colors",
        "disabled:opacity-50 disabled:cursor-not-allowed",
      )}
    >
      {children}
    </button>
  );
}
