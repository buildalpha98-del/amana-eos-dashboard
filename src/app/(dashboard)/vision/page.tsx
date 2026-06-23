"use client";

import { useVTO } from "@/hooks/useVTO";
import { useIssues, useUpdateIssue, usePromoteIssueToRock } from "@/hooks/useIssues";
import { CreateIssueModal } from "@/components/issues/CreateIssueModal";
import { useRocks } from "@/hooks/useRocks";
import { getCurrentQuarter } from "@/lib/utils";
import { CoreValuesCard } from "@/components/vision/CoreValuesCard";
import { VTOSection } from "@/components/vision/VTOSection";
import { GoToMarketStrategyCard } from "@/components/vision/GoToMarketStrategyCard";
import { ThreeYearPictureCard } from "@/components/vision/ThreeYearPictureCard";
import { OneYearPlanCard } from "@/components/vision/OneYearPlanCard";
import {
  Eye,
  AlertTriangle,
  Mountain,
  ArrowRight,
  ArrowLeftCircle,
  Plus,
  Download,
} from "lucide-react";
import { useState } from "react";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";
import { HelpTooltip } from "@/components/ui/HelpTooltip";
import { PageHeader } from "@/components/layout/PageHeader";
import Link from "next/link";

export default function VisionPage() {
  const { data: vto, isLoading, error } = useVTO();
  const quarter = getCurrentQuarter();
  const { data: issues } = useIssues({ category: "long_term" });
  const { data: rocks } = useRocks(quarter);
  const updateIssue = useUpdateIssue();
  const promoteToRock = usePromoteIssueToRock();
  const [downloading, setDownloading] = useState(false);
  const [showCreateLongTerm, setShowCreateLongTerm] = useState(false);

  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      const res = await fetch("/api/vto/pdf");
      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        throw new Error(msg || `Download failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `amana-vto-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : "Couldn't generate PDF",
      });
    } finally {
      setDownloading(false);
    }
  };

  // Long-Term Issues List — parked on the V/TO, reviewed at the quarterly.
  // Backed by Issue rows with category = long_term (the fetch above scopes it).
  const companyIssues = issues?.filter(
    (i) => i.status !== "solved" && i.status !== "closed"
  ) ?? [];

  // Rock stats for current quarter
  const rockStats = rocks
    ? {
        total: rocks.length,
        onTrack: rocks.filter((r) => r.status === "on_track").length,
        offTrack: rocks.filter((r) => r.status === "off_track").length,
        done: rocks.filter((r) => r.status === "complete").length,
        avgProgress: rocks.length > 0
          ? Math.round(rocks.reduce((sum, r) => sum + r.percentComplete, 0) / rocks.length)
          : 0,
      }
    : null;

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader
        title="Vision / Traction Organiser"
        description="Your strategic compass — click any section to edit"
        helpTooltipId="vto-heading"
        helpTooltipContent="Your Vision/Traction Organizer defines where you're going and how you'll get there. Review quarterly to stay aligned."
        primaryAction={{
          label: "Download PDF",
          icon: Download,
          onClick: handleDownloadPdf,
          loading: downloading,
          hidden: !vto,
          variant: "secondary",
        }}
      />

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <div className="animate-spin w-8 h-8 border-2 border-brand border-t-transparent rounded-full" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-24 text-center bg-card rounded-xl border border-border">
          <div className="w-16 h-16 rounded-2xl bg-brand/5 flex items-center justify-center mb-4">
            <Eye className="w-8 h-8 text-brand/30" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">
            V/TO not available
          </h3>
          <p className="text-muted mt-2 max-w-md">
            No Vision/Traction Organiser has been set up yet. Run the database
            seed to create the default V/TO.
          </p>
        </div>
      ) : vto ? (
        <div className="space-y-6">
          {/* Vision Side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-6">
              <div className="flex items-center gap-2 px-1">
                <div className="w-1.5 h-6 rounded-full bg-brand" />
                <h3 className="text-sm font-bold text-brand uppercase tracking-wider">
                  Vision
                </h3>
              </div>

              <CoreValuesCard values={vto.coreValues} />

              <VTOSection
                title="Core Purpose"
                field="corePurpose"
                value={vto.corePurpose}
                sectionLabels={vto.sectionLabels}
              />

              <VTOSection
                title="Core Niche"
                field="coreNiche"
                value={vto.coreNiche}
                sectionLabels={vto.sectionLabels}
              />

              <VTOSection
                title="10-Year Target (BHAG)"
                field="tenYearTarget"
                value={vto.tenYearTarget}
                multiline
                sectionLabels={vto.sectionLabels}
              />
            </div>

            {/* Traction Side */}
            <div className="space-y-6">
              <div className="flex items-center gap-2 px-1">
                <div className="w-1.5 h-6 rounded-full bg-accent" />
                <h3 className="text-sm font-bold text-foreground/80 uppercase tracking-wider">
                  Traction
                </h3>
              </div>

              <ThreeYearPictureCard vto={vto} />

              <OneYearPlanCard vto={vto} />

              <GoToMarketStrategyCard vto={vto} />
            </div>
          </div>

          {/* Current Quarter Rocks */}
          <div className="bg-card rounded-xl border border-border p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Mountain className="w-5 h-5 text-brand" />
                <h3 className="text-sm font-bold text-foreground">
                  {quarter} Rocks
                </h3>
              </div>
              <Link
                href="/rocks"
                className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
              >
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {rockStats && rockStats.total > 0 ? (
              <div className="space-y-4">
                {/* Progress bar */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-muted">
                      Average completion
                    </span>
                    <span className="text-sm font-semibold text-brand">
                      {rockStats.avgProgress}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-surface rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand rounded-full transition-all"
                      style={{ width: `${rockStats.avgProgress}%` }}
                    />
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-4 gap-3">
                  <div className="text-center">
                    <div className="text-lg font-bold text-foreground">
                      {rockStats.total}
                    </div>
                    <div className="text-[10px] text-muted uppercase tracking-wider">
                      Total
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-emerald-600">
                      {rockStats.onTrack}
                    </div>
                    <div className="text-[10px] text-emerald-600 uppercase tracking-wider">
                      On Track
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-red-600">
                      {rockStats.offTrack}
                    </div>
                    <div className="text-[10px] text-red-600 uppercase tracking-wider">
                      Off Track
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-brand">
                      {rockStats.done}
                    </div>
                    <div className="text-[10px] text-brand uppercase tracking-wider">
                      Done
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted">
                No rocks set for {quarter} yet.
              </p>
            )}
          </div>

          {/* Long-Term Issues List — the V/TO parking lot, reviewed quarterly */}
          <div className="bg-card rounded-xl border border-border p-6">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                <h3 className="text-sm font-bold text-foreground">
                  Long-Term Issues
                </h3>
                {companyIssues.length > 0 && (
                  <span className="text-xs text-muted">
                    ({companyIssues.length} parked)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowCreateLongTerm(true)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
                >
                  <Plus className="w-3 h-3" /> Add
                </button>
                <Link
                  href="/issues"
                  className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
                >
                  View all <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
            <p className="text-xs text-muted mb-4">
              Strategic issues parked for the quarterly — promote into Rocks or pull onto the weekly list.
            </p>

            {companyIssues.length > 0 ? (
              <div className="space-y-1.5">
                {companyIssues.slice(0, 6).map((issue) => (
                  <div
                    key={issue.id}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-surface transition-colors group"
                  >
                    <div
                      className={cn(
                        "w-2 h-2 rounded-full flex-shrink-0",
                        issue.priority === "critical"
                          ? "bg-red-500"
                          : issue.priority === "high"
                          ? "bg-amber-500"
                          : "bg-gray-300"
                      )}
                    />
                    <span className="text-sm text-foreground/80 truncate flex-1">
                      {issue.title}
                    </span>
                    <button
                      onClick={() => updateIssue.mutate({ id: issue.id, category: "short_term" })}
                      disabled={updateIssue.isPending}
                      title="Pull onto the weekly short-term list"
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 hover:text-amber-800 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                    >
                      <ArrowLeftCircle className="w-3.5 h-3.5" /> Short-Term
                    </button>
                    {!issue.rockId && (
                      <button
                        onClick={() => promoteToRock.mutate({ id: issue.id })}
                        disabled={promoteToRock.isPending}
                        title="Promote into a Rock for next quarter"
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-brand hover:text-brand-hover opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                      >
                        <Mountain className="w-3.5 h-3.5" /> Rock
                      </button>
                    )}
                  </div>
                ))}
                {companyIssues.length > 6 && (
                  <Link
                    href="/issues"
                    className="block text-center text-xs text-brand hover:underline py-1"
                  >
                    +{companyIssues.length - 6} more on the long-term list
                  </Link>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted">
                Nothing parked long-term. Drop strategic issues here from the weekly L10.
              </p>
            )}
          </div>
        </div>
      ) : null}

      <CreateIssueModal
        open={showCreateLongTerm}
        onClose={() => setShowCreateLongTerm(false)}
        defaultCategory="long_term"
      />
    </div>
  );
}
