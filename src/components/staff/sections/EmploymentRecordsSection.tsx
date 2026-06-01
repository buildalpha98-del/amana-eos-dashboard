"use client";

/**
 * EmploymentRecordsSection — purple section in the long-scroll
 * profile. Sub-tabs for Employment details · Personal details ·
 * Emergency contacts. Reuses the existing `EmploymentTab` and
 * `PersonalTab` components.
 *
 * 2026-05-04: introduced (spec PR #77, PR 3).
 */

import { useSearchParams } from "next/navigation";
import { Phone } from "lucide-react";
import type { EmergencyContact } from "@prisma/client";
import { EmploymentTab } from "@/components/staff/tabs/EmploymentTab";
import { PersonalTab } from "@/components/staff/tabs/PersonalTab";
import { SeparationTab } from "@/components/staff/SeparationTab";
import { CasualConversionTab } from "@/components/staff/CasualConversionTab";
import { PositionDescriptionTab } from "@/components/staff/PositionDescriptionTab";
import { ReferenceChecksTab } from "@/components/staff/ReferenceChecksTab";
import { SectionShell } from "./SectionShell";
import type { StaffProfileData } from "@/components/staff/types";

type SubTab =
  | "employment"
  | "personal"
  | "emergency"
  | "position"
  | "references"
  | "conversion"
  | "separation";

const SUB_TABS_BASE = [
  { key: "employment", label: "Employment details" },
  { key: "personal", label: "Personal details" },
  { key: "emergency", label: "Emergency contacts" },
  { key: "position", label: "Position description" },
] as const;

const REFERENCES_SUB_TAB = { key: "references", label: "References" } as const;

const CONVERSION_SUB_TAB = {
  key: "conversion",
  label: "Casual conversion",
} as const;

const SEPARATION_SUB_TAB = { key: "separation", label: "Separation" } as const;

export interface EmploymentRecordsSectionProps {
  data: StaffProfileData;
  canEditPersonal: boolean;
  canEditEmployment: boolean;
  /** Show the admin-only Account panel (role editor) — admin viewing another user. */
  canEditAccount?: boolean;
  /** Viewer is an owner (needed for the role dropdown's owner/head_office options). */
  viewerIsOwner?: boolean;
  /** Show the admin-only Separation sub-tab. Admin / owner / head_office. */
  canManageSeparation?: boolean;
}

export function EmploymentRecordsSection({
  data,
  canEditPersonal,
  canEditEmployment,
  canEditAccount = false,
  viewerIsOwner = false,
  canManageSeparation = false,
}: EmploymentRecordsSectionProps) {
  // Deep-link from the header's "Edit profile" Quick Action — see
  // StaffProfileHeader.handleEditProfile. When `?edit=personal` is set we
  // surface the Personal-details sub-tab on first render so the user lands
  // directly on the editor instead of the default Employment-details view.
  const searchParams = useSearchParams();
  const initialTab: SubTab =
    searchParams.get("edit") === "personal" ? "personal" : "employment";

  // Conversion, References and Separation sub-tabs are admin-only.
  // Sub-tab order: details → personal → emergency → position →
  // references (admin) → conversion (admin) → separation (admin).
  // Emotionally ordered: most positive (employment) → most consequential.
  const subTabs = canManageSeparation
    ? ([
        ...SUB_TABS_BASE,
        REFERENCES_SUB_TAB,
        CONVERSION_SUB_TAB,
        SEPARATION_SUB_TAB,
      ] as const)
    : SUB_TABS_BASE;

  return (
    <SectionShell<SubTab>
      sectionKey="employment"
      title="Employment records"
      accentDotClass="bg-purple-500"
      accentActiveClass="bg-purple-100 text-purple-900 border-purple-300"
      subTabs={subTabs}
      defaultTab={initialTab}
    >
      {(active) => {
        if (active === "employment") {
          return (
            <EmploymentTab
              targetUser={data.targetUser}
              latestContract={data.latestContract}
              canEdit={canEditEmployment}
            />
          );
        }
        if (active === "personal") {
          return (
            <PersonalTab
              targetUser={data.targetUser}
              emergencyContacts={data.emergencyContacts}
              canEdit={canEditPersonal}
              canEditAccount={canEditAccount}
              viewerIsOwner={viewerIsOwner}
            />
          );
        }
        if (active === "position") {
          // `canManageSeparation` already encodes admin/owner/head_office.
          // Pass a coarse role string so the tab can gate its UI without
          // needing the actual Role enum value from the session.
          return (
            <PositionDescriptionTab
              targetUserId={data.targetUser.id}
              targetUserName={data.targetUser.name}
              targetUserRole={data.targetUser.role}
              viewerRole={canManageSeparation ? "admin" : "staff"}
            />
          );
        }
        if (active === "references") {
          if (!canManageSeparation) return null;
          // Pass viewerIsOwner via the coarse role string so the
          // owner-only Soft-delete button can render in the modal.
          return (
            <ReferenceChecksTab
              targetUserId={data.targetUser.id}
              targetUserName={data.targetUser.name}
              viewerRole={viewerIsOwner ? "owner" : "admin"}
            />
          );
        }
        if (active === "conversion") {
          if (!canManageSeparation) return null;
          return (
            <CasualConversionTab
              targetUserId={data.targetUser.id}
              targetUserName={data.targetUser.name}
            />
          );
        }
        if (active === "separation") {
          if (!canManageSeparation) return null;
          return (
            <SeparationTab
              targetUserId={data.targetUser.id}
              targetUserName={data.targetUser.name}
              targetUserActive={data.targetUser.active}
              viewerIsOwner={viewerIsOwner}
            />
          );
        }
        return <EmergencyContactList contacts={data.emergencyContacts} />;
      }}
    </SectionShell>
  );
}

// ── EmergencyContactList ────────────────────────────────────────────

function EmergencyContactList({
  contacts,
}: {
  contacts: EmergencyContact[];
}) {
  if (contacts.length === 0) {
    return (
      <p className="text-sm text-muted py-6 text-center">
        No emergency contacts on file.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {contacts.map((c) => (
        <li
          key={c.id}
          className="rounded-lg border border-border bg-background p-3 flex items-start gap-3"
        >
          <div className="rounded-full bg-brand/10 p-2 text-brand">
            <Phone className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">{c.name}</p>
            <p className="text-xs text-muted">
              {c.relationship}
              {c.isPrimary ? " · Primary" : ""}
            </p>
            <p className="text-sm text-foreground/80 mt-1">{c.phone}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
