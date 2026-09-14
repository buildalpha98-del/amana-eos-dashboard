"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import type { EmploymentType, AwardLevel, QualificationType, NewStarterRequestStatus } from "@prisma/client";

export interface NewStarterRequestItem {
  id: string;
  fullName: string;
  dateOfBirth: string;
  address: string;
  mobile: string;
  email: string;
  targetPosition: string;
  employmentType: EmploymentType;
  /** Optional since 2026-09-14 — dropped from the intake form; the award
   *  level is settled when the contract is drafted. Historical rows keep
   *  whatever they were submitted with. */
  awardLevel: AwardLevel | null;
  awardLevelCustom: string | null;
  qualification: QualificationType | null;
  /** Whether the dashboard invite actually reached them. Null on rows
   *  submitted before 2026-09-14, when the outcome wasn't recorded. */
  inviteStatus:
    | "sent"
    | "suppressed"
    | "rejected"
    | "not_configured"
    | "error"
    | null;
  inviteError: string | null;
  inviteSentAt: string | null;
  expectedStartDate: string;
  notes: string | null;
  status: NewStarterRequestStatus;
  requestedBy: { id: string; name: string; email: string; avatar: string | null };
  assignedAdmin: { id: string; name: string } | null;
  completedBy: { id: string; name: string } | null;
  completedUser: { id: string; name: string; email: string } | null;
  service: { id: string; name: string };
  createdAt: string;
}

export interface NewStarterRequestInput {
  fullName: string;
  dateOfBirth: string;
  address: string;
  mobile: string;
  email: string;
  targetPosition: string;
  employmentType: EmploymentType;
  awardLevel?: AwardLevel | null;
  awardLevelCustom?: string;
  qualification?: QualificationType | null;
  serviceId: string;
  expectedStartDate: string;
  notes?: string;
}

export function useOnboardingRequests(status?: NewStarterRequestStatus) {
  return useQuery<{ requests: NewStarterRequestItem[] }>({
    queryKey: ["onboarding-requests", status ?? ""],
    queryFn: () =>
      fetchApi(`/api/onboarding-requests${status ? `?status=${status}` : ""}`),
    retry: 2,
  });
}

export function useCreateOnboardingRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewStarterRequestInput) =>
      mutateApi<NewStarterRequestItem>("/api/onboarding-requests", {
        method: "POST",
        body: input,
      }),
    onSuccess: (data, input) => {
      // Read the real outcome rather than asserting the happy path. This
      // toast used to say "their invite is on the way" unconditionally,
      // which is how a suppressed address reached a State Manager as a
      // success message while the new hire got nothing.
      const delivered = !data?.inviteStatus || data.inviteStatus === "sent";
      if (delivered) {
        toast({
          description: `${input.fullName}'s account is set up — their dashboard invite is on the way.`,
        });
      } else {
        toast({
          variant: "destructive",
          description: `${input.fullName}'s account is set up, but their invite did NOT send. See the warning on their row to resend.`,
        });
      }
      qc.invalidateQueries({ queryKey: ["onboarding-requests"] });
      qc.invalidateQueries({ queryKey: ["employees-list"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message });
    },
  });
}

/**
 * Re-issue a new starter's dashboard invite after a delivery failure.
 *
 * Rotates the temp password server-side, so the toast says so — an admin
 * who resends needs to know any earlier password is now dead.
 */
export function useResendOnboardingInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      mutateApi<{ delivered: boolean; inviteError: string | null }>(
        `/api/onboarding-requests/${id}/resend-invite`,
        { method: "POST" },
      ),
    onSuccess: (data) => {
      if (data?.delivered) {
        toast({
          description: "Invite resent with a new temporary password.",
        });
      } else {
        toast({
          variant: "destructive",
          description:
            data?.inviteError ??
            "Still couldn't send that invite. Check the address and suppression list.",
        });
      }
      qc.invalidateQueries({ queryKey: ["onboarding-requests"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message });
    },
  });
}
