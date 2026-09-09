"use client";

/**
 * SatDocument — the element-level SAT/QIP editor, mirroring the official NSW
 * Service Self-Assessment Form: service philosophy → per-QA Law & Regulations
 * checklist (+comments) → per-standard element cards (5 evidence boxes +
 * Met/Not Met) → Continuous Improvement Opportunities table.
 */

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  Scale,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  NQS_STANDARDS,
  QA_NAMES,
  EVIDENCE_SLOTS,
  IMPROVEMENT_PRIORITIES,
  IMPROVEMENT_STATUSES,
} from "@/lib/nqs-taxonomy";
import {
  useUpdateElement,
  useUpdateLegalCheck,
  useUpdateQipDocument,
  useImprovementMutations,
  type SatElement,
  type SatLegalCheckRow,
  type SatImprovementRow,
} from "@/hooks/useSatDocument";

const ASSESSMENT_STYLES: Record<string, string> = {
  met: "bg-emerald-100 text-emerald-700 border-emerald-200",
  not_met: "bg-red-100 text-red-700 border-red-200",
  not_assessed: "bg-gray-50 text-gray-500 border-gray-200",
};

const LEGAL_OPTIONS = [
  { value: "not_assessed", label: "—" },
  { value: "compliant", label: "Compliant" },
  { value: "non_compliant", label: "Non-compliant" },
  { value: "not_applicable", label: "Not applicable" },
];

// ── Philosophy ─────────────────────────────────────────────────────────────

function PhilosophyCard({
  qipId,
  serviceId,
  value,
}: {
  qipId: string;
  serviceId: string;
  value: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const save = useUpdateQipDocument(qipId, serviceId);

  return (
    <div className="bg-card rounded-xl border border-border p-5 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Service philosophy</h3>
        {!editing && (
          <button
            onClick={() => {
              setDraft(value ?? "");
              setEditing(true);
            }}
            className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:text-brand-hover"
          >
            <Pencil className="w-3.5 h-3.5" /> Edit
          </button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={8}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm"
            placeholder="The statement of philosophy that guides all aspects of the service's operations…"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setEditing(false)}
              className="px-3 py-1.5 text-xs text-muted hover:text-foreground"
            >
              Cancel
            </button>
            <button
              disabled={save.isPending}
              onClick={() =>
                save.mutate(
                  { servicePhilosophy: draft },
                  { onSuccess: () => setEditing(false) },
                )
              }
              className="px-3 py-1.5 rounded-lg bg-brand text-white text-xs font-semibold disabled:opacity-50"
            >
              {save.isPending ? "Saving…" : "Save philosophy"}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-foreground whitespace-pre-wrap">
          {value || (
            <span className="text-muted italic">
              Not set — this is the first section of the government form.
            </span>
          )}
        </p>
      )}
    </div>
  );
}

// ── Law & Regulations ──────────────────────────────────────────────────────

function LegalChecklist({
  qipId,
  serviceId,
  qa,
  checks,
  comment,
  legalComments,
}: {
  qipId: string;
  serviceId: string;
  qa: number;
  checks: SatLegalCheckRow[];
  comment: string;
  legalComments: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState(comment);
  const patchCheck = useUpdateLegalCheck(qipId, serviceId);
  const patchDoc = useUpdateQipDocument(qipId, serviceId);
  const answered = checks.filter((c) => c.assessment !== "not_assessed").length;

  return (
    <div className="rounded-lg border border-border bg-surface/40">
      <button
        onClick={() => setOpen((s) => !s)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left"
      >
        <span className="inline-flex items-center gap-2 text-xs font-semibold text-foreground">
          <Scale className="w-3.5 h-3.5 text-brand" />
          Law &amp; Regulations checklist
          <span className="text-muted font-normal">
            {answered}/{checks.length} answered
          </span>
        </span>
        {open ? (
          <ChevronDown className="w-4 h-4 text-muted" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted" />
        )}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2">
          {checks.map((check) => (
            <div
              key={check.checkKey}
              className="flex flex-col sm:flex-row sm:items-start gap-2 border-t border-border/50 pt-2"
            >
              <div className="flex-1">
                <span className="text-[11px] font-mono text-muted">
                  {check.lawRef} · {check.nqsRef}
                </span>
                <p className="text-sm text-foreground">{check.question}</p>
              </div>
              <select
                value={check.assessment}
                onChange={(e) =>
                  patchCheck.mutate({
                    checkKey: check.checkKey,
                    assessment: e.target.value,
                  })
                }
                className={cn(
                  "shrink-0 border rounded-lg px-2 py-1.5 text-xs",
                  check.assessment === "compliant" && "border-emerald-300 text-emerald-700",
                  check.assessment === "non_compliant" && "border-red-300 text-red-700",
                )}
              >
                {LEGAL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <div className="border-t border-border/50 pt-2 space-y-1">
            <label className="text-[11px] font-medium text-muted uppercase tracking-wide">
              Comments
            </label>
            <textarea
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              rows={2}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm"
            />
            {commentDraft !== comment && (
              <div className="flex justify-end">
                <button
                  disabled={patchDoc.isPending}
                  onClick={() =>
                    patchDoc.mutate({
                      legalComments: { ...legalComments, [String(qa)]: commentDraft },
                    })
                  }
                  className="px-3 py-1 rounded-lg bg-brand text-white text-xs font-semibold disabled:opacity-50"
                >
                  Save comments
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Element card ───────────────────────────────────────────────────────────

function ElementCard({
  qipId,
  serviceId,
  element,
}: {
  qipId: string;
  serviceId: string;
  element: SatElement;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const save = useUpdateElement(qipId, serviceId);
  const filled = element.evidence.filter((e) => e.trim());

  function startEdit() {
    const slots = [...element.evidence];
    while (slots.length < EVIDENCE_SLOTS) slots.push("");
    setDraft(slots);
    setEditing(true);
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-brand bg-brand/10 px-2 py-0.5 rounded">
              {element.code}
            </span>
            <span className="text-xs font-medium text-muted">{element.concept}</span>
          </div>
          <p className="text-sm text-foreground mt-1">{element.description}</p>
        </div>
        <select
          value={element.assessment}
          onChange={(e) =>
            save.mutate({ elementCode: element.code, assessment: e.target.value })
          }
          className={cn(
            "shrink-0 border rounded-full px-2.5 py-1 text-xs font-medium capitalize",
            ASSESSMENT_STYLES[element.assessment],
          )}
        >
          <option value="not_assessed">Not assessed</option>
          <option value="met">Met</option>
          <option value="not_met">Not met</option>
        </select>
      </div>

      {editing ? (
        <div className="space-y-2">
          {draft.map((slot, i) => (
            <textarea
              key={i}
              value={slot}
              onChange={(e) =>
                setDraft((d) => d.map((s, j) => (j === i ? e.target.value : s)))
              }
              rows={3}
              placeholder={`Evidence and key practices ${i + 1} of ${EVIDENCE_SLOTS}`}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm"
            />
          ))}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setEditing(false)}
              className="px-3 py-1.5 text-xs text-muted hover:text-foreground"
            >
              Cancel
            </button>
            <button
              disabled={save.isPending}
              onClick={() =>
                save.mutate(
                  { elementCode: element.code, evidence: draft },
                  { onSuccess: () => setEditing(false) },
                )
              }
              className="px-3 py-1.5 rounded-lg bg-brand text-white text-xs font-semibold disabled:opacity-50"
            >
              {save.isPending ? "Saving…" : "Save evidence"}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filled.length === 0 ? (
            <p className="text-xs text-muted italic">
              No evidence recorded — daily reflections feed the Friday AI proposals here.
            </p>
          ) : (
            <ol className="space-y-1.5">
              {filled.map((entry, i) => (
                <li
                  key={i}
                  className="text-sm text-foreground bg-surface/50 border border-border/50 rounded-lg px-3 py-2 whitespace-pre-wrap"
                >
                  {entry}
                </li>
              ))}
            </ol>
          )}
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted">
              {filled.length}/{EVIDENCE_SLOTS} evidence boxes used
            </span>
            <button
              onClick={startEdit}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:text-brand-hover"
            >
              <Pencil className="w-3 h-3" /> Edit evidence
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Improvements table ─────────────────────────────────────────────────────

const EMPTY_IMPROVEMENT = {
  elementCode: "",
  issue: "",
  outcomeGoal: "",
  priority: "medium" as const,
  steps: "",
  successMeasure: "",
  byWhen: "",
};

function ImprovementsSection({
  qipId,
  serviceId,
  improvements,
}: {
  qipId: string;
  serviceId: string;
  improvements: SatImprovementRow[];
}) {
  const { create, update, remove } = useImprovementMutations(qipId, serviceId);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_IMPROVEMENT });

  const set = (key: keyof typeof EMPTY_IMPROVEMENT) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="bg-card rounded-xl border border-border p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Continuous Improvement Opportunities
        </h3>
        <button
          onClick={() => setAdding((s) => !s)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand text-white text-xs font-semibold"
        >
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </div>

      {adding && (
        <div className="rounded-lg border border-border p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            value={form.elementCode}
            onChange={set("elementCode")}
            placeholder="Standard/Element (e.g. 1.1.1)"
            className="border border-border rounded-lg px-3 py-2 text-sm"
          />
          <select
            value={form.priority}
            onChange={set("priority")}
            className="border border-border rounded-lg px-3 py-2 text-sm"
          >
            {IMPROVEMENT_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                Priority: {p}
              </option>
            ))}
          </select>
          <textarea
            value={form.issue}
            onChange={set("issue")}
            placeholder="Issue identified during self-assessment"
            rows={2}
            className="border border-border rounded-lg px-3 py-2 text-sm sm:col-span-2"
          />
          <textarea
            value={form.outcomeGoal}
            onChange={set("outcomeGoal")}
            placeholder="What outcome or goal do we seek?"
            rows={2}
            className="border border-border rounded-lg px-3 py-2 text-sm"
          />
          <textarea
            value={form.steps}
            onChange={set("steps")}
            placeholder="How will we get this outcome? (steps)"
            rows={2}
            className="border border-border rounded-lg px-3 py-2 text-sm"
          />
          <textarea
            value={form.successMeasure}
            onChange={set("successMeasure")}
            placeholder="Success measure"
            rows={2}
            className="border border-border rounded-lg px-3 py-2 text-sm"
          />
          <input
            value={form.byWhen}
            onChange={set("byWhen")}
            placeholder="By when? (e.g. Week 4, Term 1 2026)"
            className="border border-border rounded-lg px-3 py-2 text-sm"
          />
          <div className="sm:col-span-2 flex justify-end gap-2">
            <button
              onClick={() => setAdding(false)}
              className="px-3 py-1.5 text-xs text-muted hover:text-foreground"
            >
              Cancel
            </button>
            <button
              disabled={
                create.isPending ||
                !form.elementCode ||
                !form.issue ||
                !form.outcomeGoal ||
                !form.steps ||
                !form.successMeasure
              }
              onClick={() =>
                create.mutate(
                  {
                    ...form,
                    byWhen: form.byWhen || undefined,
                    status: "not_started",
                  },
                  {
                    onSuccess: () => {
                      setAdding(false);
                      setForm({ ...EMPTY_IMPROVEMENT });
                    },
                  },
                )
              }
              className="px-3 py-1.5 rounded-lg bg-brand text-white text-xs font-semibold disabled:opacity-50"
            >
              {create.isPending ? "Adding…" : "Add improvement"}
            </button>
          </div>
        </div>
      )}

      {improvements.length === 0 ? (
        <p className="text-sm text-muted italic">
          No improvement opportunities recorded yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-muted uppercase tracking-wide text-left">
                <th className="py-1.5 pr-3">Std/Element</th>
                <th className="py-1.5 pr-3">Issue → Goal</th>
                <th className="py-1.5 pr-3">Priority</th>
                <th className="py-1.5 pr-3">By when</th>
                <th className="py-1.5 pr-3">Status</th>
                <th className="py-1.5" />
              </tr>
            </thead>
            <tbody>
              {improvements.map((row) => (
                <tr key={row.id} className="border-t border-border/50 align-top">
                  <td className="py-2 pr-3 font-mono text-xs">{row.elementCode}</td>
                  <td className="py-2 pr-3">
                    <p className="text-foreground">{row.issue}</p>
                    <p className="text-muted text-xs mt-0.5">→ {row.outcomeGoal}</p>
                  </td>
                  <td className="py-2 pr-3">
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded-full text-[11px] font-medium capitalize",
                        row.priority === "high" && "bg-red-100 text-red-700",
                        row.priority === "medium" && "bg-amber-100 text-amber-700",
                        row.priority === "low" && "bg-gray-100 text-gray-600",
                      )}
                    >
                      {row.priority}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-xs text-muted">{row.byWhen || "—"}</td>
                  <td className="py-2 pr-3">
                    <select
                      value={row.status}
                      onChange={(e) =>
                        update.mutate({ improvementId: row.id, status: e.target.value as SatImprovementRow["status"] })
                      }
                      className="border border-border rounded-lg px-2 py-1 text-xs"
                    >
                      {IMPROVEMENT_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s.replace(/_/g, " ")}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => remove.mutate({ improvementId: row.id })}
                      className="p-1 text-muted hover:text-red-600"
                      aria-label="Delete improvement"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Legacy notes (old per-QA narrative) ────────────────────────────────────

interface LegacyArea {
  qualityArea: number;
  qualityAreaName: string;
  strengths: string | null;
  areasForImprovement: string | null;
  improvementGoal: string | null;
  strategies: string | null;
  progressNotes: string | null;
  evidenceCollected: string | null;
}

function LegacyNotes({ area }: { area: LegacyArea }) {
  const [open, setOpen] = useState(false);
  const entries = [
    ["Strengths", area.strengths],
    ["Areas for improvement", area.areasForImprovement],
    ["Improvement goal", area.improvementGoal],
    ["Strategies", area.strategies],
    ["Evidence collected", area.evidenceCollected],
    ["Progress notes", area.progressNotes],
  ].filter(([, v]) => v && String(v).trim());
  if (entries.length === 0) return null;

  return (
    <div className="rounded-lg border border-dashed border-border bg-surface/30">
      <button
        onClick={() => setOpen((s) => !s)}
        className="w-full flex items-center justify-between px-4 py-2 text-left text-xs text-muted"
      >
        <span>Legacy QA-level notes ({entries.length}) — move these into elements</span>
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      </button>
      {open && (
        <div className="px-4 pb-3 space-y-2">
          {entries.map(([label, value]) => (
            <div key={label as string}>
              <dt className="text-[10px] font-medium text-muted uppercase tracking-wide">
                {label}
              </dt>
              <dd className="text-xs text-foreground whitespace-pre-wrap">{value}</dd>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Root ───────────────────────────────────────────────────────────────────

export interface SatDocumentQip {
  id: string;
  serviceId: string;
  documentType: string;
  servicePhilosophy: string | null;
  legalComments: Record<string, string> | null;
  elements: SatElement[];
  legalChecks: SatLegalCheckRow[];
  improvements: SatImprovementRow[];
  qualityAreas: LegacyArea[];
}

export function SatDocument({ qip, serviceId }: { qip: SatDocumentQip; serviceId: string }) {
  const [openQa, setOpenQa] = useState<number | null>(null);
  const legalComments = (qip.legalComments ?? {}) as Record<string, string>;

  const byQa = useMemo(() => {
    const map = new Map<
      number,
      { standards: { code: string; title: string; elements: SatElement[] }[]; checks: SatLegalCheckRow[] }
    >();
    for (let qa = 1; qa <= 7; qa++) {
      const standards = NQS_STANDARDS.filter((s) => s.qualityArea === qa).map((s) => ({
        code: s.code,
        title: s.title,
        elements: qip.elements.filter((e) => e.standardCode === s.code),
      }));
      map.set(qa, {
        standards,
        checks: qip.legalChecks.filter((c) => c.qualityArea === qa),
      });
    }
    return map;
  }, [qip.elements, qip.legalChecks]);

  return (
    <div className="space-y-4">
      <PhilosophyCard
        qipId={qip.id}
        serviceId={serviceId}
        value={qip.servicePhilosophy}
      />

      {[1, 2, 3, 4, 5, 6, 7].map((qa) => {
        const group = byQa.get(qa)!;
        const isOpen = openQa === qa;
        const qaElements = group.standards.flatMap((s) => s.elements);
        const assessed = qaElements.filter((e) => e.assessment !== "not_assessed").length;
        const withEvidence = qaElements.filter((e) =>
          e.evidence.some((x) => x.trim()),
        ).length;
        const legacy = qip.qualityAreas.find((a) => a.qualityArea === qa);

        return (
          <div key={qa} className="bg-card rounded-xl border border-border overflow-hidden">
            <button
              onClick={() => setOpenQa(isOpen ? null : qa)}
              className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-surface/50 transition"
            >
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-brand bg-brand/10 px-2 py-1 rounded">
                  QA{qa}
                </span>
                <span className="font-medium text-foreground text-sm">{QA_NAMES[qa]}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-muted hidden sm:inline">
                  {withEvidence}/{qaElements.length} elements evidenced · {assessed} assessed
                </span>
                {isOpen ? (
                  <ChevronDown className="w-4 h-4 text-muted" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted" />
                )}
              </div>
            </button>

            {isOpen && (
              <div className="px-5 pb-5 space-y-4 border-t border-border/50 pt-4">
                <LegalChecklist
                  qipId={qip.id}
                  serviceId={serviceId}
                  qa={qa}
                  checks={group.checks}
                  comment={legalComments[String(qa)] ?? ""}
                  legalComments={legalComments}
                />
                {legacy && <LegacyNotes area={legacy} />}
                {group.standards.map((standard) => (
                  <div key={standard.code} className="space-y-2">
                    <h4 className="text-xs font-semibold text-muted uppercase tracking-wide">
                      Standard {standard.code} — {standard.title}
                    </h4>
                    {standard.elements.map((element) => (
                      <ElementCard
                        key={element.code}
                        qipId={qip.id}
                        serviceId={serviceId}
                        element={element}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <ImprovementsSection
        qipId={qip.id}
        serviceId={serviceId}
        improvements={qip.improvements}
      />
    </div>
  );
}
