"use client";

import { useQuery } from "@tanstack/react-query";

export interface EmergencyContactData {
  id: string;
  name: string;
  phone: string;
  relationship: string;
  isPrimary: boolean;
}

export interface QualificationData {
  id: string;
  type: string;
  name: string;
  institution: string | null;
  completedDate: string | null;
  expiryDate: string | null;
  verified: boolean;
}

export interface ProfileData {
  id: string;
  name: string;
  email: string;
  role: string;
  phone: string | null;
  avatar: string | null;
  dateOfBirth: string | null;
  addressStreet: string | null;
  addressSuburb: string | null;
  addressState: string | null;
  addressPostcode: string | null;
  visaStatus: string | null;
  visaExpiry: string | null;
  employmentType: string | null;
  startDate: string | null;
  probationEndDate: string | null;
  superFundName: string | null;
  superMemberNumber: string | null;
  superUSI: string | null;
  bankDetailsNote: string | null;
  bankAccountName: string | null;
  bankBSB: string | null;
  bankAccountNumber: string | null;
  xeroEmployeeId: string | null;
  service: { id: string; name: string; code: string } | null;
  emergencyContacts: EmergencyContactData[];
  qualifications: QualificationData[];
}

export interface LeaveBalanceData {
  leaveType: string;
  balance: number;
  accrued: number;
  taken: number;
  pending: number;
}

export interface PendingLeaveRequestData {
  id: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  status: string;
  createdAt: string;
}

export interface ActiveContractData {
  id: string;
  contractType: string;
  awardLevel: string | null;
  payRate: number;
  hoursPerWeek: number | null;
  startDate: string;
  endDate: string | null;
  status: string;
  acknowledgedByStaff: boolean;
}

export interface PendingPolicyData {
  id: string;
  title: string;
  category: string | null;
  version: number;
  publishedAt: string | null;
}

export interface OnboardingProgressData {
  active: boolean;
  packName?: string;
  totalTasks?: number;
  completedTasks?: number;
  status?: string;
}

export interface OffboardingProgressData {
  active: boolean;
  packName?: string;
  totalTasks?: number;
  completedTasks?: number;
  status?: string;
}

export interface LMSEnrollmentPortalData {
  id: string;
  courseName: string;
  status: string;
  progress: number;
  totalModules: number;
  completedModules: number;
}

export interface ComplianceCertPortalData {
  id: string;
  type: string;
  label: string | null;
  expiryDate: string;
  acknowledged: boolean;
}

export interface ActivityLogData {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  details: unknown;
  createdAt: string;
}

export interface MyPortalData {
  profile: ProfileData;
  leaveBalances: LeaveBalanceData[];
  pendingLeaveRequests: PendingLeaveRequestData[];
  activeContract: ActiveContractData | null;
  pendingPolicies: PendingPolicyData[];
  onboardingProgress: OnboardingProgressData;
  offboardingProgress: OffboardingProgressData;
  lmsEnrollments: LMSEnrollmentPortalData[];
  complianceCerts: ComplianceCertPortalData[];
  recentActivity: ActivityLogData[];
}

export function useMyPortal() {
  return useQuery<MyPortalData>({
    queryKey: ["my-portal"],
    queryFn: async () => {
      const res = await fetch("/api/my-portal");
      if (!res.ok) throw new Error("Failed to fetch portal data");
      return res.json();
    },
  });
}
