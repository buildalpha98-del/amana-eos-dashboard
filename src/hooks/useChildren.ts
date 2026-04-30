"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";

export interface ChildParent {
  id?: string;
  firstName: string;
  surname: string;
  relationship: string;
  isPrimary: boolean;
  phone?: string;
  email?: string;
}

export interface ChildRecord {
  id: string;
  enrolmentId: string;
  serviceId: string | null;
  firstName: string;
  surname: string;
  dob: string | null;
  gender: string | null;
  address: { street?: string; suburb?: string; state?: string; postcode?: string } | null;
  culturalBackground: string[];
  schoolName: string | null;
  yearLevel: string | null;
  crn: string | null;
  medical: Record<string, unknown> | null;
  dietary: Record<string, unknown> | null;
  bookingPrefs: Record<string, unknown> | null;
  // ── Expanded profile fields ──
  medicalConditions: string[];
  medicationDetails: string | null;
  anaphylaxisActionPlan: boolean;
  dietaryRequirements: string[];
  additionalNeeds: string | null;
  photo: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  service: { id: string; name: string; code: string } | null;
  enrolment: {
    id: string;
    primaryParent: {
      firstName: string;
      surname: string;
      email: string;
      mobile: string;
      [key: string]: unknown;
    };
    status: string;
    createdAt: string;
  };
  /** Hydrated only when called with `includeParents: true`. */
  parents?: ChildParent[];
  /** Optional CCS status; absent for now until schema support lands. */
  ccsStatus?: string | null;
}

interface ChildrenResponse {
  children: ChildRecord[];
  total: number;
}

/**
 * Derive distinct, sorted filter option lists from a children result set.
 *
 * Only considers `Child.room` — NOT `ownaRoomName`. The `/api/children`
 * filter added in Commit 2 matches on `Child.room`, so surfacing OWNA-only
 * values here would produce empty result sets when the user selects them.
 *
 * OWNA-synced services need a one-off backfill
 * (`UPDATE "Child" SET "room" = "ownaRoomName" WHERE "room" IS NULL AND
 * "ownaRoomName" IS NOT NULL;`) before their room dropdown populates.
 */
export function deriveFilterOptions(
  children: Array<{
    room?: string | null;
    ccsStatus?: string | null;
    tags?: string[] | null;
  }>,
): {
  roomOptions: string[];
  ccsStatusOptions: string[];
  tagOptions: string[];
} {
  const rooms = new Set<string>();
  const ccs = new Set<string>();
  const tags = new Set<string>();
  for (const c of children) {
    if (c.room) rooms.add(c.room);
    if (c.ccsStatus) ccs.add(c.ccsStatus);
    for (const t of c.tags ?? []) tags.add(t);
  }
  return {
    roomOptions: [...rooms].sort(),
    ccsStatusOptions: [...ccs].sort(),
    tagOptions: [...tags].sort(),
  };
}

export interface ChildrenFilters {
  serviceId?: string;
  room?: string;
  day?: string;
  ccsStatus?: string;
  tags?: string[];
  status?: "current" | "all" | "withdrawn" | "active" | "pending";
  sortBy?: "surname" | "firstName" | "addedAt" | "dob";
  includeParents?: boolean;
  search?: string;
}

function buildQueryString(filters?: ChildrenFilters): string {
  if (!filters) return "";
  const params = new URLSearchParams();
  if (filters.serviceId) params.set("serviceId", filters.serviceId);
  if (filters.room) params.set("room", filters.room);
  if (filters.day) params.set("day", filters.day);
  if (filters.ccsStatus) params.set("ccsStatus", filters.ccsStatus);
  if (filters.status && filters.status !== "all") params.set("status", filters.status);
  if (filters.sortBy) params.set("sortBy", filters.sortBy);
  if (filters.includeParents) params.set("includeParents", "true");
  if (filters.search) params.set("search", filters.search);
  (filters.tags ?? [])
    .slice()
    .sort()
    .forEach((t) => params.append("tags", t));
  params.set("limit", "200");
  const str = params.toString();
  return str ? `?${str}` : "";
}

export function useChildren(filters?: ChildrenFilters) {
  const sortedTags = (filters?.tags ?? []).slice().sort();

  return useQuery<ChildrenResponse>({
    queryKey: [
      "children",
      filters?.serviceId ?? null,
      filters?.room ?? null,
      filters?.day ?? null,
      filters?.ccsStatus ?? null,
      filters?.status ?? null,
      filters?.sortBy ?? null,
      filters?.includeParents ?? false,
      filters?.search ?? null,
      ...sortedTags,
    ],
    queryFn: () => fetchApi<ChildrenResponse>(`/api/children${buildQueryString(filters)}`),
    retry: 2,
    staleTime: 30_000,
  });
}

export function useChild(id: string | null) {
  return useQuery<ChildRecord>({
    queryKey: ["child", id],
    queryFn: () => fetchApi<ChildRecord>(`/api/children/${id}`),
    enabled: Boolean(id),
    retry: 2,
  });
}

export function useUpdateChild() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; status?: string; serviceId?: string }) => {
      return mutateApi<ChildRecord>(`/api/children/${id}`, {
        method: "PATCH",
        body: data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["children"] });
      queryClient.invalidateQueries({ queryKey: ["child"] });
      toast({ description: "Child record updated" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}
