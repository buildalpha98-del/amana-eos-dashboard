"use client";

import {
  useInfiniteQuery,
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";

export interface EnrolmentSubmission {
  id: string;
  token: string;
  enquiryId: string | null;
  serviceId: string | null;
  primaryParent: {
    firstName: string;
    surname: string;
    email: string;
    mobile: string;
    relationship: string;
    [key: string]: unknown;
  };
  secondaryParent?: {
    firstName: string;
    surname: string;
    [key: string]: unknown;
  } | null;
  children: Array<{
    firstName: string;
    surname: string;
    dob: string;
    gender: string;
    medical?: Record<string, unknown>;
    bookingPrefs?: Record<string, unknown>;
    [key: string]: unknown;
  }>;
  /**
   * The Child rows this submission created. Only present on the single
   * -enrolment GET — the list endpoint doesn't join them.
   */
  childRecords?: Array<{
    id: string;
    firstName: string;
    surname: string;
    serviceId: string | null;
    status: string;
  }>;
  service?: { id: string; name: string } | null;
  emergencyContacts: Array<{
    name: string;
    relationship: string;
    phone: string;
    email: string;
  }>;
  consents: Record<string, boolean>;
  paymentMethod: string | null;
  paymentDetails: Record<string, unknown> | null;
  referralSource: string | null;
  termsAccepted: boolean;
  privacyAccepted: boolean;
  debitAgreement: boolean;
  courtOrders: boolean;
  courtOrderFiles?: Array<{ filename: string; url: string }> | null;
  medicalFiles?: Array<{ childIndex: number; type: string; filename: string; url: string }> | null;
  documentUploads?: Array<{ childIndex: number; type: string; filename: string; url: string }> | null;
  status: string;
  processedAt: string | null;
  notes: string | null;
  createdAt: string;
}

export interface EnrolmentsResponse {
  submissions: EnrolmentSubmission[];
  /** Rows matching the current status tab + search, across every page. */
  total: number;
  /** Per-status totals for the whole filtered set, keyed by status + `all`. */
  counts: Record<string, number>;
  /** Submissions with no service — children on no roll and no invoice. */
  unplaced: number;
  limit: number;
  offset: number;
}

/**
 * One screenful. Each row carries the family's whole JSON, so pages stay
 * modest and "Load more" does the rest.
 */
export const ENROLMENTS_PAGE_SIZE = 50;

function enrolmentsQuery(status?: string, search?: string) {
  const params = new URLSearchParams();
  if (status && status !== "all") params.set("status", status);
  if (search) params.set("search", search);
  return params;
}

/**
 * The enrolments list, a page at a time.
 *
 * Was a single `limit=100` fetch with the search box filtering the result in
 * the browser — so submission 101 onwards could not be reached OR found, and
 * the list looked like it had lost them. Paging and search both run on the
 * server now; `counts` describes the full set rather than the loaded pages.
 */
export function useEnrolments(status?: string, search?: string) {
  const trimmed = (search ?? "").trim();

  return useInfiniteQuery<EnrolmentsResponse>({
    staleTime: 30_000,
    queryKey: ["enrolments", status || "all", trimmed],
    queryFn: ({ pageParam }) => {
      const params = enrolmentsQuery(status, trimmed);
      params.set("limit", String(ENROLMENTS_PAGE_SIZE));
      params.set("offset", String(pageParam ?? 0));
      return fetchApi<EnrolmentsResponse>(`/api/enrolments?${params}`);
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((n, p) => n + p.submissions.length, 0);
      // A page that came back short means the server has nothing more, even
      // if `total` disagrees because a row was processed mid-scroll.
      if (lastPage.submissions.length === 0) return undefined;
      return loaded < lastPage.total ? loaded : undefined;
    },
    retry: 2,
  });
}

/**
 * Every row matching the current filters, for CSV export.
 *
 * Export used to write out whatever happened to be loaded and call it the
 * enrolment list — a silent truncation in a file people reconcile against
 * OWNA. This walks the pages instead, so the download matches the count on
 * screen.
 */
export async function fetchAllEnrolments(
  status?: string,
  search?: string,
): Promise<EnrolmentSubmission[]> {
  const rows: EnrolmentSubmission[] = [];
  const pageSize = 200; // the API's MAX_LIMIT — fewer round trips than the UI page

  for (let offset = 0; ; offset += pageSize) {
    const params = enrolmentsQuery(status, (search ?? "").trim());
    params.set("limit", String(pageSize));
    params.set("offset", String(offset));
    const page = await fetchApi<EnrolmentsResponse>(`/api/enrolments?${params}`);
    rows.push(...page.submissions);
    if (page.submissions.length < pageSize || rows.length >= page.total) break;
  }

  return rows;
}

export function useEnrolment(id: string | null) {
  return useQuery<EnrolmentSubmission>({
    staleTime: 30_000,
    queryKey: ["enrolment", id],
    queryFn: () => fetchApi<EnrolmentSubmission>(`/api/enrolments/${id}`),
    enabled: Boolean(id),
    retry: 2,
  });
}

export function useUpdateEnrolment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; status?: string; notes?: string }) => {
      return mutateApi<EnrolmentSubmission>(`/api/enrolments/${id}`, {
        method: "PATCH",
        body: data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enrolments"] });
      queryClient.invalidateQueries({ queryKey: ["enrolment"] });
      toast({ description: "Enrolment updated" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}
