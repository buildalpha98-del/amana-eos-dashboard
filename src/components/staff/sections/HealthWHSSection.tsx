"use client";

/**
 * HealthWHSSection — rose-accented section in the long-scroll
 * staff profile. Houses HR-audit follow-ups that don't fit
 * cleanly into the existing sections.
 *
 * Sub-tabs:
 *   1. Workers comp — claims tracking
 *   2. Reasonable adjustments — DDA 1992 defence records
 *
 * Admin-only at the page level; the layout wraps this in an
 * `isAdmin` gate so non-admins don't see the section pill at all.
 */

import { HeartPulse } from "lucide-react";
import { SectionShell } from "./SectionShell";
import { WorkersCompTab } from "@/components/staff/WorkersCompTab";
import { ReasonableAdjustmentTab } from "@/components/staff/ReasonableAdjustmentTab";

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
      accentActiveClass="bg-rose-100 dark:bg-rose-950/50 text-rose-900 dark:text-rose-200 border-rose-300 dark:border-rose-800"
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
          <ReasonableAdjustmentTab
            targetUserId={targetUserId}
            targetUserName={targetUserName}
          />
        );
      }}
    </SectionShell>
  );
}

// Re-export icon for parent layout (used in section header chip).
export { HeartPulse };
