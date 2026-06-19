"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  useAuditDetail,
  useUpdateAudit,
  useSaveAuditResponses,
  type AuditItemResponseData,
} from "@/hooks/useAudits";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Save,
  Play,
  SkipForward,
  Loader2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  ShieldCheck,
  AlertCircle,
  FileText,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Status helpers                                                      */
/* ------------------------------------------------------------------ */

const statusConfig: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  scheduled: { label: "Scheduled", color: "bg-blue-100 text-blue-700 border-blue-300", icon: Clock },
  in_progress: { label: "In Progress", color: "bg-amber-100 text-amber-700 border-amber-300", icon: Play },
  completed: { label: "Completed", color: "bg-emerald-100 text-emerald-700 border-emerald-300", icon: CheckCircle2 },
  overdue: { label: "Overdue", color: "bg-red-100 text-red-700 border-red-300", icon: AlertTriangle },
  skipped: { label: "Skipped", color: "bg-surface text-muted border-border", icon: SkipForward },
};

const qaLabels: Record<number, string> = {
  1: "Educational Program & Practice",
  2: "Children's Health & Safety",
  3: "Physical Environment",
  4: "Staffing Arrangements",
  5: "Relationships with Children",
  6: "Collaborative Partnerships",
  7: "Governance & Leadership",
};

/* ------------------------------------------------------------------ */
/* Response editing per format                                         */
/* ------------------------------------------------------------------ */

function YesNoInput({
  response,
  onChange,
}: {
  response: AuditItemResponseData;
  onChange: (id: string, updates: Partial<AuditItemResponseData>) => void;
}) {
  const result = response.result || "pending";
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        {(["yes", "no", "na"] as const).map((val) => (
          <button
            key={val}
            onClick={() => onChange(response.id, { result: val } as Partial<AuditItemResponseData>)}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-lg border transition-all",
              result === val
                ? val === "yes"
                  ? "bg-emerald-100 text-emerald-700 border-emerald-300 ring-2 ring-emerald-400"
                  : val === "no"
                  ? "bg-red-100 text-red-700 border-red-300 ring-2 ring-red-400"
                  : "bg-surface text-muted border-border ring-2 ring-gray-400"
                : "bg-card text-muted border-border hover:bg-surface"
            )}
          >
            {val === "na" ? "N/A" : val.toUpperCase()}
          </button>
        ))}
      </div>
      {result === "no" && (
        <div>
          <label className="block text-sm font-medium text-red-700 mb-1">
            Action Required *
          </label>
          <textarea
            value={response.actionRequired || ""}
            onChange={(e) => onChange(response.id, { actionRequired: e.target.value } as Partial<AuditItemResponseData>)}
            rows={2}
            className="w-full px-3 py-2 text-sm border border-red-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent resize-none bg-red-50"
            placeholder="Describe required corrective action..."
          />
        </div>
      )}
    </div>
  );
}

function RatingInput({
  response,
  onChange,
}: {
  response: AuditItemResponseData;
  onChange: (id: string, updates: Partial<AuditItemResponseData>) => void;
}) {
  const rating = response.ratingValue;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {[1, 2, 3, 4, 5].map((val) => (
          <button
            key={val}
            onClick={() =>
              onChange(response.id, {
                ratingValue: val,
                result: val <= 3 ? "no" : "yes",
              } as Partial<AuditItemResponseData>)
            }
            className={cn(
              "w-10 h-10 rounded-lg border text-sm font-bold transition-all",
              rating === val
                ? val <= 2
                  ? "bg-red-100 text-red-700 border-red-300 ring-2 ring-red-400"
                  : val === 3
                  ? "bg-amber-100 text-amber-700 border-amber-300 ring-2 ring-amber-400"
                  : "bg-emerald-100 text-emerald-700 border-emerald-300 ring-2 ring-emerald-400"
                : "bg-card text-muted border-border hover:bg-surface"
            )}
          >
            {val}
          </button>
        ))}
      </div>
      {rating != null && rating <= 3 && (
        <div>
          <label className="block text-sm font-medium text-amber-700 mb-1">
            Proposed Action (rating ≤ 3)
          </label>
          <textarea
            value={response.actionRequired || ""}
            onChange={(e) => onChange(response.id, { actionRequired: e.target.value } as Partial<AuditItemResponseData>)}
            rows={2}
            className="w-full px-3 py-2 text-sm border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent resize-none bg-amber-50"
            placeholder="Describe improvement action..."
          />
        </div>
      )}
    </div>
  );
}

function CompliantInput({
  response,
  onChange,
}: {
  response: AuditItemResponseData;
  onChange: (id: string, updates: Partial<AuditItemResponseData>) => void;
}) {
  const result = response.result || "pending";
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        {(["yes", "no", "na"] as const).map((val) => (
          <button
            key={val}
            onClick={() => onChange(response.id, { result: val } as Partial<AuditItemResponseData>)}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-lg border transition-all",
              result === val
                ? val === "yes"
                  ? "bg-emerald-100 text-emerald-700 border-emerald-300 ring-2 ring-emerald-400"
                  : val === "no"
                  ? "bg-red-100 text-red-700 border-red-300 ring-2 ring-red-400"
                  : "bg-surface text-muted border-border ring-2 ring-gray-400"
                : "bg-card text-muted border-border hover:bg-surface"
            )}
          >
            {val === "yes" ? "Compliant" : val === "no" ? "Non-Compliant" : "N/A"}
          </button>
        ))}
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground/80 mb-1">
          Evidence Sighted
        </label>
        <input
          type="text"
          value={response.evidenceSighted || ""}
          onChange={(e) => onChange(response.id, { evidenceSighted: e.target.value } as Partial<AuditItemResponseData>)}
          className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
          placeholder="Describe evidence reviewed..."
        />
      </div>
      {result === "no" && (
        <div>
          <label className="block text-sm font-medium text-red-700 mb-1">
            Action Required *
          </label>
          <textarea
            value={response.actionRequired || ""}
            onChange={(e) => onChange(response.id, { actionRequired: e.target.value } as Partial<AuditItemResponseData>)}
            rows={2}
            className="w-full px-3 py-2 text-sm border border-red-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent resize-none bg-red-50"
            placeholder="Describe corrective action..."
          />
        </div>
      )}
    </div>
  );
}

function ReverseYesNoInput({
  response,
  onChange,
}: {
  response: AuditItemResponseData;
  onChange: (id: string, updates: Partial<AuditItemResponseData>) => void;
}) {
  const result = response.result || "pending";
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button
          onClick={() => onChange(response.id, { result: "yes" } as Partial<AuditItemResponseData>)}
          className={cn(
            "px-4 py-2 text-sm font-medium rounded-lg border transition-all",
            result === "yes"
              ? "bg-red-100 text-red-700 border-red-300 ring-2 ring-red-400"
              : "bg-card text-muted border-border hover:bg-surface"
          )}
        >
          YES (Hazard Found)
        </button>
        <button
          onClick={() => onChange(response.id, { result: "no" } as Partial<AuditItemResponseData>)}
          className={cn(
            "px-4 py-2 text-sm font-medium rounded-lg border transition-all",
            result === "no"
              ? "bg-emerald-100 text-emerald-700 border-emerald-300 ring-2 ring-emerald-400"
              : "bg-card text-muted border-border hover:bg-surface"
          )}
        >
          NO (Compliant)
        </button>
        <button
          onClick={() => onChange(response.id, { result: "na" } as Partial<AuditItemResponseData>)}
          className={cn(
            "px-4 py-2 text-sm font-medium rounded-lg border transition-all",
            result === "na"
              ? "bg-surface text-muted border-border ring-2 ring-gray-400"
              : "bg-card text-muted border-border hover:bg-surface"
          )}
        >
          N/A
        </button>
      </div>
      {result === "yes" && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-xs font-medium text-red-700 mb-2 flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" />
            YES means a hazard or issue was found — action is required
          </p>
          <textarea
            value={response.actionRequired || ""}
            onChange={(e) => onChange(response.id, { actionRequired: e.target.value } as Partial<AuditItemResponseData>)}
            rows={2}
            className="w-full px-3 py-2 text-sm border border-red-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent resize-none bg-card"
            placeholder="Describe required corrective action..."
          />
        </div>
      )}
    </div>
  );
}

function ReviewDateInput({
  response,
  onChange,
}: {
  response: AuditItemResponseData;
  onChange: (id: string, updates: Partial<AuditItemResponseData>) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-foreground/80 mb-1">
          Date of Review
        </label>
        <input
          type="date"
          value={response.evidenceSighted || ""}
          onChange={(e) =>
            onChange(response.id, {
              evidenceSighted: e.target.value,
              result: e.target.value ? "yes" : "pending",
            } as Partial<AuditItemResponseData>)
          }
          className="w-full max-w-xs px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground/80 mb-1">
          Action Required
        </label>
        <textarea
          value={response.actionRequired || ""}
          onChange={(e) => onChange(response.id, { actionRequired: e.target.value } as Partial<AuditItemResponseData>)}
          rows={2}
          className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent resize-none"
          placeholder="Any actions required from review..."
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main Form Component                                                 */
/* ------------------------------------------------------------------ */

export function AuditCompletionForm({ auditId }: { auditId: string }) {
  const router = useRouter();
  const { data: audit, isLoading } = useAuditDetail(auditId);
  const updateAudit = useUpdateAudit();
  const saveResponses = useSaveAuditResponses();

  // Local response state — initialized from fetched data
  const [localResponses, setLocalResponses] = useState<Record<string, Partial<AuditItemResponseData>>>({});
  const [summaryFields, setSummaryFields] = useState({
    strengths: "",
    areasForImprovement: "",
    actionPlan: "",
    comments: "",
  });
  const [summaryInitialized, setSummaryInitialized] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  // Initialize summary fields from audit data
  if (audit && !summaryInitialized) {
    setSummaryFields({
      strengths: audit.strengths || "",
      areasForImprovement: audit.areasForImprovement || "",
      actionPlan: audit.actionPlan || "",
      comments: audit.comments || "",
    });
    setSummaryInitialized(true);
  }

  // Merge server responses with local edits
  const mergedResponses = useMemo(() => {
    if (!audit?.responses) return [];
    return audit.responses.map((r) => ({
      ...r,
      ...localResponses[r.id],
    }));
  }, [audit?.responses, localResponses]);

  // Group by section
  const sections = useMemo(() => {
    const groups: Record<string, typeof mergedResponses> = {};
    for (const r of mergedResponses) {
      const section = r.templateItem.section || "General";
      if (!groups[section]) groups[section] = [];
      groups[section].push(r);
    }
    // Sort within sections by sortOrder
    for (const items of Object.values(groups)) {
      items.sort((a, b) => a.templateItem.sortOrder - b.templateItem.sortOrder);
    }
    return groups;
  }, [mergedResponses]);

  const sectionNames = Object.keys(sections);

  // Progress tracking
  const totalItems = mergedResponses.length;
  const answeredItems = mergedResponses.filter((r) => r.result && r.result !== "pending").length;
  const progressPercent = totalItems > 0 ? Math.round((answeredItems / totalItems) * 100) : 0;

  const handleResponseChange = useCallback(
    (id: string, updates: Partial<AuditItemResponseData>) => {
      setLocalResponses((prev) => ({
        ...prev,
        [id]: { ...prev[id], ...updates },
      }));
    },
    []
  );

  const toggleSection = (section: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  // Start audit
  const handleStart = async () => {
    try {
      await updateAudit.mutateAsync({ id: auditId, action: "start" });
    } catch {
      /* error handled by mutation */
    }
  };

  // Save progress
  const handleSave = async () => {
    if (!audit) return;
    setSaving(true);
    try {
      // Save responses
      const responsesToSave = Object.entries(localResponses).map(([id, updates]) => ({
        id,
        result: updates.result as string | undefined,
        ratingValue: updates.ratingValue as number | null | undefined,
        actionRequired: updates.actionRequired as string | null | undefined,
        evidenceSighted: updates.evidenceSighted as string | null | undefined,
        notes: updates.notes as string | null | undefined,
      }));
      if (responsesToSave.length > 0) {
        await saveResponses.mutateAsync({ instanceId: auditId, responses: responsesToSave });
      }
      // Save summary fields
      await updateAudit.mutateAsync({
        id: auditId,
        ...summaryFields,
      });
      setLocalResponses({});
    } catch {
      /* error handled */
    } finally {
      setSaving(false);
    }
  };

  // Complete audit
  const handleComplete = async () => {
    // Validate all required items are answered
    const unanswered = mergedResponses.filter(
      (r) => r.templateItem.isRequired && (!r.result || r.result === "pending")
    );
    if (unanswered.length > 0) {
      alert(`${unanswered.length} required item(s) are unanswered. Please complete them before finishing.`);
      return;
    }
    // Check for NO items without action
    const noWithoutAction = mergedResponses.filter(
      (r) =>
        (r.result === "no" || (r.ratingValue != null && r.ratingValue <= 3)) &&
        !r.actionRequired
    );
    if (noWithoutAction.length > 0) {
      const proceed = confirm(
        `${noWithoutAction.length} non-compliant item(s) have no action plan. Continue anyway?`
      );
      if (!proceed) return;
    }

    setSaving(true);
    try {
      // Save any pending responses first
      const responsesToSave = Object.entries(localResponses).map(([id, updates]) => ({
        id,
        result: updates.result as string | undefined,
        ratingValue: updates.ratingValue as number | null | undefined,
        actionRequired: updates.actionRequired as string | null | undefined,
        evidenceSighted: updates.evidenceSighted as string | null | undefined,
        notes: updates.notes as string | null | undefined,
      }));
      if (responsesToSave.length > 0) {
        await saveResponses.mutateAsync({ instanceId: auditId, responses: responsesToSave });
      }
      // Save summary + complete
      await updateAudit.mutateAsync({
        id: auditId,
        action: "complete",
        ...summaryFields,
      });
      setLocalResponses({});
      router.push("/compliance");
    } catch {
      /* error handled */
    } finally {
      setSaving(false);
    }
  };

  // Skip audit
  const handleSkip = async () => {
    const proceed = confirm("Are you sure you want to skip this audit? This cannot be undone.");
    if (!proceed) return;
    try {
      await updateAudit.mutateAsync({ id: auditId, action: "skip" });
      router.push("/compliance");
    } catch {
      /* error handled */
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 text-brand animate-spin" />
      </div>
    );
  }

  if (!audit) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <ClipboardList className="w-16 h-16 text-muted/50 mb-4" />
        <h2 className="text-xl font-semibold text-foreground mb-1">Audit Not Found</h2>
        <p className="text-muted text-sm mb-6">This audit may have been deleted.</p>
        <button
          onClick={() => router.push("/compliance")}
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-hover transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Compliance
        </button>
      </div>
    );
  }

  const status = statusConfig[audit.status] || statusConfig.scheduled;
  const StatusIcon = status.icon;
  const isEditable = audit.status === "in_progress";
  const canStart = audit.status === "scheduled" || audit.status === "overdue";
  const isComplete = audit.status === "completed";
  const hasItems = audit.template.items.length > 0;
  const responseFormat = audit.template.responseFormat;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-24">
      {/* Back link */}
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-brand transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      {/* Header */}
      <div className="bg-card rounded-xl border border-border shadow-sm p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-brand/10 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-brand" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">{audit.template.name}</h1>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs font-mono font-medium bg-brand/10 text-brand px-2 py-0.5 rounded">
                    QA{audit.template.qualityArea}
                  </span>
                  <span className="text-xs text-muted">{audit.template.nqsReference}</span>
                  <span className="text-xs text-muted">|</span>
                  <span className="text-xs text-muted">{audit.service.name}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4 mt-4 text-sm text-muted">
              <span>
                Due: {new Date(audit.dueDate).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
              </span>
              {audit.auditorName && <span>Auditor: {audit.auditorName}</span>}
              {audit.complianceScore != null && (
                <span className="font-semibold">
                  Score:{" "}
                  <span
                    className={cn(
                      audit.complianceScore >= 80
                        ? "text-emerald-600"
                        : audit.complianceScore >= 60
                        ? "text-amber-600"
                        : "text-red-600"
                    )}
                  >
                    {audit.complianceScore}%
                  </span>
                </span>
              )}
            </div>
          </div>

          <span className={cn("px-3 py-1 text-xs font-medium rounded-full border inline-flex items-center gap-1.5", status.color)}>
            <StatusIcon className="w-3.5 h-3.5" />
            {status.label}
          </span>
        </div>

        {/* Action buttons for scheduled/overdue */}
        {canStart && (
          <div className="mt-4 pt-4 border-t border-border/50 flex items-center gap-3">
            <button
              onClick={handleStart}
              disabled={updateAudit.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-50"
            >
              <Play className="w-4 h-4" />
              Start Audit
            </button>
            <button
              onClick={handleSkip}
              disabled={updateAudit.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 text-muted text-sm font-medium rounded-lg border border-border hover:bg-surface transition-colors disabled:opacity-50"
            >
              <SkipForward className="w-4 h-4" />
              Skip
            </button>
          </div>
        )}
      </div>

      {/* Empty state for templates with no items */}
      {!hasItems && isEditable && (
        <div className="bg-card rounded-xl border border-border shadow-sm p-8 text-center">
          <FileText className="w-12 h-12 text-muted/50 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-foreground mb-1">No Checklist Items</h3>
          <p className="text-sm text-muted mb-4">
            This audit template has no checklist items yet. You can still complete it with summary notes.
          </p>
        </div>
      )}

      {/* Progress bar */}
      {isEditable && hasItems && (
        <div className="bg-card rounded-xl border border-border shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground/80">Progress</span>
            <span className="text-sm text-muted">
              {answeredItems} / {totalItems} items ({progressPercent}%)
            </span>
          </div>
          <div className="w-full h-2 bg-surface rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                progressPercent === 100 ? "bg-emerald-500" : progressPercent >= 50 ? "bg-brand" : "bg-amber-500"
              )}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Checklist items by section */}
      {(isEditable || isComplete) && hasItems && (
        <div className="space-y-4">
          {sectionNames.map((section) => {
            const items = sections[section];
            const isCollapsed = collapsedSections.has(section);
            const sectionAnswered = items.filter((r) => r.result && r.result !== "pending").length;

            return (
              <div key={section} className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                <button
                  onClick={() => toggleSection(section)}
                  className="w-full flex items-center justify-between p-4 hover:bg-surface transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {isCollapsed ? (
                      <ChevronRight className="w-5 h-5 text-muted" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-muted" />
                    )}
                    <h3 className="text-sm font-semibold text-foreground">{section}</h3>
                  </div>
                  <span className="text-xs text-muted">
                    {sectionAnswered}/{items.length} complete
                  </span>
                </button>

                {!isCollapsed && (
                  <div className="divide-y divide-border/50">
                    {items.map((response, idx) => {
                      const itemFormat = response.templateItem.responseFormat || responseFormat;
                      return (
                        <div key={response.id} className="p-4 pl-12">
                          <div className="flex items-start gap-3 mb-3">
                            <span className="text-xs font-mono text-muted mt-0.5 w-6 text-right shrink-0">
                              {idx + 1}.
                            </span>
                            <div className="flex-1">
                              <p className="text-sm font-medium text-foreground">
                                {response.templateItem.question}
                                {response.templateItem.isRequired && (
                                  <span className="text-red-500 ml-1">*</span>
                                )}
                              </p>
                              {response.templateItem.guidance && (
                                <p className="text-xs text-muted mt-1">{response.templateItem.guidance}</p>
                              )}
                            </div>
                          </div>

                          {isEditable && (
                            <div className="ml-9">
                              {itemFormat === "yes_no" && (
                                <YesNoInput response={response} onChange={handleResponseChange} />
                              )}
                              {itemFormat === "rating_1_5" && (
                                <RatingInput response={response} onChange={handleResponseChange} />
                              )}
                              {itemFormat === "compliant" && (
                                <CompliantInput response={response} onChange={handleResponseChange} />
                              )}
                              {itemFormat === "reverse_yes_no" && (
                                <ReverseYesNoInput response={response} onChange={handleResponseChange} />
                              )}
                              {itemFormat === "review_date" && (
                                <ReviewDateInput response={response} onChange={handleResponseChange} />
                              )}
                              {/* Notes field for all formats */}
                              <div className="mt-3">
                                <input
                                  type="text"
                                  value={response.notes || ""}
                                  onChange={(e) =>
                                    handleResponseChange(response.id, { notes: e.target.value } as Partial<AuditItemResponseData>)
                                  }
                                  className="w-full px-3 py-1.5 text-xs border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-brand text-muted"
                                  placeholder="Notes (optional)"
                                />
                              </div>
                            </div>
                          )}

                          {/* Read-only view for completed audits */}
                          {isComplete && (
                            <div className="ml-9 text-sm">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-foreground/80">Result:</span>
                                <span
                                  className={cn(
                                    "px-2 py-0.5 text-xs font-medium rounded",
                                    response.result === "yes"
                                      ? "bg-emerald-100 text-emerald-700"
                                      : response.result === "no"
                                      ? "bg-red-100 text-red-700"
                                      : "bg-surface text-muted"
                                  )}
                                >
                                  {response.result === "na" ? "N/A" : response.result?.toUpperCase()}
                                </span>
                                {response.ratingValue != null && (
                                  <span className="text-muted">Rating: {response.ratingValue}/5</span>
                                )}
                              </div>
                              {response.actionRequired && (
                                <p className="text-xs text-red-600 mt-1">Action: {response.actionRequired}</p>
                              )}
                              {response.notes && (
                                <p className="text-xs text-muted mt-1">Notes: {response.notes}</p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Summary section */}
      {(isEditable || isComplete) && (
        <div className="bg-card rounded-xl border border-border shadow-sm p-6 space-y-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <FileText className="w-4 h-4 text-brand" />
            Audit Summary
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">Strengths</label>
              <textarea
                value={summaryFields.strengths}
                onChange={(e) => setSummaryFields((f) => ({ ...f, strengths: e.target.value }))}
                disabled={!isEditable}
                rows={3}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent resize-none disabled:bg-surface/50 disabled:text-muted"
                placeholder="What was done well..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">Areas for Improvement</label>
              <textarea
                value={summaryFields.areasForImprovement}
                onChange={(e) => setSummaryFields((f) => ({ ...f, areasForImprovement: e.target.value }))}
                disabled={!isEditable}
                rows={3}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent resize-none disabled:bg-surface/50 disabled:text-muted"
                placeholder="What needs attention..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">Action Plan</label>
              <textarea
                value={summaryFields.actionPlan}
                onChange={(e) => setSummaryFields((f) => ({ ...f, actionPlan: e.target.value }))}
                disabled={!isEditable}
                rows={3}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent resize-none disabled:bg-surface/50 disabled:text-muted"
                placeholder="Steps to address issues..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">Comments</label>
              <textarea
                value={summaryFields.comments}
                onChange={(e) => setSummaryFields((f) => ({ ...f, comments: e.target.value }))}
                disabled={!isEditable}
                rows={3}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent resize-none disabled:bg-surface/50 disabled:text-muted"
                placeholder="Additional notes..."
              />
            </div>
          </div>
        </div>
      )}

      {/* Review info for completed audits */}
      {isComplete && audit.reviewedAt && (
        <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="w-4 h-4" />
            Reviewed on {new Date(audit.reviewedAt).toLocaleDateString("en-AU")}
          </div>
          {audit.reviewNotes && <p className="text-sm text-emerald-600 mt-1">{audit.reviewNotes}</p>}
        </div>
      )}

      {/* Sticky action bar */}
      {isEditable && (
        <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border shadow-lg p-4 z-50">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="text-sm text-muted">
              {answeredItems}/{totalItems} items answered
              {Object.keys(localResponses).length > 0 && (
                <span className="text-amber-600 ml-2">
                  ({Object.keys(localResponses).length} unsaved changes)
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-foreground/80 border border-border rounded-lg hover:bg-surface transition-colors disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? "Saving..." : "Save Progress"}
              </button>
              <button
                onClick={handleComplete}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                {saving ? "Completing..." : "Complete Audit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
