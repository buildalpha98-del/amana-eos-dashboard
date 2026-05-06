"use client";

/**
 * PayCompensationSection — teal section in the long-scroll profile.
 * Sub-tabs for Salary history · Work hours · Leave balances.
 *
 * Salary history reuses the EmploymentContract data already in the
 * page payload. Work hours is a read-only display of
 * `EmploymentContract.hoursPerWeek`. Leave balances reuses the
 * existing `LeaveTab` component.
 *
 * Wage data is **role-gated server-side**: when the viewer is not
 * admin or self, the parent passes `canViewPay=false` and we render
 * a "Pay information is admin-only" placeholder instead.
 *
 * 2026-05-04: introduced (spec PR #77, PR 3).
 */

import { LeaveTab } from "@/components/staff/tabs/LeaveTab";
import { SectionShell } from "./SectionShell";
import type { StaffProfileData } from "@/components/staff/types";
import type { EmploymentContract } from "@prisma/client";

type SubTab = "salary" | "hours" | "leave";

const SUB_TABS = [
  { key: "salary", label: "Salary history" },
  { key: "hours", label: "Work hours" },
  { key: "leave", label: "Leave balances" },
] as const;

export interface PayCompensationSectionProps {
  data: StaffProfileData;
  isSelf: boolean;
  /** True when the viewer is admin/owner OR self. False for other
   *  same-service viewers (member viewing another member). */
  canViewPay: boolean;
}

export function PayCompensationSection({
  data,
  isSelf,
  canViewPay,
}: PayCompensationSectionProps) {
  return (
    <SectionShell<SubTab>
      sectionKey="pay"
      title="Pay & compensation"
      accentDotClass="bg-teal-500"
      accentActiveClass="bg-teal-100 text-teal-900 border-teal-300"
      subTabs={SUB_TABS}
    >
      {(active) => {
        if (active === "salary") {
          if (!canViewPay) return <PayPlaceholder />;
          return <SalaryHistory contract={data.latestContract} />;
        }
        if (active === "hours") {
          if (!canViewPay) return <PayPlaceholder />;
          return <WorkHours contract={data.latestContract} />;
        }
        return (
          <LeaveTab
            targetUserId={data.targetUser.id}
            balances={data.balances}
            recentRequests={data.recentLeaveRequests}
            canRequest={isSelf}
          />
        );
      }}
    </SectionShell>
  );
}

function PayPlaceholder() {
  return (
    <p className="text-sm text-muted py-6 text-center">
      Pay information is admin-only.
    </p>
  );
}

function SalaryHistory({
  contract,
}: {
  contract: EmploymentContract | null;
}) {
  if (!contract) {
    return (
      <p className="text-sm text-muted py-6 text-center">
        No salary history yet. Issue a contract from the Documents → Contracts
        sub-tab to start the history.
      </p>
    );
  }
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-1">
        Current contract
      </p>
      <p className="text-2xl font-bold text-foreground">
        ${contract.payRate.toFixed(2)}{" "}
        <span className="text-sm font-normal text-muted">/ hour</span>
      </p>
      <p className="text-xs text-muted mt-1">
        Effective from{" "}
        {new Date(contract.startDate).toLocaleDateString("en-AU", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}
      </p>
    </div>
  );
}

function WorkHours({
  contract,
}: {
  contract: EmploymentContract | null;
}) {
  if (!contract || contract.hoursPerWeek === null) {
    return (
      <p className="text-sm text-muted py-6 text-center">
        No contracted work hours on file.
      </p>
    );
  }
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-1">
        Contracted hours
      </p>
      <p className="text-2xl font-bold text-foreground">
        {contract.hoursPerWeek}{" "}
        <span className="text-sm font-normal text-muted">hours / week</span>
      </p>
      <p className="text-xs text-muted mt-1">
        Contract type: {contract.contractType.replace(/^ct_/, "").replace("_", " ")}
      </p>
    </div>
  );
}
