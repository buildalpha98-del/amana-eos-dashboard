"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ClipboardCheck,
  ChevronDown,
  ChevronRight,
  Plus,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  X,
  Sparkles,
  Copy,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/Skeleton";
import { AiButton } from "@/components/ui/AiButton";
import { toast } from "@/hooks/useToast";
import { useService } from "@/hooks/useServices";
import { useQipSuggestions } from "@/hooks/useQipSuggestions";
import { QipSuggestionsPanel } from "@/components/services/QipSuggestionsPanel";
import { QipEvidenceBrowser } from "@/components/services/QipEvidenceBrowser";

/**
 * Plain-text render of the document for pasting into the government portal
 * (NSW SAT portal / VIC QIP submission). Field names follow the API payload;
 * empty sections are skipped.
 */
function qipToPlainText(docLabel: string, areas: QIPQualityArea[]): string {
  const sectionOrder: Array<[keyof QIPQualityArea, string]> = [
    ["strengths", "Strengths"],
    ["areasForImprovement", "Areas for improvement"],
    ["improvementGoal", "Improvement goal"],
    ["strategies", "Strategies"],
    ["timeline", "Timeline"],
    ["responsiblePerson", "Responsible person"],
    ["evidenceIndicators", "Evidence indicators"],
    ["evidenceCollected", "Evidence collected"],
    ["progressNotes", "Progress notes"],
  ];
  const blocks = [...areas]
    .sort((a, b) => a.qualityArea - b.qualityArea)
    .map((area) => {
      const lines = sectionOrder
        .map(([key, label]) => {
          const value = area[key];
          return typeof value === "string" && value.trim()
            ? `${label}:\n${value.trim()}`
            : null;
        })
        .filter(Boolean);
      return [
        `Quality Area ${area.qualityArea}: ${area.qualityAreaName}`,
        ...lines,
      ].join("\n\n");
    });
  return [
    `${docLabel} — exported ${new Date().toLocaleDateString("en-AU")}`,
    ...blocks,
  ].join("\n\n────────────────────\n\n");
}

// 2026-04-30: NSW services use the SAT (Self-Assessment Tool) terminology
// instead of QIP (Quality Improvement Plan). Same underlying model — just
// the regulator-facing label differs.
function getDocLabels(state: string | null | undefined) {
  const isNSW = state === "NSW";
  return {
    short: isNSW ? "SAT" : "QIP",
    long: isNSW ? "Self-Assessment Tool" : "Quality Improvement Plan",
    article: isNSW ? "a" : "a", // both "a SAT" / "a QIP"
  };
}

// Mirrors the Prisma QIPQualityArea row returned by GET /api/qip. Kept exact:
// this interface previously drifted (phantom `rating`/`goals`, `qualityArea`
// as a name string) and the edit form silently lost fields for months.
interface QIPQualityArea {
  id: string;
  qualityArea: number; // 1-7
  qualityAreaName: string;
  strengths: string | null;
  areasForImprovement: string | null;
  improvementGoal: string | null;
  strategies: string | null;
  timeline: string | null;
  responsiblePerson: string | null;
  evidenceIndicators: string | null;
  evidenceCollected: string | null;
  progressNotes: string | null;
  progressStatus: string; // not_started | in_progress | achieved | ongoing
}

interface QIP {
  id: string;
  serviceId: string;
  documentType: string;
  status: string; // draft | in_review | current | archived
  lastReviewDate: string | null;
  reviewedById: string | null;
  qualityAreas: QIPQualityArea[];
  createdAt: string;
  updatedAt: string;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: typeof CheckCircle2 }> = {
  current: { bg: "bg-emerald-100", text: "text-emerald-700", icon: CheckCircle2 },
  draft: { bg: "bg-gray-100", text: "text-gray-600", icon: Clock },
  in_review: { bg: "bg-amber-100", text: "text-amber-700", icon: AlertCircle },
  archived: { bg: "bg-gray-100", text: "text-gray-400", icon: Clock },
};

const PROGRESS_STYLES: Record<string, string> = {
  not_started: "bg-gray-100 text-gray-500",
  in_progress: "bg-amber-100 text-amber-700",
  achieved: "bg-emerald-100 text-emerald-700",
  ongoing: "bg-blue-100 text-blue-700",
};

const PROGRESS_OPTIONS = ["not_started", "in_progress", "achieved", "ongoing"];

export function ServiceQIPTab({ serviceId }: { serviceId: string }) {
  const queryClient = useQueryClient();
  const { data: service } = useService(serviceId);
  const docLabels = getDocLabels(service?.state);
  const [expandedArea, setExpandedArea] = useState<string | null>(null);
  const [editingArea, setEditingArea] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<QIPQualityArea>>({});
  const [aiResult, setAiResult] = useState<Record<string, string | null>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["qip", serviceId],
    queryFn: async () => {
      const res = await fetch(`/api/qip?serviceId=${serviceId}`);
      if (!res.ok) throw new Error("Failed to fetch QIP");
      const json = await res.json();
      return json.qips as QIP[];
    },
  });

  const createQIP = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/qip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId }),
      });
      if (!res.ok) throw new Error("Failed to create QIP");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qip", serviceId] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });

  const updateArea = useMutation({
    mutationFn: async ({ qipId, areaId, data }: { qipId: string; areaId: string; data: Partial<QIPQualityArea> }) => {
      const res = await fetch(`/api/qip/${qipId}/areas/${areaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update quality area");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qip", serviceId] });
      setEditingArea(null);
      setEditForm({});
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });

  const qip = data?.[0];

  // Suggestion review + evidence browser state. Hooks live above the early
  // returns; the suggestions query no-ops until a QIP exists.
  const [reviewOpen, setReviewOpen] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const { data: suggestionData } = useQipSuggestions(qip?.id);
  const pendingCount = suggestionData?.count ?? 0;

  async function copyForPortal() {
    if (!qip) return;
    const text = qipToPlainText(docLabels.long, qip.qualityAreas);
    try {
      await navigator.clipboard.writeText(text);
      toast({ description: `Copied — paste into the ${docLabels.short} portal` });
    } catch {
      toast({ variant: "destructive", description: "Couldn't copy to clipboard" });
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(7)].map((_, i) => (
          <div key={i} className="bg-card rounded-lg border border-border p-4 flex items-center gap-3">
            <Skeleton className="w-10 h-10 rounded-lg" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  if (!qip) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-12 h-12 rounded-full bg-brand/10 flex items-center justify-center mb-4">
          <ClipboardCheck className="w-6 h-6 text-brand" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-1">
          No {docLabels.short} Found
        </h3>
        <p className="text-sm text-muted max-w-md mb-4">
          Create {docLabels.article} {docLabels.long} to track NQS quality
          areas, strengths, and improvement strategies for this service.
        </p>
        <button
          onClick={() => createQIP.mutate()}
          disabled={createQIP.isPending}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand hover:bg-brand-hover rounded-lg transition disabled:opacity-50"
        >
          {createQIP.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Plus className="w-4 h-4" />
          )}
          Create {docLabels.short}
        </button>
      </div>
    );
  }

  const statusStyle = STATUS_STYLES[qip.status] || STATUS_STYLES.draft;
  const StatusIcon = statusStyle.icon;

  return (
    <div className="space-y-6">
      {/* Pending AI suggestions banner */}
      {pendingCount > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-violet-800">
            <Sparkles className="w-4 h-4" />
            <span>
              <strong>{pendingCount}</strong> AI-proposed {docLabels.short} update
              {pendingCount === 1 ? "" : "s"} awaiting your review — nothing changes
              until you approve.
            </span>
          </div>
          <button
            onClick={() => setReviewOpen(true)}
            className="shrink-0 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 transition"
          >
            Review
          </button>
        </div>
      )}

      {/* Evidence + export actions */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setShowEvidence((s) => !s)}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition",
            showEvidence
              ? "bg-brand text-white border-transparent"
              : "bg-card text-foreground border-border hover:bg-surface/60",
          )}
        >
          <Search className="w-3.5 h-3.5" />
          Evidence browser
        </button>
        <button
          onClick={copyForPortal}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-medium text-foreground hover:bg-surface/60 transition"
        >
          <Copy className="w-3.5 h-3.5" />
          Copy for portal
        </button>
      </div>

      {showEvidence && <QipEvidenceBrowser serviceId={serviceId} />}

      <QipSuggestionsPanel
        qipId={qip.id}
        serviceId={serviceId}
        documentLabel={docLabels.short}
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
      />

      {/* QIP Header */}
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-brand/10 flex items-center justify-center">
              <ClipboardCheck className="w-5 h-5 text-brand" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">{docLabels.long}</h3>
              <p className="text-sm text-muted">
                {/* Reflect the row's stored documentType (in case it diverges
                    from the service's current state — e.g. a service was
                    re-located and the row hasn't been re-issued yet). */}
                {qip.documentType === "sat" ? "SAT" : "QIP"} •{" "}
                {qip.lastReviewDate
                  ? `Last reviewed ${new Date(qip.lastReviewDate).toLocaleDateString()}`
                  : "Not yet reviewed"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full capitalize", statusStyle.bg, statusStyle.text)}>
              <StatusIcon className="w-3.5 h-3.5" />
              {qip.status.replace(/_/g, " ")}
            </span>
          </div>
        </div>
      </div>

      {/* Quality Areas */}
      <div className="space-y-3">
        {[...qip.qualityAreas]
          .sort((a, b) => a.qualityArea - b.qualityArea)
          .map((area) => {
            const label = `QA${area.qualityArea}`;
            const isExpanded = expandedArea === area.id;
            const isEditing = editingArea === area.id;
            const progressClass =
              PROGRESS_STYLES[area.progressStatus] || PROGRESS_STYLES.not_started;

            return (
              <div key={area.id} className="bg-card rounded-xl border border-border overflow-hidden">
                <button
                  onClick={() => setExpandedArea(isExpanded ? null : area.id)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-surface/50 transition"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-brand bg-brand/10 px-2 py-1 rounded">
                      {label}
                    </span>
                    <span className="font-medium text-foreground text-sm">
                      {area.qualityAreaName}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {area.progressStatus !== "not_started" && (
                      <span className={cn("px-2 py-0.5 text-xs font-medium rounded-full capitalize", progressClass)}>
                        {area.progressStatus.replace(/_/g, " ")}
                      </span>
                    )}
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-muted" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted" />
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-5 pb-5 border-t border-border/50">
                    {isEditing ? (
                      <div className="space-y-4 pt-4">
                        {[
                          { key: "progressStatus", label: "Progress Status", type: "select", options: PROGRESS_OPTIONS },
                          { key: "strengths", label: "Strengths", type: "textarea" },
                          { key: "areasForImprovement", label: "Areas for Improvement", type: "textarea" },
                          { key: "improvementGoal", label: "Improvement Goal", type: "textarea" },
                          { key: "strategies", label: "Strategies", type: "textarea" },
                          { key: "timeline", label: "Timeline", type: "input" },
                          { key: "responsiblePerson", label: "Responsible Person", type: "input" },
                          { key: "evidenceIndicators", label: "Evidence Indicators", type: "textarea" },
                          { key: "evidenceCollected", label: "Evidence Collected", type: "textarea" },
                          { key: "progressNotes", label: "Progress Notes", type: "textarea" },
                        ].map((field) => (
                          <div key={field.key}>
                            <label className="block text-sm font-medium text-foreground/80 mb-1">
                              {field.label}
                            </label>
                            {field.type === "select" ? (
                              <select
                                value={(editForm as Record<string, string>)[field.key] || ""}
                                onChange={(e) => setEditForm({ ...editForm, [field.key]: e.target.value })}
                                className="w-full border border-border rounded-lg px-3 py-2 text-sm"
                              >
                                {field.options?.map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt.replace(/_/g, " ")}
                                  </option>
                                ))}
                              </select>
                            ) : field.type === "textarea" ? (
                              <textarea
                                value={(editForm as Record<string, string>)[field.key] || ""}
                                onChange={(e) => setEditForm({ ...editForm, [field.key]: e.target.value })}
                                rows={3}
                                className="w-full border border-border rounded-lg px-3 py-2 text-sm"
                              />
                            ) : (
                              <input
                                type="text"
                                value={(editForm as Record<string, string>)[field.key] || ""}
                                onChange={(e) => setEditForm({ ...editForm, [field.key]: e.target.value })}
                                className="w-full border border-border rounded-lg px-3 py-2 text-sm"
                              />
                            )}
                          </div>
                        ))}
                        <div className="flex justify-end gap-2 pt-2">
                          <button
                            onClick={() => { setEditingArea(null); setEditForm({}); }}
                            className="px-3 py-1.5 text-sm text-muted hover:text-foreground"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => updateArea.mutate({ qipId: qip.id, areaId: area.id, data: editForm })}
                            disabled={updateArea.isPending}
                            className="px-3 py-1.5 text-sm font-medium text-white bg-brand hover:bg-brand-hover rounded-lg transition disabled:opacity-50"
                          >
                            {updateArea.isPending ? "Saving..." : "Save"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3 pt-4">
                        {[
                          { label: "Strengths", value: area.strengths },
                          { label: "Areas for Improvement", value: area.areasForImprovement },
                          { label: "Improvement Goal", value: area.improvementGoal },
                          { label: "Strategies", value: area.strategies },
                          { label: "Timeline", value: area.timeline },
                          { label: "Responsible Person", value: area.responsiblePerson },
                          { label: "Evidence Indicators", value: area.evidenceIndicators },
                          { label: "Evidence Collected", value: area.evidenceCollected },
                          { label: "Progress Notes", value: area.progressNotes },
                        ].map((field) => (
                          <div key={field.label}>
                            <dt className="text-xs font-medium text-muted uppercase tracking-wide">
                              {field.label}
                            </dt>
                            <dd className="text-sm text-foreground mt-0.5 whitespace-pre-wrap">
                              {field.value || <span className="text-muted italic">Not set</span>}
                            </dd>
                          </div>
                        ))}
                        <div className="flex items-center gap-3 pt-2">
                          <button
                            onClick={() => {
                              setEditingArea(area.id);
                              setEditForm({
                                progressStatus: area.progressStatus || "not_started",
                                strengths: area.strengths || "",
                                areasForImprovement: area.areasForImprovement || "",
                                improvementGoal: area.improvementGoal || "",
                                strategies: area.strategies || "",
                                timeline: area.timeline || "",
                                responsiblePerson: area.responsiblePerson || "",
                                evidenceIndicators: area.evidenceIndicators || "",
                                evidenceCollected: area.evidenceCollected || "",
                                progressNotes: area.progressNotes || "",
                              });
                            }}
                            className="text-sm font-medium text-brand hover:text-brand-hover transition"
                          >
                            Edit Quality Area
                          </button>
                          <AiButton
                            templateSlug="compliance/qip-action-plan"
                            variables={{
                              qipArea: `${label} — ${area.qualityAreaName}`,
                              findings: [
                                area.areasForImprovement && `Areas for Improvement: ${area.areasForImprovement}`,
                                area.strengths && `Strengths: ${area.strengths}`,
                                area.improvementGoal && `Improvement Goal: ${area.improvementGoal}`,
                                area.progressNotes && `Progress Notes: ${area.progressNotes}`,
                              ].filter(Boolean).join("\n") || "No findings recorded yet",
                              centreContext: [
                                `Progress status: ${area.progressStatus.replace(/_/g, " ")}`,
                                area.strategies && `Existing strategies: ${area.strategies}`,
                                area.timeline && `Timeline: ${area.timeline}`,
                                area.responsiblePerson && `Responsible: ${area.responsiblePerson}`,
                              ].filter(Boolean).join("\n") || "No additional context",
                            }}
                            onResult={(text) => setAiResult((prev) => ({ ...prev, [area.id]: text }))}
                            label="AI Action Plan"
                            size="sm"
                            section="compliance"
                          />
                        </div>

                        {/* AI Action Plan Result Panel */}
                        {aiResult[area.id] && (
                          <div className="mt-3 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="text-sm font-medium text-purple-800">
                                AI-Generated Action Plan
                              </h4>
                              <button
                                onClick={() => setAiResult((prev) => ({ ...prev, [area.id]: null }))}
                                className="text-purple-400 hover:text-purple-600"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                            <div className="text-sm text-purple-900 whitespace-pre-wrap">
                              {aiResult[area.id]}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
