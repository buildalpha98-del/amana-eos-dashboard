"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ClipboardCheck,
  Plus,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Copy,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/Skeleton";
import { toast } from "@/hooks/useToast";
import { useService } from "@/hooks/useServices";
import { useQipSuggestions } from "@/hooks/useQipSuggestions";
import { QipSuggestionsPanel } from "@/components/services/QipSuggestionsPanel";
import { QipEvidenceBrowser } from "@/components/services/QipEvidenceBrowser";
import { SatDocument, type SatDocumentQip } from "@/components/services/SatDocument";
import { NQS_STANDARDS, QA_NAMES } from "@/lib/nqs-taxonomy";

// 2026-04-30: NSW services use the SAT (Self-Assessment Tool) terminology
// instead of QIP (Quality Improvement Plan). Same underlying model — just
// the regulator-facing label differs.
function getDocLabels(state: string | null | undefined) {
  const isNSW = state === "NSW";
  return {
    short: isNSW ? "SAT" : "QIP",
    long: isNSW ? "Self-Assessment Tool" : "Quality Improvement Plan",
    article: "a",
  };
}

interface QIP extends SatDocumentQip {
  status: string; // draft | in_review | current | archived
  lastReviewDate: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: typeof CheckCircle2 }> = {
  current: { bg: "bg-emerald-100", text: "text-emerald-700", icon: CheckCircle2 },
  draft: { bg: "bg-gray-100", text: "text-gray-600", icon: Clock },
  in_review: { bg: "bg-amber-100", text: "text-amber-700", icon: AlertCircle },
  archived: { bg: "bg-gray-100", text: "text-gray-400", icon: Clock },
};

const LEGAL_LABELS: Record<string, string> = {
  compliant: "Compliant",
  non_compliant: "Non-compliant",
  not_applicable: "Not Applicable",
  not_assessed: "Not assessed",
};

/**
 * Plain-text render mirroring the government form's section order:
 * philosophy → per QA (Law & Regulations + comments → standards → elements
 * with evidence + Met/Not Met) → Continuous Improvement Opportunities.
 */
function qipToPlainText(docLabel: string, qip: SatDocumentQip): string {
  const divider = "────────────────────";
  const blocks: string[] = [
    `${docLabel} — exported ${new Date().toLocaleDateString("en-AU")}`,
  ];

  if (qip.servicePhilosophy?.trim()) {
    blocks.push(`Service philosophy\n\n${qip.servicePhilosophy.trim()}`);
  }

  const legalComments = (qip.legalComments ?? {}) as Record<string, string>;

  for (let qa = 1; qa <= 7; qa++) {
    const lines: string[] = [`Quality Area ${qa} — ${QA_NAMES[qa]}`];

    const checks = qip.legalChecks.filter((c) => c.qualityArea === qa);
    if (checks.length > 0) {
      lines.push(
        "Law and Regulations:",
        ...checks.map(
          (c) =>
            `- ${c.lawRef} (${c.nqsRef}): ${c.question}\n  Assessment: ${LEGAL_LABELS[c.assessment]}`,
        ),
      );
      const comment = legalComments[String(qa)];
      if (comment?.trim()) lines.push(`Comments:\n${comment.trim()}`);
    }

    for (const standard of NQS_STANDARDS.filter((s) => s.qualityArea === qa)) {
      lines.push(`\nStandard ${standard.code} — ${standard.title}`);
      for (const el of qip.elements.filter((e) => e.standardCode === standard.code)) {
        const evidence = el.evidence.filter((e) => e.trim());
        lines.push(
          `\nElement ${el.code} [${el.concept}] — ${el.description}`,
          `Assessment: ${el.assessment === "met" ? "Met" : el.assessment === "not_met" ? "Not Met" : "Not assessed"}`,
        );
        if (evidence.length > 0) {
          lines.push(
            "Evidence and Key practices:",
            ...evidence.map((entry, i) => `${i + 1}. ${entry}`),
          );
        }
      }
    }
    blocks.push(lines.join("\n"));
  }

  if (qip.improvements.length > 0) {
    blocks.push(
      [
        "Continuous Improvement Opportunities",
        ...qip.improvements.map(
          (r) =>
            `\nStandard/Element: ${r.elementCode}\nIssue: ${r.issue}\nOutcome/goal: ${r.outcomeGoal}\nPriority: ${r.priority}\nSteps: ${r.steps}\nSuccess measure: ${r.successMeasure}\nBy when: ${r.byWhen || "—"}\nStatus: ${r.status.replace(/_/g, " ")}${r.progressNotes ? `\nProgress notes: ${r.progressNotes}` : ""}`,
        ),
      ].join("\n"),
    );
  }

  return blocks.join(`\n\n${divider}\n\n`);
}

export function ServiceQIPTab({ serviceId }: { serviceId: string }) {
  const queryClient = useQueryClient();
  const { data: service } = useService(serviceId);
  const docLabels = getDocLabels(service?.state);

  const { data, isLoading } = useQuery({
    queryKey: ["qip", serviceId],
    queryFn: async () => {
      const res = await fetch(`/api/qip?serviceId=${serviceId}`);
      if (!res.ok) throw new Error("Failed to fetch QIP");
      const json = await res.json();
      return json.qips as QIP[];
    },
    retry: 2,
    staleTime: 30_000,
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

  const qip = data?.[0];

  const [reviewOpen, setReviewOpen] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const { data: suggestionData } = useQipSuggestions(qip?.id);
  const pendingCount = suggestionData?.count ?? 0;

  async function copyForPortal() {
    if (!qip) return;
    try {
      await navigator.clipboard.writeText(qipToPlainText(docLabels.long, qip));
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
          Create {docLabels.article} {docLabels.long} to track NQS elements,
          evidence, and improvement plans for this service.
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

      {/* Document header */}
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-brand/10 flex items-center justify-center">
              <ClipboardCheck className="w-5 h-5 text-brand" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">{docLabels.long}</h3>
              <p className="text-sm text-muted">
                {qip.documentType === "sat" ? "SAT" : "QIP"} •{" "}
                {qip.lastReviewDate
                  ? `Last reviewed ${new Date(qip.lastReviewDate).toLocaleDateString()}`
                  : "Not yet reviewed"}
              </p>
            </div>
          </div>
          <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full capitalize", statusStyle.bg, statusStyle.text)}>
            <StatusIcon className="w-3.5 h-3.5" />
            {qip.status.replace(/_/g, " ")}
          </span>
        </div>
      </div>

      <SatDocument qip={qip} serviceId={serviceId} />
    </div>
  );
}
