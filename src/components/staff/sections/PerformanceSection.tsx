"use client";

/**
 * PerformanceSection — orange section in the long-scroll profile.
 * Sub-tabs: Cases · Reviews · 9-Box · Management notes.
 *
 * Cases + Reviews are wired against their own APIs (admin-only).
 * 9-Box and Management notes remain scaffolded for future phases.
 *
 * 2026-05-04: introduced (spec PR #77, PR 3).
 * 2026-06-01: Cases sub-tab wired (HR audit follow-up — fills the
 *             unfair-dismissal records gap).
 * 2026-06-01: Reviews sub-tab wired (performance review framework
 *             phase 1 — schema + admin shell).
 */

import { Grid3x3, NotebookPen } from "lucide-react";
import { SectionShell } from "./SectionShell";
import { PerformanceCasesTab } from "@/components/staff/PerformanceCasesTab";
import { PerformanceReviewsTab } from "@/components/staff/PerformanceReviewsTab";

type SubTab = "cases" | "reviews" | "talent" | "notes";

const SUB_TABS = [
  { key: "cases", label: "Cases" },
  { key: "reviews", label: "Reviews" },
  { key: "talent", label: "9-Box talent grid" },
  { key: "notes", label: "Management notes" },
] as const;

export interface PerformanceSectionProps {
  targetUserId: string;
  targetUserName: string;
  /** Viewer's role — gates owner-only confidential cases at the UI
   *  layer (the server enforces too). */
  viewerRole: string;
}

export function PerformanceSection({
  targetUserId,
  targetUserName,
  viewerRole,
}: PerformanceSectionProps) {
  return (
    <SectionShell<SubTab>
      sectionKey="performance"
      title="Performance"
      accentDotClass="bg-orange-500"
      accentActiveClass="bg-orange-100 dark:bg-orange-950/50 text-orange-900 dark:text-orange-200 border-orange-300 dark:border-orange-800"
      subTabs={SUB_TABS}
    >
      {(active) => {
        if (active === "cases") {
          return (
            <PerformanceCasesTab
              targetUserId={targetUserId}
              targetUserName={targetUserName}
              viewerRole={viewerRole}
            />
          );
        }
        if (active === "reviews") {
          return (
            <PerformanceReviewsTab
              targetUserId={targetUserId}
              targetUserName={targetUserName}
              viewerRole={viewerRole}
            />
          );
        }
        if (active === "talent")
          return (
            <PerformancePlanned
              icon={Grid3x3}
              feature="9-Box talent grid"
            />
          );
        return (
          <PerformancePlanned
            icon={NotebookPen}
            feature="Management notes"
          />
        );
      }}
    </SectionShell>
  );
}

/**
 * Honest "planned" placeholder for features that are on the roadmap but
 * not built. Deliberately muted and visually distinct from shipped
 * tabs — a dashed "Planned" badge and no interactive affordance — so
 * nobody mistakes an empty screen for missing data. (Locked decision,
 * staff-portal-v2 Task 8.3.)
 */
function PerformancePlanned({
  icon: Icon,
  feature,
}: {
  icon: React.ComponentType<{ className?: string }>;
  feature: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center rounded-xl border border-dashed border-border">
      <Icon className="h-8 w-8 text-border mb-3" />
      <span className="inline-flex items-center rounded-full border border-dashed border-border px-2.5 py-0.5 text-2xs font-medium uppercase tracking-wide text-muted mb-2">
        Planned — not built yet
      </span>
      <p className="text-sm text-muted">{feature} is on the roadmap.</p>
      <p className="text-xs text-muted/70 mt-1">
        Nothing is recorded here today.
      </p>
    </div>
  );
}
