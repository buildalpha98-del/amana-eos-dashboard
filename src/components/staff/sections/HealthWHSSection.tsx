"use client";

/**
 * HealthWHSSection — rose-accented section in the long-scroll
 * staff profile. Houses HR-audit follow-ups that don't fit
 * cleanly into the existing sections.
 *
 * Sub-tabs:
 *   1. Workers comp — claims tracking (today)
 *   2. Reasonable adjustments — DDA defence records (next task)
 *
 * Admin-only at the page level; the section pill simply hides
 * for non-admin viewers. Pass `canManageHealth` from the parent.
 */

import { HeartPulse, Accessibility } from "lucide-react";
import { SectionShell } from "./SectionShell";
import { WorkersCompTab } from "@/components/staff/WorkersCompTab";

type SubTab = "workers_comp" | "reasonable_adjustments";

const SUB_TABS = [
  { key: "workers_comp", label: "Workers comp" },
  { key: "reasonable_adjustments", label: "Reasonable adjustments" },
] as const;

export interface HealthWHSSectionProps {
  targetUserId: string;
  targetUserName: string;
}

export function HealthWHSSection({
  targetUserId,
  targetUserName,
}: HealthWHSSectionProps) {
  return (
    <SectionShell<SubTab>
      sectionKey="health"
      title="Health & WHS"
      accentDotClass="bg-rose-500"
      accentActiveClass="bg-rose-100 text-rose-900 border-rose-300"
      subTabs={SUB_TABS}
    >
      {(active) => {
        if (active === "workers_comp") {
          return (
            <WorkersCompTab
              targetUserId={targetUserId}
              targetUserName={targetUserName}
            />
          );
        }
        return (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Accessibility className="h-10 w-10 text-border mb-3" />
            <p className="text-sm text-muted italic">
              Reasonable adjustment records will appear here. Coming next.
            </p>
          </div>
        );
      }}
    </SectionShell>
  );
}

// Re-export icon for parent layout (used in section header chip).
export { HeartPulse };
