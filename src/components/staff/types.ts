/**
 * StaffProfileData — the shape of the data load behind the staff
 * profile page. Lifted out of the legacy StaffProfileTabs in PR 8 of
 * the Teams tab redesign so the type can outlive its original home.
 *
 * Computed by /staff/[id]/page.tsx from a single Prisma round-trip
 * (Promise.all over ~12 entities) and consumed by StaffProfileLayout
 * + the section components.
 */

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
