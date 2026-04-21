import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

// ── Types ──────────────────────────────────────────────────

export interface EnrolmentApplicationSummary {
  id: string;
  serviceId: string;
  serviceName: string;
  familyId: string;
  parentName: string;
  parentEmail: string;
  status: string;
  type: string;
  childFirstName: string;
  childLastName: string;
  childDateOfBirth: string;
  sessionTypes: string[];
  startDate: string | null;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  declineReason: string | null;
  notes: string | null;
}

export interface EnrolmentApplicationDetail extends EnrolmentApplicationSummary {
  childGender: string | null;
  childSchool: string | null;
  childYear: string | null;
  medicalConditions: string[];
  dietaryRequirements: string[];
  medicationDetails: string | null;
  anaphylaxisActionPlan: string | null;
  additionalNeeds: string | null;
  consentPhotography: boolean;
  consentSunscreen: boolean;
  consentFirstAid: boolean;
  consentExcursions: boolean;
  copyAuthorisedPickups: boolean;
  copyEmergencyContacts: boolean;
  createdChildId: string | null;
  ownaExportedAt: string | null;
  updatedAt: string;
  siblings: Array<{
    id: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string | null;
    yearLevel: string | null;
    status: string;
    authorisedPickups: Array<{
      id: string;
      name: string;
      relationship: string;
      phone: string;
    }>;
  }>;
}

// ── Queries ────────────────────────────────────────────────

export function useEnrolmentApplications(
  status?: string,
  serviceId?: string,
) {
  const params = new URLSearchParams();
  if (status && status !== "all") params.set("status", status);
  if (serviceId) params.set("serviceId", serviceId);
  const qs = params.toString();

  return useQuery<{ applications: EnrolmentApplicationSummary[]; total: number }>({
    queryKey: ["enrolment-applications", status, serviceId],
    queryFn: () =>
      fetchApi(`/api/enrolment-applications${qs ? `?${qs}` : ""}`),
    retry: 2,
    staleTime: 30_000,
  });
}

export function useEnrolmentApplicationDetail(id: string | null) {
  return useQuery<EnrolmentApplicationDetail>({
    queryKey: ["enrolment-application", id],
    queryFn: () => fetchApi(`/api/enrolment-applications/${id}`),
    enabled: !!id,
    retry: 2,
    staleTime: 30_000,
  });
}

// ── Mutations ──────────────────────────────────────────────

export function useApproveEnrolmentApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      mutateApi(`/api/enrolment-applications/${id}/approve`, {
        method: "POST",
        body: { notes },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enrolment-applications"] });
      queryClient.invalidateQueries({ queryKey: ["enrolment-application"] });
      toast({ description: "Enrolment application approved" });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        description: err.message || "Failed to approve application",
      });
    },
  });
}

export function useDeclineEnrolmentApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      mutateApi(`/api/enrolment-applications/${id}/decline`, {
        method: "POST",
        body: { reason },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enrolment-applications"] });
      queryClient.invalidateQueries({ queryKey: ["enrolment-application"] });
      toast({ description: "Enrolment application declined" });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        description: err.message || "Failed to decline application",
      });
    },
  });
}

/**
 * Download the OWNA-import CSV for an application. Triggers a browser
 * download on success and refreshes the detail query so the UI reflects
 * the new ownaExportedAt timestamp.
 */
export function useDownloadOwnaCsv() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/enrolment-applications/${id}/owna-csv`);
      if (!res.ok) {
        let serverError = `Request failed with status ${res.status}`;
        try {
          const body = await res.json();
          serverError = body?.error ?? serverError;
        } catch {
          // non-JSON error body — ignore
        }
        throw new Error(serverError);
      }
      // Pull filename from Content-Disposition
      const cd = res.headers.get("content-disposition") ?? "";
      const match = cd.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? "enrolment.csv";
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      return { id, filename };
    },
    onSuccess: ({ id }) => {
      queryClient.invalidateQueries({ queryKey: ["enrolment-application", id] });
      queryClient.invalidateQueries({ queryKey: ["enrolment-applications"] });
      toast({ description: "OWNA CSV downloaded" });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        description: err.message || "Failed to download CSV",
      });
    },
  });
}
