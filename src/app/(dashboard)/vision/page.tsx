"use client";

import { useVTO } from "@/hooks/useVTO";
import { useIssues } from "@/hooks/useIssues";
import { useRocks } from "@/hooks/useRocks";
import { getCurrentQuarter } from "@/lib/utils";
import { CoreValuesCard } from "@/components/vision/CoreValuesCard";
import { VTOSection } from "@/components/vision/VTOSection";
import { GoalsSection } from "@/components/vision/GoalsSection";
import {
  Eye,
  AlertTriangle,
  Mountain,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

export default function VisionPage() {
  const { data: vto, isLoading, error } = useVTO();
  const quarter = getCurrentQuarter();
  const { data: issues } = useIssues();
  const { data: rocks } = useRocks(quarter);

  // Company-level issues (no owner assigned = company-level parking lot)
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
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            Vision / Traction Organiser
          </h2>
          <p className="text-sm text-gray-500">
            Your strategic compass — click any section to edit
          </p>
        </div>
        {vto?.updatedBy && (
          <p className="text-xs text-gray-400">
            Last updated by {vto.updatedBy.name} on{" "}
            {new Date(vto.updatedAt).toLocaleDateString("en-AU", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </p>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <div className="animate-spin w-8 h-8 border-2 border-[#004E64] border-t-transparent rounded-full" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-xl border border-gray-200">
          <div className="w-16 h-16 rounded-2xl bg-[#004E64]/5 flex items-center justify-center mb-4">
            <Eye className="w-8 h-8 text-[#004E64]/30" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">
            V/TO not available
          </h3>
          <p className="text-gray-500 mt-2 max-w-md">
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
                <div className="w-1.5 h-6 rounded-full bg-[#004E64]" />
                <h3 className="text-sm font-bold text-[#004E64] uppercase tracking-wider">
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
                <div className="w-1.5 h-6 rounded-full bg-[#FECE00]" />
                <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">
                  Traction
                </h3>
              </div>

              <VTOSection
                title="3-Year Picture"
                field="threeYearPicture"
                value={vto.threeYearPicture}
                multiline
                sectionLabels={vto.sectionLabels}
              />

              <GoalsSection goals={vto.oneYearGoals} vtoId={vto.id} />

              <VTOSection
                title="Marketing Strategy"
                field="marketingStrategy"
                value={vto.marketingStrategy}
                multiline
                sectionLabels={vto.sectionLabels}
              />
            </div>
          </div>

          {/* Current Quarter Rocks */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Mountain className="w-5 h-5 text-[#004E64]" />
                <h3 className="text-sm font-bold text-gray-900">
                  {quarter} Rocks
                </h3>
              </div>
              <Link
                href="/rocks"
                className="inline-flex items-center gap-1 text-xs font-medium text-[#004E64] hover:underline"
              >
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {rockStats && rockStats.total > 0 ? (
              <div className="space-y-4">
                {/* Progress bar */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-gray-500">
                      Average completion
                    </span>
                    <span className="text-sm font-semibold text-[#004E64]">
                      {rockStats.avgProgress}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#004E64] rounded-full transition-all"
                      style={{ width: `${rockStats.avgProgress}%` }}
                    />
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-4 gap-3">
                  <div className="text-center">
                    <div className="text-lg font-bold text-gray-900">
                      {rockStats.total}
                    </div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider">
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
                    <div className="text-lg font-bold text-[#004E64]">
                      {rockStats.done}
                    </div>
                    <div className="text-[10px] text-[#004E64] uppercase tracking-wider">
                      Done
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400">
                No rocks set for {quarter} yet.
              </p>
            )}
          </div>

          {/* Company Issues (IDS Parking Lot) */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                <h3 className="text-sm font-bold text-gray-900">
                  Company Issues
                </h3>
                {companyIssues.length > 0 && (
                  <span className="text-xs text-gray-400">
                    ({companyIssues.length} open)
                  </span>
                )}
              </div>
              <Link
                href="/issues"
                className="inline-flex items-center gap-1 text-xs font-medium text-[#004E64] hover:underline"
              >
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {companyIssues.length > 0 ? (
              <div className="space-y-2">
                {companyIssues.slice(0, 5).map((issue) => (
                  <Link
                    key={issue.id}
                    href="/issues"
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors group"
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
                    <span className="text-sm text-gray-700 truncate flex-1 group-hover:text-gray-900">
                      {issue.title}
                    </span>
                    <span className="text-[10px] text-gray-400 uppercase flex-shrink-0">
                      {issue.status.replace("_", " ")}
                    </span>
                  </Link>
                ))}
                {companyIssues.length > 5 && (
                  <Link
                    href="/issues"
                    className="block text-center text-xs text-[#004E64] hover:underline py-1"
                  >
                    +{companyIssues.length - 5} more issues
                  </Link>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400">
                No open company issues — great job!
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
