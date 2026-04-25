"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Sparkles,
} from "lucide-react";
import { toast } from "@/hooks/useToast";
import {
  useCentreAvatar,
  useMarkCentreAvatarReviewed,
  useOpenCentreAvatar,
  useUpdateCentreAvatarSection,
} from "@/hooks/useCentreAvatars";
import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { SectionCard } from "@/components/centre-avatars/SectionCard";
import { ClaudePromptModal } from "@/components/centre-avatars/ClaudePromptModal";
import {
  CampaignLog,
  CheckInsLog,
  InsightsLog,
  SchoolLiaisonLog,
  UpdateLog,
} from "@/components/centre-avatars/LivingLogs";

const FRESHNESS_META = {
  fresh: { label: "Fresh", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  aging: { label: "Aging", className: "bg-amber-100 text-amber-700 border-amber-200" },
  stale: { label: "Stale", className: "bg-rose-100 text-rose-700 border-rose-200" },
} as const;

export default function CentreAvatarDetailPage({
  params,
}: {
  params: Promise<{ serviceId: string }>;
}) {
  const { serviceId } = use(params);
  const { data: avatar, isLoading, error, refetch } = useCentreAvatar(serviceId);
  const openMut = useOpenCentreAvatar();
  const markReviewed = useMarkCentreAvatarReviewed();
  const updateSection = useUpdateCentreAvatarSection();
  const [claudeOpen, setClaudeOpen] = useState(false);

  // Stamp the Avatar as "opened" on mount — this is the campaign gate signal.
  useEffect(() => {
    if (!serviceId) return;
    openMut.mutate(serviceId);
    // Intentionally run once per serviceId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId]);

  const pendingInsightsCount = useMemo(
    () => (avatar?.insights ?? []).filter((i) => i.status === "pending_review").length,
    [avatar?.insights],
  );

  const handleMarkReviewed = async () => {
    try {
      await markReviewed.mutateAsync(serviceId);
      toast({ description: "Avatar marked as reviewed." });
    } catch (err) {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : "Failed to mark reviewed.",
      });
    }
  };

  const saveSection = (section: "snapshot" | "parentAvatar" | "programmeMix" | "assetLibrary") =>
    async (content: Record<string, unknown>) => {
      await updateSection.mutateAsync({ serviceId, section, content });
    };

  if (error) {
    return (
      <div className="max-w-5xl mx-auto">
        <ErrorState
          title="Failed to load Centre Avatar"
          error={error as Error}
          onRetry={refetch}
        />
      </div>
    );
  }

  if (isLoading || !avatar) {
    return (
      <div className="max-w-5xl mx-auto space-y-4">
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  const meta = FRESHNESS_META[avatar.freshness];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Link
        href="/centre-avatars"
        className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to all Centre Avatars
      </Link>

      <PageHeader
        title={avatar.serviceName}
        description={
          avatar.state
            ? `${avatar.state} · v${avatar.version}`
            : `v${avatar.version}`
        }
        primaryAction={{
          label: "Mark reviewed",
          icon: CheckCircle2,
          onClick: handleMarkReviewed,
          loading: markReviewed.isPending,
          variant: "secondary",
        }}
      />

      {/* Meta banner */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-xs">
        <span
          className={`rounded-md border px-2 py-0.5 font-medium ${meta.className}`}
        >
          {meta.label}
        </span>
        <span className="flex items-center gap-1 text-muted">
          <Clock className="h-3 w-3" />
          Updated{" "}
          {avatar.daysSinceUpdate === 0
            ? "today"
            : `${avatar.daysSinceUpdate}d ago`}
          {avatar.lastUpdatedBy?.name ? ` · ${avatar.lastUpdatedBy.name}` : ""}
        </span>
        {avatar.lastReviewedAt && (
          <span className="flex items-center gap-1 text-muted">
            <CheckCircle2 className="h-3 w-3" />
            Reviewed {new Date(avatar.lastReviewedAt).toLocaleDateString("en-AU")}
            {avatar.lastReviewedBy?.name ? ` · ${avatar.lastReviewedBy.name}` : ""}
          </span>
        )}
        {pendingInsightsCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 font-medium text-amber-700">
            <Sparkles className="h-3 w-3" />
            {pendingInsightsCount} pending insight{pendingInsightsCount === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {/* Section 1 — Snapshot */}
      <SectionCard
        title="1. Centre snapshot"
        description="Official details, coordinator, school contacts, numbers, parent drivers."
        content={avatar.snapshot}
        onSave={saveSection("snapshot")}
        isSaving={updateSection.isPending}
      />

      {/* Section 2 — Parent Avatar (with Claude prompt helper) */}
      <SectionCard
        title="2. Parent avatar"
        description="Who the typical family is, what they want, what stops them enrolling."
        content={avatar.parentAvatar}
        onSave={saveSection("parentAvatar")}
        isSaving={updateSection.isPending}
        extraHeader={
          <button
            type="button"
            onClick={() => setClaudeOpen(true)}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground/80 hover:bg-surface"
          >
            <Sparkles className="h-3.5 w-3.5" /> Draft with Claude
          </button>
        }
      />
      <ClaudePromptModal
        open={claudeOpen}
        onClose={() => setClaudeOpen(false)}
        centreName={avatar.serviceName}
        snapshot={avatar.snapshot}
      />

      {/* Section 3 — Programme Mix */}
      <SectionCard
        title="3. Programme mix"
        description="What's working, what's not, what's missing, programmes we run."
        content={avatar.programmeMix}
        onSave={saveSection("programmeMix")}
        isSaving={updateSection.isPending}
      />

      {/* Section 4 — Insights Log */}
      <InsightsLog serviceId={serviceId} insights={avatar.insights} />

      {/* Section 5 — Campaign Log */}
      <CampaignLog serviceId={serviceId} campaigns={avatar.campaignLog} />

      {/* Section 6 — Coordinator Check-Ins */}
      <CheckInsLog serviceId={serviceId} checkIns={avatar.coordinatorCheckIns} />

      {/* Section 7 — School Liaison Log */}
      <SchoolLiaisonLog serviceId={serviceId} liaisons={avatar.schoolLiaisonLog} />

      {/* Section 8 — Asset Library */}
      <SectionCard
        title="8. Asset library"
        description="Photos, videos, testimonials, consent list, gaps in media."
        content={avatar.assetLibrary}
        onSave={saveSection("assetLibrary")}
        isSaving={updateSection.isPending}
      />

      {/* Section 9 — Update Log */}
      <UpdateLog updates={avatar.updateLog} />
    </div>
  );
}
