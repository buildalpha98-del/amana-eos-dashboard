"use client";

/**
 * DocumentsSection — yellow section in the long-scroll profile.
 * Sub-tabs for Certifications · Documents · Contracts. Policies /
 * Induction / Forms collapsed to placeholders for v1; will fill in
 * once the data hooks land in their own PRs.
 *
 * 2026-05-04: introduced (spec PR #77, PR 3).
 */

import { ComplianceTab } from "@/components/staff/tabs/ComplianceTab";
import { DocumentsTab } from "@/components/staff/tabs/DocumentsTab";
import { ContractsTab } from "@/components/staff/tabs/ContractsTab";
import { SectionShell } from "./SectionShell";
import type { StaffProfileData } from "@/components/staff/StaffProfileTabs";

type SubTab =
  | "certifications"
  | "documents"
  | "policies"
  | "induction"
  | "forms"
  | "contracts";

const PUBLIC_SUB_TABS = [
  { key: "certifications", label: "Certifications" },
  { key: "documents", label: "Documents" },
  { key: "policies", label: "Policies" },
  { key: "induction", label: "Induction" },
  { key: "forms", label: "Forms" },
] as const;

const ADMIN_SUB_TABS = [...PUBLIC_SUB_TABS, { key: "contracts", label: "Contracts" }] as const;

export interface DocumentsSectionProps {
  data: StaffProfileData;
  isSelf: boolean;
  isAdmin: boolean;
  canManageCompliance: boolean;
}

export function DocumentsSection({
  data,
  isSelf,
  isAdmin,
  canManageCompliance,
}: DocumentsSectionProps) {
  return (
    <SectionShell<SubTab>
      sectionKey="documents"
      title="Documents"
      accentDotClass="bg-yellow-500"
      accentActiveClass="bg-yellow-100 text-yellow-900 border-yellow-300"
      subTabs={isAdmin ? ADMIN_SUB_TABS : PUBLIC_SUB_TABS}
    >
      {(active) => {
        if (active === "certifications") {
          return (
            <ComplianceTab
              userId={data.targetUser.id}
              qualifications={data.qualifications}
              certificates={data.certificates}
              canManage={canManageCompliance}
              isSelf={isSelf}
            />
          );
        }
        if (active === "documents") {
          return <DocumentsTab documents={data.documents} />;
        }
        if (active === "contracts" && isAdmin) {
          return <ContractsTab userId={data.targetUser.id} canEdit={isAdmin} />;
        }
        // Policies / Induction / Forms placeholder. The underlying data
        // models exist (PolicyAcknowledgement, InductionModuleCompletion,
        // FormSubmission) but aren't yet on the staff-profile data load.
        // Adding them is a small follow-up PR — the placeholder makes
        // the surface area visible without blocking PR 3.
        const placeholderText: Record<string, string> = {
          policies:
            "Policy acknowledgements will appear here. Coming in next release.",
          induction:
            "Completed induction modules will appear here. Coming in next release.",
          forms:
            "Submitted forms will appear here. Coming in next release.",
        };
        return (
          <p className="text-sm text-muted py-6 text-center italic">
            {placeholderText[active]}
          </p>
        );
      }}
    </SectionShell>
  );
}
