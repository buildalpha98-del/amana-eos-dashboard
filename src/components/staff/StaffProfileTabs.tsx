"use client";

import { useRouter, useSearchParams, useParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import type {
  User,
  Service,
  EmergencyContact,
  EmploymentContract,
  LeaveBalance,
  LeaveRequest,
  StaffQualification,
  ComplianceCertificate,
  Document,
} from "@prisma/client";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  User as UserIcon,
  Briefcase,
  CalendarOff,
  Clock,
  ShieldCheck,
  FileText,
  FileSignature,
} from "lucide-react";
import { OverviewTab } from "@/components/staff/tabs/OverviewTab";
import { PersonalTab } from "@/components/staff/tabs/PersonalTab";
import { EmploymentTab } from "@/components/staff/tabs/EmploymentTab";
import { LeaveTab } from "@/components/staff/tabs/LeaveTab";
import { TimesheetTab } from "@/components/staff/tabs/TimesheetTab";
import { ComplianceTab } from "@/components/staff/tabs/ComplianceTab";
import { DocumentsTab } from "@/components/staff/tabs/DocumentsTab";
import { ContractsTab } from "@/components/staff/tabs/ContractsTab";

export type StaffProfileTabKey =
  | "overview"
  | "personal"
  | "employment"
  | "leave"
  | "timesheet"
  | "compliance"
  | "documents"
  | "contracts";

interface TimesheetSummary {
  weekEnding: Date;
  totalHours: number;
  status: string;
}

export interface StaffProfileNextShift {
  id: string;
  date: Date;
  shiftStart: string;
  shiftEnd: string;
  sessionType: string;
  role: string | null;
  staffName: string;
  userId: string | null;
  status: string;
}

export interface StaffProfileData {
  targetUser: User & { service?: Service | null };
  emergencyContacts: EmergencyContact[];
  latestContract: EmploymentContract | null;
  balances: LeaveBalance[];
  recentLeaveRequests: LeaveRequest[];
  timesheetWeeks: TimesheetSummary[];
  qualifications: StaffQualification[];
  certificates: ComplianceCertificate[];
  documents: Document[];
  nextShift: StaffProfileNextShift | null;
  stats: {
    activeRocks: number;
    openTodos: number;
    annualLeaveRemaining: number | null;
    validCertCount: number;
    expiringCertCount: number;
  };
}

interface StaffProfileTabsProps {
  data: StaffProfileData;
  activeTab: StaffProfileTabKey;
  canEditPersonal: boolean;
  canEditEmployment: boolean;
  canManageCompliance: boolean;
  isSelf: boolean;
  isAdmin: boolean;
}

const BASE_TABS: { key: StaffProfileTabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "personal", label: "Personal", icon: UserIcon },
  { key: "employment", label: "Employment", icon: Briefcase },
  { key: "leave", label: "Leave", icon: CalendarOff },
  { key: "timesheet", label: "Timesheet", icon: Clock },
  { key: "compliance", label: "Compliance", icon: ShieldCheck },
  { key: "documents", label: "Documents", icon: FileText },
];

const ADMIN_ONLY_TABS: { key: StaffProfileTabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "contracts", label: "Contracts", icon: FileSignature },
];

export function StaffProfileTabs({
  data,
  activeTab,
  canEditPersonal,
  canEditEmployment,
  canManageCompliance,
  isSelf,
  isAdmin,
}: StaffProfileTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams();
  const id = (params?.id as string) || data.targetUser.id;

  const tabs = useMemo(
    () => (isAdmin ? [...BASE_TABS, ...ADMIN_ONLY_TABS] : BASE_TABS),
    [isAdmin],
  );

  const active: StaffProfileTabKey = useMemo(() => {
    return tabs.some((t) => t.key === activeTab) ? activeTab : "overview";
  }, [activeTab, tabs]);

  const handleSelect = useCallback(
    (key: StaffProfileTabKey) => {
      const next = new URLSearchParams(searchParams?.toString() ?? "");
      if (key === "overview") next.delete("tab");
      else next.set("tab", key);
      const qs = next.toString();
      router.replace(`/staff/${id}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [id, router, searchParams],
  );

  return (
    <div className="space-y-6">
      {/* Tab nav */}
      <div className="border-b border-border">
        <nav
          className="flex gap-0 -mb-px overflow-x-auto"
          role="tablist"
          aria-label="Staff profile tabs"
        >
          {tabs.map((t) => {
            const Icon = t.icon;
            const isActive = active === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => handleSelect(t.key)}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors",
                  isActive
                    ? "border-brand text-brand"
                    : "border-transparent text-muted hover:text-foreground/80 hover:border-border",
                )}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab content */}
      <div className="min-h-[40vh]">
        {active === "overview" && (
          <OverviewTab
            targetUser={data.targetUser}
            stats={data.stats}
            nextShift={data.nextShift}
          />
        )}
        {active === "personal" && (
          <PersonalTab
            targetUser={data.targetUser}
            emergencyContacts={data.emergencyContacts}
            canEdit={canEditPersonal}
          />
        )}
        {active === "employment" && (
          <EmploymentTab
            targetUser={data.targetUser}
            latestContract={data.latestContract}
            canEdit={canEditEmployment}
          />
        )}
        {active === "leave" && (
          <LeaveTab
            targetUserId={data.targetUser.id}
            balances={data.balances}
            recentRequests={data.recentLeaveRequests}
            canRequest={isSelf}
          />
        )}
        {active === "timesheet" && (
          <TimesheetTab
            targetUserId={data.targetUser.id}
            weeks={data.timesheetWeeks}
            canSubmit={isSelf}
          />
        )}
        {active === "compliance" && (
          <ComplianceTab
            userId={data.targetUser.id}
            qualifications={data.qualifications}
            certificates={data.certificates}
            canManage={canManageCompliance}
            isSelf={isSelf}
          />
        )}
        {active === "documents" && <DocumentsTab documents={data.documents} />}
        {active === "contracts" && isAdmin && (
          <ContractsTab userId={data.targetUser.id} canEdit={isAdmin} />
        )}
      </div>
    </div>
  );
}
