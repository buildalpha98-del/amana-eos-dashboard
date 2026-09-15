"use client";

/**
 * StaffProfileLayout — top-level shell for the long-scroll staff
 * profile. Composes header + sticky pills + 4 section cards +
 * right-gutter snapshot.
 *
 * 2026-05-04: introduced (spec PR #77).
 * 2026-05-06: legacy StaffProfileTabs deleted (PR 8). This is now
 * the only profile layout — no flag, no fallback.
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

import { canViewStaffPay } from "@/lib/staff-pay-visibility";
import { StaffProfilePills } from "./StaffProfilePills";
import { StaffProfileStatsPanel } from "./StaffProfileStatsPanel";
import { EmploymentRecordsSection } from "./sections/EmploymentRecordsSection";
import { PayCompensationSection } from "./sections/PayCompensationSection";
import { DocumentsSection } from "./sections/DocumentsSection";
import { RampSection } from "./sections/RampSection";
import { PerformanceSection } from "./sections/PerformanceSection";
import { HealthWHSSection } from "./sections/HealthWHSSection";
import type { StaffProfileData } from "./types";
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
  /** Previous employee in the same filtered list (preserves the
   *  searchParams so the navigation context carries through). Null
   *  when the current user is the first row, or not in the filtered
   *  list at all. */
  prevHref: string | null;
  /** Next employee in the same filtered list. Null when current user
   *  is the last row or not in the filtered list. */
  nextHref: string | null;
  /** 2026-09-14: the person has a 90-day ramp — renders the Ramp section
   *  (and its pill). Loaded server-side so the pill never flashes. */
  hasRamp?: boolean;
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
  prevHref,
  nextHref,
  hasRamp = false,
}: StaffProfileLayoutProps) {
  // Pay data is admin-or-self only — and since 2026-09-15 State Managers are
  // deliberately excluded even though they are admin-tier (see
  // canViewStaffPay). When nobody may see it the whole section is omitted,
  // pill included: four sub-tabs of "Pay information is admin-only" is worse
  // than no section at all.
  const canViewPay = canViewStaffPay(viewerRole, isSelf);
  // Admin-only role editor — hide on own profile to prevent one-click
  // self-demotion / self-elevation from the staff page.
  const canEditAccount = isAdmin && !isSelf;
  const viewerIsOwner = viewerRole === "owner";

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
              tags: data.targetUser.tags ?? [],
            }}
            tenure={snapshotStats.tenure}
            viewerRole={viewerRole}
            isSelf={isSelf}
            backHref={backHref}
            prevHref={prevHref}
            nextHref={nextHref}
          />

          <div className="mt-6">
            <StaffProfilePills
              hiddenKeys={[
                ...(hasRamp ? [] : (["ramp"] as const)),
                ...(canViewPay ? [] : (["pay"] as const)),
              ]}
            />
          </div>

          <div className="mt-6">
            <EmploymentRecordsSection
              data={data}
              canEditPersonal={canEditPersonal}
              canEditEmployment={canEditEmployment}
              canEditAccount={canEditAccount}
              viewerIsOwner={viewerIsOwner}
              canManageSeparation={isAdmin}
            />
            {canViewPay && (
              <PayCompensationSection
                data={data}
                isSelf={isSelf}
                canViewPay={canViewPay}
                canManagePayroll={isAdmin && canViewPay}
              />
            )}
            <DocumentsSection
              data={data}
              isSelf={isSelf}
              isAdmin={isAdmin}
              canManageCompliance={canManageCompliance}
            />
            {hasRamp && (
              <RampSection
                targetUserId={data.targetUser.id}
                targetUserName={data.targetUser.name}
              />
            )}
            <PerformanceSection
              targetUserId={data.targetUser.id}
              targetUserName={data.targetUser.name}
              viewerRole={viewerRole}
            />
            {/* Health & WHS section — admin-only. Sub-tabs for workers
                comp + reasonable adjustments. */}
            {isAdmin && (
              <HealthWHSSection
                targetUserId={data.targetUser.id}
                targetUserName={data.targetUser.name}
              />
            )}
          </div>
        </div>

        <aside className="lg:sticky lg:top-4 lg:self-start space-y-4">
          <StaffProfileStatsPanel stats={snapshotStats} />
        </aside>
      </div>
    </div>
  );
}
