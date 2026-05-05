"use client";

/**
 * StaffProfileLayout — top-level shell for the new long-scroll EH-
 * style staff profile (PR 3 of the Teams tab redesign). Composes
 * header + sticky pills + 4 section cards + right-gutter snapshot.
 *
 * Replaces `StaffProfileTabs` for users on the
 * `useTeamsRedesignFlag()`. Old layout stays in place during rollout
 * via `StaffProfilePageClient`.
 *
 * 2026-05-04: introduced (spec PR #77).
 */

import { StaffProfileHeader } from "./StaffProfileHeader";

function composeAddress(u: {
  addressStreet?: string | null;
  addressSuburb?: string | null;
  addressState?: string | null;
  addressPostcode?: string | null;
}): string | null {
  const parts = [u.addressStreet, u.addressSuburb, u.addressState, u.addressPostcode]
    .filter((p): p is string => Boolean(p));
  return parts.length > 0 ? parts.join(", ") : null;
}

import { StaffProfilePills } from "./StaffProfilePills";
import { StaffProfileStatsPanel } from "./StaffProfileStatsPanel";
import { EmploymentRecordsSection } from "./sections/EmploymentRecordsSection";
import { PayCompensationSection } from "./sections/PayCompensationSection";
import { DocumentsSection } from "./sections/DocumentsSection";
import { PerformanceSection } from "./sections/PerformanceSection";
import type { StaffProfileData } from "./StaffProfileTabs";
import type { SnapshotStats } from "@/lib/staff/snapshot-stats";

export interface StaffProfileLayoutProps {
  data: StaffProfileData;
  snapshotStats: SnapshotStats;
  viewerRole: string;
  isSelf: boolean;
  isAdmin: boolean;
  canEditPersonal: boolean;
  canEditEmployment: boolean;
  canManageCompliance: boolean;
  /** Backlink to /team — preserves filter state via the search string
   *  the user came from. Caller computes via `?<searchParams>`. */
  backHref: string;
}

export function StaffProfileLayout({
  data,
  snapshotStats,
  viewerRole,
  isSelf,
  isAdmin,
  canEditPersonal,
  canEditEmployment,
  canManageCompliance,
  backHref,
}: StaffProfileLayoutProps) {
  // Pay data is admin-or-self only.
  const canViewPay = isAdmin || isSelf;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        <div className="min-w-0">
          <StaffProfileHeader
            user={{
              id: data.targetUser.id,
              name: data.targetUser.name,
              email: data.targetUser.email,
              avatar: data.targetUser.avatar ?? null,
              phone: data.targetUser.phone ?? null,
              role: data.targetUser.role,
              active: data.targetUser.active,
              lastLoginAt: data.targetUser.lastLoginAt,
              address: composeAddress(data.targetUser),
              service: data.targetUser.service
                ? {
                    id: data.targetUser.service.id,
                    name: data.targetUser.service.name,
                  }
                : null,
            }}
            tenure={snapshotStats.tenure}
            viewerRole={viewerRole}
            isSelf={isSelf}
            backHref={backHref}
          />

          <div className="mt-6">
            <StaffProfilePills />
          </div>

          <div className="mt-6">
            <EmploymentRecordsSection
              data={data}
              canEditPersonal={canEditPersonal}
              canEditEmployment={canEditEmployment}
            />
            <PayCompensationSection
              data={data}
              isSelf={isSelf}
              canViewPay={canViewPay}
            />
            <DocumentsSection
              data={data}
              isSelf={isSelf}
              isAdmin={isAdmin}
              canManageCompliance={canManageCompliance}
            />
            <PerformanceSection />
          </div>
        </div>

        <aside className="lg:sticky lg:top-4 lg:self-start space-y-4">
          <StaffProfileStatsPanel stats={snapshotStats} />
        </aside>
      </div>
    </div>
  );
}
