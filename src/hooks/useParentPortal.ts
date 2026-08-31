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
  // ── Extended profile (populated from CentreContact) ─────
  dob: string | null; // YYYY-MM-DD
  crn: string | null;
  relationship: string | null;
  occupation: string | null;
  workplace: string | null;
  workPhone: string | null;
  smsOptIn: boolean;
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

/**
 * One REAL session this child attended — a sign-in row, not a derived
 * status. The old AttendanceDay shape was built from service-level
 * totals and reported "present" for children who never came.
 */
export interface AttendanceSession {
  id: string;
  date: string;
  sessionType: string;
  signInTime: string | null;
  signOutTime: string | null;
  signedInByName: string | null;
  signedOutByName: string | null;
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
  firstName?: string;
  lastName?: string;
  dob?: string; // YYYY-MM-DD
  crn?: string;
  relationship?: string;
  occupation?: string;
  workplace?: string;
  workPhone?: string;
  smsOptIn?: boolean;
}

// ── Booking Types ───────────────────────────────────────

export interface BookingRecord {
  id: string;
  date: string;
  sessionType: string;
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
  sessionType: string;
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
  sessionType: string;
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
  return useQuery<{ records: AttendanceSession[] }>({
    queryKey: ["parent", "child-attendance", childId],
    queryFn: () =>
      fetchApi(`/api/parent/children/${childId}/attendance?limit=30`),
    enabled: !!childId,
    retry: 2,
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
      toast({ description: "Booking confirmed" });
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
    /**
     * The room's own name. Stage 2 of docs/rooms-migration-plan.md —
     * a parent used to see "EXTRA1" here, because the label came from
     * an org-wide map that only knew three codes and ignored whatever
     * the centre had actually named its rooms.
     */
    room: { id: string; name: string } | null;
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
  subject: string;
  status: string;
  service: { id: string; name: string } | null;
  lastMessage: {
    preview: string;
    senderType: "staff" | "parent";
    createdAt: string;
  } | null;
  unreadCount: number;
  createdAt: string;
  lastMessageAt: string;
}

export interface ConversationDetail {
  id: string;
  subject: string;
  status: string;
  service: { id: string; name: string } | null;
  messages: ConversationMessage[];
}

export interface ConversationMessage {
  id: string;
  senderType: "staff" | "parent";
  senderName: string;
  body: string;
  attachmentUrls: string[];
  isRead: boolean;
  createdAt: string;
}

export interface CreateConversationPayload {
  subject: string;
  message: string;
  serviceId?: string;
  attachmentUrls?: string[];
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

export function useConversationDetail(conversationId: string) {
  return useQuery<ConversationDetail>({
    queryKey: ["parent", "messages", conversationId],
    queryFn: () => fetchApi<ConversationDetail>(`/api/parent/messages/${conversationId}`),
    retry: 2,
    staleTime: 15_000,
    refetchInterval: 30_000,
    enabled: !!conversationId,
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
    mutationFn: ({
      conversationId,
      body,
      attachmentUrls,
    }: {
      conversationId: string;
      body: string;
      attachmentUrls?: string[];
    }) =>
      mutateApi(`/api/parent/messages/${conversationId}/reply`, {
        method: "POST",
        body: { body, ...(attachmentUrls ? { attachmentUrls } : {}) },
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["parent", "messages", variables.conversationId] });
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

/**
 * 2026-07-30: takes `enabled` because this fired for SIGNED-OUT visitors.
 * useParentInstallEffects calls it unconditionally (hooks can't be
 * conditional), so on /parent/signup and /parent/login it hit an
 * auth-required endpoint, got a 401, and QueryProvider toasted
 * "Session expired" and reloaded the page — which remounted the hook and
 * repeated, looping every few seconds on the very pages a parent without
 * an account has to use.
 *
 * `retry: false` as well: retrying a 401 can't succeed and only multiplies
 * the toasts.
 */
export function useParentOnboarding(enabled: boolean = true) {
  return useQuery<OnboardingResponse>({
    queryKey: ["parent", "onboarding"],
    queryFn: () => fetchApi<OnboardingResponse>("/api/parent/onboarding"),
    enabled,
    retry: false,
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
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
}

export interface PostComment {
  id: string;
  body: string;
  createdAt: string;
  authorName: string;
  authorType: "parent" | "staff";
  authorAvatar?: string;
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

// ── Post engagement (like + comment) ─────────────────────

interface LikeResponse {
  liked: boolean;
  likeCount: number;
}

export function useParentPostLikeToggle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, liked }: { postId: string; liked: boolean }) =>
      mutateApi<LikeResponse>(`/api/parent/posts/${postId}/like`, {
        method: liked ? "DELETE" : "POST",
      }),
    onMutate: async ({ postId, liked }) => {
      // Optimistic update: flip likedByMe and adjust likeCount in all cached
      // timeline pages.
      await queryClient.cancelQueries({ queryKey: ["parent-timeline"] });
      const previous = queryClient.getQueryData(["parent-timeline"]);
      queryClient.setQueryData(["parent-timeline"], (old: any) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page: TimelineResponse) => ({
            ...page,
            items: page.items.map((item) =>
              item.id === postId
                ? {
                    ...item,
                    likedByMe: !liked,
                    likeCount: item.likeCount + (liked ? -1 : 1),
                  }
                : item,
            ),
          })),
        };
      });
      return { previous };
    },
    onError: (err: Error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["parent-timeline"], context.previous);
      }
      toast({
        variant: "destructive",
        description: err.message || "Could not update like.",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["parent-timeline"] });
    },
  });
}


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

export interface WeekDayInfo {
  day: string;
  menu: DailyMenuItem[];
  program: DailyProgram[];
}

export interface DailyInfoResponse {
  todayMenu: { items: DailyMenuItem[] } | null;
  todayProgram: DailyProgram[];
  /** Monday–Friday of the current week — menu and programme per day. */
  week?: WeekDayInfo[];
}

export function useParentDailyInfo() {
  return useQuery<DailyInfoResponse>({
    queryKey: ["parent-daily-info"],
    queryFn: () => fetchApi<DailyInfoResponse>("/api/parent/daily-info"),
    staleTime: 5 * 60_000, // 5 min — menu/program changes rarely
    retry: 2,
  });
}

// ── Sibling Enrolment Applications ─────────────────────────

export interface ParentEnrolmentApplication {
  id: string;
  childFirstName: string;
  childLastName: string;
  childDateOfBirth: string;
  serviceId: string;
  serviceName: string;
  status: string;
  type: string;
  sessionTypes: string[];
  startDate: string | null;
  createdAt: string;
  reviewedAt: string | null;
  declineReason: string | null;
}

export function useParentEnrolmentApplications() {
  return useQuery<ParentEnrolmentApplication[]>({
    queryKey: ["parent", "enrolment-applications"],
    queryFn: () => fetchApi<ParentEnrolmentApplication[]>("/api/parent/enrolments"),
    retry: 2,
    staleTime: 30_000,
  });
}

export interface CreateSiblingEnrolmentPayload {
  serviceId: string;
  childFirstName: string;
  childLastName: string;
  childDateOfBirth: string;
  childGender?: string;
  childSchool?: string;
  childYear?: string;
  sessionTypes: string[];
  startDate?: string;
  medicalConditions: string[];
  dietaryRequirements: string[];
  medicationDetails?: string;
  anaphylaxisActionPlan?: string;
  additionalNeeds?: string;
  consentPhotography: boolean;
  consentSunscreen: boolean;
  consentFirstAid: boolean;
  consentExcursions: boolean;
  copyAuthorisedPickups: boolean;
  copyEmergencyContacts: boolean;
}

export function useCreateSiblingEnrolment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateSiblingEnrolmentPayload) =>
      mutateApi("/api/parent/enrolments", {
        method: "POST",
        body: payload,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parent", "enrolment-applications"] });
      toast({ description: "Enrolment application submitted successfully" });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        description: err.message || "Failed to submit enrolment application",
      });
    },
  });
}

export function useWithdrawSiblingEnrolment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      mutateApi(`/api/parent/enrolments/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parent", "enrolment-applications"] });
      toast({ description: "Enrolment application withdrawn" });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        description: err.message || "Failed to withdraw application",
      });
    },
  });
}
