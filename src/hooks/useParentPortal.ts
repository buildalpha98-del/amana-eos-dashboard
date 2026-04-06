"use client";

import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

// ── Types ────────────────────────────────────────────────

export interface ParentProfile {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  address: {
    street: string;
    suburb: string;
    state: string;
    postcode: string;
  } | null;
  children: ParentChild[];
  emergencyContacts: EmergencyContact[];
}

export interface ParentChild {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  yearLevel: string | null;
  serviceName: string;
  serviceId: string;
  medicalConditions: string[];
  allergies: string[];
  medications: string[];
  immunisationStatus: string | null;
  emergencyContacts: EmergencyContact[];
  attendanceThisWeek: {
    attended: number;
    total: number;
  };
}

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  relationship: string;
}

export interface AttendanceDay {
  date: string;
  status: "present" | "absent" | "no_session";
  signInTime: string | null;
  signOutTime: string | null;
}

export interface UpdateAccountPayload {
  phone?: string;
  address?: {
    street: string;
    suburb: string;
    state: string;
    postcode: string;
  };
  emergencyContacts?: {
    id?: string;
    name: string;
    phone: string;
    relationship: string;
  }[];
}

// ── Booking Types ───────────────────────────────────────

export interface BookingRecord {
  id: string;
  date: string;
  sessionType: "bsc" | "asc" | "vc";
  status: "requested" | "confirmed" | "waitlisted" | "cancelled" | "absent_notified";
  type: "permanent" | "casual" | "vacation_care";
  fee: number | null;
  ccsApplied: number | null;
  gapFee: number | null;
  notes: string | null;
  child: { id: string; firstName: string; surname: string; yearLevel?: string | null };
  service: { id: string; name: string };
  createdAt: string;
}

export interface AbsenceRecord {
  id: string;
  date: string;
  sessionType: "bsc" | "asc" | "vc";
  isIllness: boolean;
  medicalCertificateUrl: string | null;
  notes: string | null;
  child: { id: string; firstName: string; surname: string };
  service: { id: string; name: string };
  createdAt: string;
}

export interface BookingsResponse {
  bookings: BookingRecord[];
  absences: AbsenceRecord[];
}

export interface CreateBookingPayload {
  childId: string;
  serviceId: string;
  date: string; // YYYY-MM-DD
  sessionType: "bsc" | "asc" | "vc";
}

export interface MarkAbsentPayload {
  isIllness: boolean;
  medicalCertificateUrl?: string;
  notes?: string;
}

// ── Statement Types ─────────────────────────────────────

export interface StatementRecord {
  id: string;
  periodStart: string;
  periodEnd: string;
  totalFees: number;
  totalCcs: number;
  gapFee: number;
  amountPaid: number;
  balance: number;
  status: "issued" | "paid" | "unpaid" | "overdue";
  pdfUrl: string | null;
  dueDate: string | null;
  issuedAt: string | null;
  notes: string | null;
  createdAt: string;
  service: { id: string; name: string };
}

export interface StatementsResponse {
  statements: StatementRecord[];
  summary: {
    currentBalance: number;
    overdueCount: number;
  };
}

// ── Child Medical Types ─────────────────────────────────

export interface UpdateChildMedicalPayload {
  medicalConditions?: string[];
  allergies?: string[];
  medications?: string[];
  immunisationStatus?: string;
  dietary?: { requirements?: string[]; notes?: string };
  actionPlanUrl?: string;
}

// ── Hooks ────────────────────────────────────────────────

export function useParentProfile() {
  return useQuery<ParentProfile>({
    queryKey: ["parent", "profile"],
    queryFn: () => fetchApi<ParentProfile>("/api/parent/me"),
    retry: 2,
    staleTime: 30_000,
  });
}

export function useParentChildren() {
  return useQuery<ParentChild[]>({
    queryKey: ["parent", "children"],
    queryFn: () => fetchApi<ParentChild[]>("/api/parent/children"),
    retry: 2,
    staleTime: 30_000,
  });
}

export function useChildAttendance(childId: string) {
  return useQuery<AttendanceDay[]>({
    queryKey: ["parent", "children", childId, "attendance"],
    queryFn: () =>
      fetchApi<AttendanceDay[]>(
        `/api/parent/children/${childId}/attendance`
      ),
    retry: 2,
    staleTime: 30_000,
    enabled: !!childId,
  });
}

export function useUpdateParentAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateAccountPayload) =>
      mutateApi("/api/parent/account", {
        method: "PATCH",
        body: payload,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parent"] });
      toast({ description: "Account details updated successfully" });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        description: err.message || "Something went wrong",
      });
    },
  });
}

// ── Booking Hooks ───────────────────────────────────────

export function useParentBookings(period: "upcoming" | "past" = "upcoming") {
  const query = period === "past" ? "?period=past" : "";
  return useQuery<BookingsResponse>({
    queryKey: ["parent", "bookings", period],
    queryFn: () => fetchApi<BookingsResponse>(`/api/parent/bookings${query}`),
    retry: 2,
    staleTime: 30_000,
  });
}

export function useRequestBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateBookingPayload) =>
      mutateApi("/api/parent/bookings", {
        method: "POST",
        body: payload,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parent", "bookings"] });
      toast({ description: "Booking request submitted" });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        description: err.message || "Something went wrong",
      });
    },
  });
}

export function useMarkAbsent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ bookingId, ...payload }: MarkAbsentPayload & { bookingId: string }) =>
      mutateApi(`/api/parent/bookings/${bookingId}`, {
        method: "PATCH",
        body: payload,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parent", "bookings"] });
      toast({ description: "Absence recorded" });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        description: err.message || "Something went wrong",
      });
    },
  });
}

export function useCancelBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (bookingId: string) =>
      mutateApi(`/api/parent/bookings/${bookingId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parent", "bookings"] });
      toast({ description: "Booking cancelled" });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        description: err.message || "Something went wrong",
      });
    },
  });
}

// ── Statement Hooks ─────────────────────────────────────

export function useParentStatements() {
  return useQuery<StatementsResponse>({
    queryKey: ["parent", "statements"],
    queryFn: () => fetchApi<StatementsResponse>("/api/parent/statements"),
    retry: 2,
    staleTime: 30_000,
  });
}

export interface StatementDetailResponse {
  id: string;
  periodStart: string;
  periodEnd: string;
  totalFees: number;
  totalCcs: number;
  gapFee: number;
  amountPaid: number;
  balance: number;
  status: string;
  pdfUrl: string | null;
  dueDate: string | null;
  issuedAt: string | null;
  service: { id: string; name: string };
  lineItems: {
    id: string;
    date: string;
    sessionType: string;
    description: string;
    grossFee: number;
    ccsAmount: number;
    gapAmount: number;
    child: { id: string; firstName: string; surname: string | null };
  }[];
}

export function useParentStatementDetail(id: string | null) {
  return useQuery<StatementDetailResponse>({
    queryKey: ["parent", "statements", id],
    queryFn: () => fetchApi<StatementDetailResponse>(`/api/parent/statements/${id}`),
    enabled: !!id,
    retry: 2,
    staleTime: 30_000,
  });
}

// ── Child Medical Hook ──────────────────────────────────

export function useUpdateChildMedical() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ childId, payload }: { childId: string; payload: UpdateChildMedicalPayload }) =>
      mutateApi(`/api/parent/children/${childId}`, {
        method: "PATCH",
        body: payload,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parent", "children"] });
      queryClient.invalidateQueries({ queryKey: ["parent", "profile"] });
      toast({ description: "Medical details updated" });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        description: err.message || "Something went wrong",
      });
    },
  });
}

// ── Messaging Types ─────────────────────────────────────

export interface ConversationSummary {
  id: string;
  ticketNumber: number;
  subject: string | null;
  status: string;
  service: { id: string; name: string } | null;
  lastMessage: {
    preview: string;
    direction: "inbound" | "outbound";
    createdAt: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationDetail {
  id: string;
  ticketNumber: number;
  subject: string | null;
  status: string;
  service: { id: string; name: string } | null;
  messages: ConversationMessage[];
}

export interface ConversationMessage {
  id: string;
  direction: "inbound" | "outbound";
  senderName: string | null;
  body: string;
  mediaUrl: string | null;
  mediaType: string | null;
  createdAt: string;
}

export interface CreateConversationPayload {
  subject: string;
  message: string;
  serviceId?: string;
}

// ── Messaging Hooks ─────────────────────────────────────

export function useParentConversations() {
  return useQuery<ConversationSummary[]>({
    queryKey: ["parent", "messages"],
    queryFn: () => fetchApi<ConversationSummary[]>("/api/parent/messages"),
    retry: 2,
    staleTime: 30_000,
  });
}

export function useConversationDetail(ticketId: string) {
  return useQuery<ConversationDetail>({
    queryKey: ["parent", "messages", ticketId],
    queryFn: () => fetchApi<ConversationDetail>(`/api/parent/messages/${ticketId}`),
    retry: 2,
    staleTime: 15_000,
    enabled: !!ticketId,
  });
}

export function useCreateConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateConversationPayload) =>
      mutateApi("/api/parent/messages", {
        method: "POST",
        body: payload,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parent", "messages"] });
      toast({ description: "Message sent" });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        description: err.message || "Something went wrong",
      });
    },
  });
}

export function useSendReply() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ticketId, message }: { ticketId: string; message: string }) =>
      mutateApi(`/api/parent/messages/${ticketId}`, {
        method: "POST",
        body: { message },
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["parent", "messages", variables.ticketId] });
      queryClient.invalidateQueries({ queryKey: ["parent", "messages"] });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        description: err.message || "Something went wrong",
      });
    },
  });
}

// ── Onboarding Types & Hooks ────────────────────────────

export interface OnboardingProgress {
  profile: boolean;
  medical: boolean;
  documents: boolean;
  pickups: boolean;
  installed: boolean;
}

export interface OnboardingResponse {
  progress: OnboardingProgress;
  completedCount: number;
  totalCount: number;
}

export function useParentOnboarding() {
  return useQuery<OnboardingResponse>({
    queryKey: ["parent", "onboarding"],
    queryFn: () => fetchApi<OnboardingResponse>("/api/parent/onboarding"),
    retry: 2,
    staleTime: 30_000,
  });
}

export function useMarkOnboardingStep() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { installed: boolean }) =>
      mutateApi("/api/parent/onboarding", {
        method: "PATCH",
        body: payload,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parent", "onboarding"] });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        description: err.message || "Something went wrong",
      });
    },
  });
}

// ── Timeline ────────────────────────────────────────────

export interface TimelinePost {
  id: string;
  serviceId: string;
  title: string;
  content: string;
  type: string;
  mediaUrls: string[];
  author: { id: string; name: string | null; avatar: string | null } | null;
  isCommunity: boolean;
  createdAt: string;
  tags: Array<{
    id: string;
    child: { id: string; firstName: string; surname: string };
  }>;
}

interface TimelineResponse {
  items: TimelinePost[];
  nextCursor?: string;
}

export function useParentTimeline() {
  return useInfiniteQuery<TimelineResponse>({
    queryKey: ["parent-timeline"],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (pageParam) params.set("cursor", pageParam as string);
      params.set("limit", "10");
      return fetchApi<TimelineResponse>(`/api/parent/timeline?${params}`);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 30_000,
    retry: 2,
  });
}

// ── Daily Info (Menu + Program) ─────────────────────────

export interface DailyMenuItem {
  slot: string;
  description: string;
  allergens: string[];
}

export interface DailyProgram {
  id: string;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
  location: string | null;
  staffName: string | null;
  programmeBrand: string | null;
}

export interface DailyInfoResponse {
  todayMenu: { items: DailyMenuItem[] } | null;
  todayProgram: DailyProgram[];
}

export function useParentDailyInfo() {
  return useQuery<DailyInfoResponse>({
    queryKey: ["parent-daily-info"],
    queryFn: () => fetchApi<DailyInfoResponse>("/api/parent/daily-info"),
    staleTime: 5 * 60_000, // 5 min — menu/program changes rarely
    retry: 2,
  });
}
