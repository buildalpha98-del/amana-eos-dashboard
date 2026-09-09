"use client";

/**
 * DocumentsSection — yellow section in the long-scroll profile.
 * Sub-tabs for Certifications · Documents · Policies · Induction ·
 * Forms (· Contracts for admins).
 *
 * Policies / Induction / Forms are read-only lists fed entirely by the
 * server loader (`/staff/[id]/page.tsx`) — no client queries here.
 * "Forms" = staff survey submissions (SurveyResponse); there is no
 * dedicated FormSubmission model.
 *
 * 2026-05-04: introduced (spec PR #77, PR 3).
 * 2026-09-04: Policies / Induction / Forms stubs wired (staff portal
 *             v2 Phase 8).
 */

import { ShieldCheck, GraduationCap, ClipboardList, CheckCircle2 } from "lucide-react";
import { ComplianceTab } from "@/components/staff/tabs/ComplianceTab";
import { DocumentsTab } from "@/components/staff/tabs/DocumentsTab";
import { ContractsTab } from "@/components/staff/tabs/ContractsTab";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionShell } from "./SectionShell";
import type {
  StaffProfileData,
  StaffPolicyAck,
  StaffUnackedPolicy,
  StaffInductionEnrollment,
  StaffPracticalSignoffState,
  StaffFormSubmission,
} from "@/components/staff/types";
import type { InductionStatus, LMSEnrollmentStatus, SurveyStatus } from "@prisma/client";

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

function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
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
      accentActiveClass="bg-yellow-100 dark:bg-yellow-950/50 text-yellow-900 dark:text-yellow-200 border-yellow-300 dark:border-yellow-800"
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
          return (
            <DocumentsTab
              documents={data.documents}
              targetUserId={data.targetUser.id}
              isAdmin={isAdmin}
            />
          );
        }
        if (active === "contracts" && isAdmin) {
          return (
            <ContractsTab
              userId={data.targetUser.id}
              userName={data.targetUser.name}
              userEmail={data.targetUser.email}
              userRole={data.targetUser.role}
              canEdit={isAdmin}
            />
          );
        }
        if (active === "policies") {
          return (
            <PoliciesList acks={data.policyAcks} unacked={data.unackedPolicies} />
          );
        }
        if (active === "induction") {
          return (
            <InductionList
              enrollments={data.inductionEnrollments}
              practicalSignoff={data.practicalSignoff}
              inductionStatus={data.targetUser.inductionStatus}
            />
          );
        }
        return <FormsList submissions={data.formSubmissions} />;
      }}
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// Policies — acknowledged rows plus amber "not acknowledged" rows for
// live policies whose current version this user hasn't signed off.
// ---------------------------------------------------------------------------

function PoliciesList({
  acks,
  unacked,
}: {
  acks: StaffPolicyAck[];
  unacked: StaffUnackedPolicy[];
}) {
  if (acks.length === 0 && unacked.length === 0) {
    return (
      <EmptyState
        variant="inline"
        icon={ShieldCheck}
        title="No policy acknowledgements yet"
        description="Acknowledgements appear here once policies are published and signed off."
      />
    );
  }
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h3 className="text-lg font-semibold text-foreground mb-4">
        Policy acknowledgements
      </h3>
      <ul className="space-y-2">
        {unacked.map((p) => (
          <li
            key={p.documentId}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3 py-2.5"
            data-testid="policy-unacked-row"
          >
            <div className="flex-1 min-w-[200px]">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                {p.title}
              </p>
              <p className="text-xs text-amber-800/80 dark:text-amber-300/70">
                {p.versionNumber !== null ? `Version ${p.versionNumber} · ` : ""}
                current version not acknowledged
              </p>
            </div>
            <span className="text-2xs font-medium uppercase tracking-wide rounded-full border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 px-2 py-0.5 shrink-0">
              Outstanding
            </span>
          </li>
        ))}
        {acks.map((a) => (
          <li
            key={a.id}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2.5"
            data-testid="policy-ack-row"
          >
            <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
            <div className="flex-1 min-w-[200px]">
              <p className="text-sm font-medium text-foreground">{a.documentTitle}</p>
              <p className="text-xs text-muted">
                Version {a.versionNumber} · acknowledged {formatDate(a.acknowledgedAt)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Induction — essential-track LMS enrollments + practical sign-off state.
// ---------------------------------------------------------------------------

const INDUCTION_STATUS_LABEL: Record<InductionStatus, string> = {
  new_starter: "New starter",
  in_training: "In training",
  awaiting_signoff: "Awaiting practical sign-off",
  cleared: "Cleared",
};

const ENROLLMENT_STATUS_STYLE: Record<LMSEnrollmentStatus, string> = {
  enrolled: "border-border text-muted",
  in_progress:
    "border-blue-300 dark:border-blue-800 text-blue-800 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40",
  completed:
    "border-green-300 dark:border-green-800 text-green-800 dark:text-green-300 bg-green-50 dark:bg-green-950/40",
  expired:
    "border-red-300 dark:border-red-800 text-red-800 dark:text-red-300 bg-red-50 dark:bg-red-950/40",
};

const ENROLLMENT_STATUS_LABEL: Record<LMSEnrollmentStatus, string> = {
  enrolled: "Enrolled",
  in_progress: "In progress",
  completed: "Completed",
  expired: "Expired",
};

function InductionList({
  enrollments,
  practicalSignoff,
  inductionStatus,
}: {
  enrollments: StaffInductionEnrollment[];
  practicalSignoff: StaffPracticalSignoffState;
  inductionStatus: InductionStatus;
}) {
  if (enrollments.length === 0) {
    return (
      <EmptyState
        variant="inline"
        icon={GraduationCap}
        title="No induction enrollments"
        description="Essential-track course enrollments appear here once this staff member is enrolled."
      />
    );
  }
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h3 className="text-lg font-semibold text-foreground">Induction training</h3>
        <div className="flex items-center gap-3 text-xs text-muted">
          <span>
            Status:{" "}
            <span className="font-medium text-foreground">
              {INDUCTION_STATUS_LABEL[inductionStatus]}
            </span>
          </span>
          {practicalSignoff.totalItems > 0 && (
            <span>
              Practical sign-off:{" "}
              <span className="font-medium text-foreground">
                {practicalSignoff.signedCount} of {practicalSignoff.totalItems} items
              </span>
            </span>
          )}
        </div>
      </div>
      <ul className="divide-y divide-border">
        {enrollments.map((e) => (
          <li
            key={e.id}
            className="py-3 flex flex-wrap items-center gap-3"
            data-testid="induction-enrollment-row"
          >
            <div className="flex-1 min-w-[200px]">
              <p className="text-sm font-medium text-foreground">{e.courseTitle}</p>
              <p className="text-xs text-muted">
                {e.completedAt
                  ? `Completed ${formatDate(e.completedAt)}`
                  : "Not yet completed"}
                {typeof e.score === "number" ? ` · score ${Math.round(e.score)}%` : ""}
              </p>
            </div>
            <span
              className={`text-2xs font-medium uppercase tracking-wide rounded-full border px-2 py-0.5 shrink-0 ${ENROLLMENT_STATUS_STYLE[e.status]}`}
            >
              {ENROLLMENT_STATUS_LABEL[e.status]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Forms — staff survey submissions (non-anonymous responses only).
// ---------------------------------------------------------------------------

const SURVEY_STATUS_LABEL: Record<SurveyStatus, string> = {
  draft: "Draft",
  published: "Open",
  closed: "Closed",
};

function FormsList({ submissions }: { submissions: StaffFormSubmission[] }) {
  if (submissions.length === 0) {
    return (
      <EmptyState
        variant="inline"
        icon={ClipboardList}
        title="No forms submitted"
        description="Staff survey and form submissions appear here."
      />
    );
  }
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h3 className="text-lg font-semibold text-foreground mb-4">Form submissions</h3>
      <ul className="divide-y divide-border">
        {submissions.map((s) => (
          <li
            key={s.id}
            className="py-3 flex flex-wrap items-center gap-3"
            data-testid="form-submission-row"
          >
            <ClipboardList className="w-4 h-4 text-muted shrink-0" />
            <div className="flex-1 min-w-[200px]">
              <p className="text-sm font-medium text-foreground">{s.title}</p>
              <p className="text-xs text-muted">Submitted {formatDate(s.submittedAt)}</p>
            </div>
            <span className="text-2xs font-medium uppercase tracking-wide rounded-full border border-border text-muted px-2 py-0.5 shrink-0">
              {SURVEY_STATUS_LABEL[s.surveyStatus]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
