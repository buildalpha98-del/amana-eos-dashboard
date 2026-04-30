"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
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
import { AiGenerateModal } from "@/components/centre-avatars/AiGenerateModal";
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
  const { data: session } = useSession();
  const role = session?.user?.role;
  const isCoordinator = role === "member";
  const canEditSections = role === "owner" || role === "marketing";

  const { data: avatar, isLoading, error, refetch } = useCentreAvatar(serviceId);
  const openMut = useOpenCentreAvatar();
  const markReviewed = useMarkCentreAvatarReviewed();
  const updateSection = useUpdateCentreAvatarSection();
  const [aiOpen, setAiOpen] = useState(false);

  // Stamp the Avatar as "opened" on mount — this is the campaign gate signal.
  // Only marketing/owner triggers this since the gate is for them. Coordinators
  // viewing their own centre don't move the gate.
  useEffect(() => {
    if (!serviceId) return;
    if (!canEditSections) return;
    openMut.mutate(serviceId);
    // Intentionally run once per serviceId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId, canEditSections]);

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
      {!isCoordinator && (
        <Link
          href="/centre-avatars"
          className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to all Centre Avatars
        </Link>
      )}

      <PageHeader
        title={avatar.serviceName}
        description={
          avatar.state
            ? `${avatar.state} · v${avatar.version}`
            : `v${avatar.version}`
        }
        primaryAction={
          canEditSections
            ? {
                label: "Mark reviewed",
                icon: CheckCircle2,
                onClick: handleMarkReviewed,
                loading: markReviewed.isPending,
                variant: "secondary",
              }
            : undefined
        }
      />

      {isCoordinator && (
        <div className="rounded-lg border border-brand/20 bg-brand/5 px-4 py-2 text-xs text-brand">
          You&apos;re viewing this Avatar as the centre coordinator. You can read
          everything and log check-ins. Marketing edits the sections.
        </div>
      )}

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
        sectionKey="snapshot"
        title="1. Centre snapshot"
        description="Official details, coordinator, school contacts, numbers, parent drivers."
        content={avatar.snapshot}
        onSave={saveSection("snapshot")}
        isSaving={updateSection.isPending}
        readOnly={!canEditSections}
      />

      {/* Section 2 — Parent Avatar (with Claude prompt helper) */}
      <SectionCard
        sectionKey="parentAvatar"
        title="2. Parent avatar"
        description="Who the typical family is, what they want, what stops them enrolling."
        content={avatar.parentAvatar}
        onSave={saveSection("parentAvatar")}
        isSaving={updateSection.isPending}
        readOnly={!canEditSections}
        extraHeader={
          canEditSections ? (
            <button
              type="button"
              onClick={() => setAiOpen(true)}
              className="inline-flex items-center gap-1 rounded-md border border-brand/30 bg-brand/5 px-2.5 py-1.5 text-xs font-medium text-brand hover:bg-brand/10"
            >
              <Sparkles className="h-3.5 w-3.5" /> Draft with AI
            </button>
          ) : undefined
        }
      />
      <AiGenerateModal
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        serviceId={serviceId}
        centreName={avatar.serviceName}
        isApplying={updateSection.isPending}
        onApply={async (proposed) => {
          await updateSection.mutateAsync({
            serviceId,
            section: "parentAvatar",
            content: proposed,
            changeSummary: "AI-drafted from snapshot",
          });
          toast({ description: "Parent avatar applied." });
        }}
      />

      {/* Section 3 — Programme Mix */}
      <SectionCard
        sectionKey="programmeMix"
        title="3. Programme mix"
        description="What's working, what's not, what's missing, programmes we run."
        content={avatar.programmeMix}
        onSave={saveSection("programmeMix")}
        isSaving={updateSection.isPending}
        readOnly={!canEditSections}
      />

      {/* Section 4 — Insights Log (coordinators see read-only — marketing
          drives intake decisions) */}
      <InsightsLog
        serviceId={serviceId}
        insights={avatar.insights}
        readOnly={isCoordinator}
      />

      {/* Section 5 — Campaign Log (coordinators read-only) */}
      <CampaignLog
        serviceId={serviceId}
        campaigns={avatar.campaignLog}
        readOnly={isCoordinator}
      />

      {/* Section 6 — Coordinator Check-Ins (coordinator CAN write here for
          their own centre — that's the point of this log) */}
      <CheckInsLog serviceId={serviceId} checkIns={avatar.coordinatorCheckIns} />

      {/* Section 7 — School Liaison Log (coordinators read-only) */}
      <SchoolLiaisonLog
        serviceId={serviceId}
        liaisons={avatar.schoolLiaisonLog}
        readOnly={isCoordinator}
      />

      {/* Section 8 — Asset Library */}
      <SectionCard
        sectionKey="assetLibrary"
        title="8. Asset library"
        description="Photos, videos, testimonials, consent list, gaps in media."
        content={avatar.assetLibrary}
        onSave={saveSection("assetLibrary")}
        isSaving={updateSection.isPending}
        readOnly={!canEditSections}
      />

      {/* Section 9 — Update Log */}
      <UpdateLog updates={avatar.updateLog} />
    </div>
  );
}
