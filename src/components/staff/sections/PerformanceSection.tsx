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
      accentActiveClass="bg-orange-100 text-orange-900 border-orange-300"
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
            <PerformanceEmpty
              icon={Grid3x3}
              message="9-Box talent grid placement will appear here. Coming in next release."
            />
          );
        return (
          <PerformanceEmpty
            icon={NotebookPen}
            message="Management notes will appear here. Coming in next release."
          />
        );
      }}
    </SectionShell>
  );
}

function PerformanceEmpty({
  icon: Icon,
  message,
}: {
  icon: React.ComponentType<{ className?: string }>;
  message: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <Icon className="h-10 w-10 text-border mb-3" />
      <p className="text-sm text-muted italic">{message}</p>
    </div>
  );
}
