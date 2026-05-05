"use client";

/**
 * PerformanceSection — orange section in the long-scroll profile.
 * Sub-tabs for Reviews · 9-Box · Management notes. Each is currently
 * a placeholder: the underlying data lives in `Review`, `TalentGrid`,
 * and `ManagementNote` models but isn't yet on the staff-profile data
 * load. Wiring them is a small follow-up PR — the surface stays
 * scaffolded so the executing agent can drop in the queries when
 * they land.
 *
 * 2026-05-04: introduced (spec PR #77, PR 3).
 */

import { Award, Grid3x3, NotebookPen } from "lucide-react";
import { SectionShell } from "./SectionShell";

type SubTab = "reviews" | "talent" | "notes";

const SUB_TABS = [
  { key: "reviews", label: "Reviews" },
  { key: "talent", label: "9-Box talent grid" },
  { key: "notes", label: "Management notes" },
] as const;

export function PerformanceSection() {
  return (
    <SectionShell<SubTab>
      sectionKey="performance"
      title="Performance"
      accentDotClass="bg-orange-500"
      accentActiveClass="bg-orange-100 text-orange-900 border-orange-300"
      subTabs={SUB_TABS}
    >
      {(active) => {
        if (active === "reviews") return <PerformanceEmpty icon={Award} message="Performance reviews will appear here. Coming in next release." />;
        if (active === "talent") return <PerformanceEmpty icon={Grid3x3} message="9-Box talent grid placement will appear here. Coming in next release." />;
        return <PerformanceEmpty icon={NotebookPen} message="Management notes will appear here. Coming in next release." />;
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
