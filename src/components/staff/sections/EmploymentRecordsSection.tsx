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
import { SectionShell } from "./SectionShell";
import type { StaffProfileData } from "@/components/staff/types";

type SubTab = "employment" | "personal" | "emergency";

const SUB_TABS = [
  { key: "employment", label: "Employment details" },
  { key: "personal", label: "Personal details" },
  { key: "emergency", label: "Emergency contacts" },
] as const;

export interface EmploymentRecordsSectionProps {
  data: StaffProfileData;
  canEditPersonal: boolean;
  canEditEmployment: boolean;
  /** Show the admin-only Account panel (role editor) — admin viewing another user. */
  canEditAccount?: boolean;
  /** Viewer is an owner (needed for the role dropdown's owner/head_office options). */
  viewerIsOwner?: boolean;
}

export function EmploymentRecordsSection({
  data,
  canEditPersonal,
  canEditEmployment,
  canEditAccount = false,
  viewerIsOwner = false,
}: EmploymentRecordsSectionProps) {
  // Deep-link from the header's "Edit profile" Quick Action — see
  // StaffProfileHeader.handleEditProfile. When `?edit=personal` is set we
  // surface the Personal-details sub-tab on first render so the user lands
  // directly on the editor instead of the default Employment-details view.
  const searchParams = useSearchParams();
  const initialTab: SubTab =
    searchParams.get("edit") === "personal" ? "personal" : "employment";

  return (
    <SectionShell<SubTab>
      sectionKey="employment"
      title="Employment records"
      accentDotClass="bg-purple-500"
      accentActiveClass="bg-purple-100 text-purple-900 border-purple-300"
      subTabs={SUB_TABS}
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
