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
  LMSEnrollmentStatus,
  SurveyStatus,
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

/** One row per PolicyDocumentAcknowledgement by the target user. */
export interface StaffPolicyAck {
  id: string;
  documentTitle: string;
  versionNumber: number;
  acknowledgedAt: Date;
}

/** A published (non-archived, has a current version) policy whose
 *  CURRENT version the target user has not acknowledged. */
export interface StaffUnackedPolicy {
  documentId: string;
  title: string;
  versionNumber: number | null;
}

/** Essential-track (induction) LMS enrollment summary. */
export interface StaffInductionEnrollment {
  id: string;
  courseTitle: string;
  status: LMSEnrollmentStatus;
  score: number | null;
  completedAt: Date | null;
}

/** Week-1 practical sign-off progress (items signed vs active items).
 *  The overall induction state itself lives on targetUser.inductionStatus. */
export interface StaffPracticalSignoffState {
  signedCount: number;
  totalItems: number;
}

/** A form (staff survey) submission by the target user. There is no
 *  dedicated FormSubmission model — staff-submitted forms are
 *  SurveyResponse rows (non-anonymous only, by query). */
export interface StaffFormSubmission {
  id: string;
  title: string;
  submittedAt: Date;
  surveyStatus: SurveyStatus;
}

export interface StaffProfileData {
  targetUser: User & { service?: Service | null };
  emergencyContacts: EmergencyContact[];
  /** Most recent contract by startDate — `contracts[0]`. Kept as its own
   *  field because several sections only care about the current one. */
  latestContract: EmploymentContract | null;
  /** ALL contracts, newest first (Task 10.3 — salary history). */
  contracts: EmploymentContract[];
  balances: LeaveBalance[];
  recentLeaveRequests: LeaveRequest[];
  timesheetWeeks: TimesheetSummary[];
  qualifications: StaffQualification[];
  certificates: ComplianceCertificate[];
  documents: Document[];
  policyAcks: StaffPolicyAck[];
  unackedPolicies: StaffUnackedPolicy[];
  inductionEnrollments: StaffInductionEnrollment[];
  practicalSignoff: StaffPracticalSignoffState;
  formSubmissions: StaffFormSubmission[];
  nextShift: StaffProfileNextShift | null;
  stats: {
    activeRocks: number;
    openTodos: number;
    annualLeaveRemaining: number | null;
    validCertCount: number;
    expiringCertCount: number;
  };
}
