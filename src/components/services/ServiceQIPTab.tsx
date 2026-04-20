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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/Skeleton";
import { AiButton } from "@/components/ui/AiButton";
import { toast } from "@/hooks/useToast";

interface QIPQualityArea {
  id: string;
  qualityArea: string;
  rating: string | null;
  strengths: string | null;
  areasForImprovement: string | null;
  goals: string | null;
  strategies: string | null;
  timeline: string | null;
  responsiblePerson: string | null;
  progressNotes: string | null;
}

interface QIP {
  id: string;
  serviceId: string;
  documentType: string;
  status: string;
  currentRating: string | null;
  lastReviewDate: string | null;
  nextReviewDate: string | null;
  reviewedById: string | null;
  qualityAreas: QIPQualityArea[];
  createdAt: string;
  updatedAt: string;
}

const NQS_AREA_LABELS: Record<string, string> = {
  "Educational Program and Practice": "QA1",
  "Children's Health and Safety": "QA2",
  "Physical Environment": "QA3",
  "Staffing Arrangements": "QA4",
  "Relationships with Children": "QA5",
  "Collaborative Partnerships": "QA6",
  "Governance and Leadership": "QA7",
};

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: typeof CheckCircle2 }> = {
  active: { bg: "bg-emerald-100", text: "text-emerald-700", icon: CheckCircle2 },
  draft: { bg: "bg-gray-100", text: "text-gray-600", icon: Clock },
  under_review: { bg: "bg-amber-100", text: "text-amber-700", icon: AlertCircle },
  archived: { bg: "bg-gray-100", text: "text-gray-400", icon: Clock },
};

const RATING_COLORS: Record<string, string> = {
  exceeding: "bg-emerald-100 text-emerald-700",
  meeting: "bg-blue-100 text-blue-700",
  working_towards: "bg-amber-100 text-amber-700",
  requires_improvement: "bg-red-100 text-red-700",
  not_assessed: "bg-gray-100 text-gray-500",
};

export function ServiceQIPTab({ serviceId }: { serviceId: string }) {
  const queryClient = useQueryClient();
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
          No QIP Found
        </h3>
        <p className="text-sm text-muted max-w-md mb-4">
          Create a Quality Improvement Plan to track NQS quality areas, strengths,
          and improvement strategies for this service.
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
          Create QIP
        </button>
      </div>
    );
  }

  const statusStyle = STATUS_STYLES[qip.status] || STATUS_STYLES.draft;
  const StatusIcon = statusStyle.icon;

  return (
    <div className="space-y-6">
      {/* QIP Header */}
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-brand/10 flex items-center justify-center">
              <ClipboardCheck className="w-5 h-5 text-brand" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Quality Improvement Plan</h3>
              <p className="text-sm text-muted">
                {qip.documentType === "qip" ? "QIP" : "SAT"} •{" "}
                {qip.lastReviewDate
                  ? `Last reviewed ${new Date(qip.lastReviewDate).toLocaleDateString()}`
                  : "Not yet reviewed"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {qip.currentRating && (
              <span className={cn("px-2.5 py-1 text-xs font-medium rounded-full capitalize", RATING_COLORS[qip.currentRating] || RATING_COLORS.not_assessed)}>
                {qip.currentRating.replace(/_/g, " ")}
              </span>
            )}
            <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full capitalize", statusStyle.bg, statusStyle.text)}>
              <StatusIcon className="w-3.5 h-3.5" />
              {qip.status.replace(/_/g, " ")}
            </span>
          </div>
        </div>
      </div>

      {/* Quality Areas */}
      <div className="space-y-3">
        {qip.qualityAreas
          .sort((a, b) => {
            const aNum = parseInt(NQS_AREA_LABELS[a.qualityArea]?.replace("QA", "") || "0");
            const bNum = parseInt(NQS_AREA_LABELS[b.qualityArea]?.replace("QA", "") || "0");
            return aNum - bNum;
          })
          .map((area) => {
            const label = NQS_AREA_LABELS[area.qualityArea] || "";
            const isExpanded = expandedArea === area.id;
            const isEditing = editingArea === area.id;
            const ratingClass = RATING_COLORS[area.rating || "not_assessed"] || RATING_COLORS.not_assessed;

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
                      {area.qualityArea}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {area.rating && (
                      <span className={cn("px-2 py-0.5 text-xs font-medium rounded-full capitalize", ratingClass)}>
                        {area.rating.replace(/_/g, " ")}
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
                          { key: "rating", label: "Rating", type: "select", options: ["not_assessed", "requires_improvement", "working_towards", "meeting", "exceeding"] },
                          { key: "strengths", label: "Strengths", type: "textarea" },
                          { key: "areasForImprovement", label: "Areas for Improvement", type: "textarea" },
                          { key: "goals", label: "Goals", type: "textarea" },
                          { key: "strategies", label: "Strategies", type: "textarea" },
                          { key: "timeline", label: "Timeline", type: "input" },
                          { key: "responsiblePerson", label: "Responsible Person", type: "input" },
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
                          { label: "Goals", value: area.goals },
                          { label: "Strategies", value: area.strategies },
                          { label: "Timeline", value: area.timeline },
                          { label: "Responsible Person", value: area.responsiblePerson },
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
                                rating: area.rating || "not_assessed",
                                strengths: area.strengths || "",
                                areasForImprovement: area.areasForImprovement || "",
                                goals: area.goals || "",
                                strategies: area.strategies || "",
                                timeline: area.timeline || "",
                                responsiblePerson: area.responsiblePerson || "",
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
                              qipArea: `${label} — ${area.qualityArea}`,
                              findings: [
                                area.areasForImprovement && `Areas for Improvement: ${area.areasForImprovement}`,
                                area.strengths && `Strengths: ${area.strengths}`,
                                area.goals && `Goals: ${area.goals}`,
                                area.progressNotes && `Progress Notes: ${area.progressNotes}`,
                              ].filter(Boolean).join("\n") || "No findings recorded yet",
                              centreContext: [
                                area.rating && `Current rating: ${area.rating.replace(/_/g, " ")}`,
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
