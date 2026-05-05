"use client";

/**
 * StaffProfilePageClient — flag-gated client wrapper for the staff
 * profile page. Decides between the old vertical-tab layout
 * (`StaffProfileTabs`) and the new long-scroll EH layout
 * (`StaffProfileLayout`) based on `useTeamsRedesignFlag()`.
 *
 * The page (`/staff/[id]/page.tsx`) is a server component that
 * pulls data via Prisma and computes `snapshotStats`; that data is
 * passed in here unchanged, so the wrapper itself is a pure render
 * decision. Once PR 8 (cleanup) lands, the legacy branch goes away.
 *
 * 2026-05-04: introduced (spec PR #77, PR 3).
 */

import { useSearchParams } from "next/navigation";
import { useTeamsRedesignFlag } from "@/lib/useTeamsRedesignFlag";
import {
  StaffProfileTabs,
  type StaffProfileData,
  type StaffProfileTabKey,
} from "./StaffProfileTabs";
import { StaffProfileLayout } from "./StaffProfileLayout";
import type { SnapshotStats } from "@/lib/staff/snapshot-stats";

export interface StaffProfilePageClientProps {
  data: StaffProfileData;
  snapshotStats: SnapshotStats;
  activeTab: StaffProfileTabKey;
  viewerRole: string;
  isSelf: boolean;
  isAdmin: boolean;
  canEditPersonal: boolean;
  canEditEmployment: boolean;
  canManageCompliance: boolean;
}

export function StaffProfilePageClient({
  data,
  snapshotStats,
  activeTab,
  viewerRole,
  isSelf,
  isAdmin,
  canEditPersonal,
  canEditEmployment,
  canManageCompliance,
}: StaffProfilePageClientProps) {
  const teamsRedesign = useTeamsRedesignFlag();
  const searchParams = useSearchParams();

  if (teamsRedesign) {
    // Compute the back href so /team's filter state round-trips.
    const qs = searchParams?.toString() ?? "";
    const backHref = qs ? `/team?${qs}` : "/team";
    return (
      <StaffProfileLayout
        data={data}
        snapshotStats={snapshotStats}
        viewerRole={viewerRole}
        isSelf={isSelf}
        isAdmin={isAdmin}
        canEditPersonal={canEditPersonal}
        canEditEmployment={canEditEmployment}
        canManageCompliance={canManageCompliance}
        backHref={backHref}
      />
    );
  }

  return (
    <StaffProfileTabs
      data={data}
      activeTab={activeTab}
      canEditPersonal={canEditPersonal}
      canEditEmployment={canEditEmployment}
      canManageCompliance={canManageCompliance}
      isSelf={isSelf}
      isAdmin={isAdmin}
    />
  );
}
