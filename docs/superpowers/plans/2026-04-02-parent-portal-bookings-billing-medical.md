# Parent Portal: Bookings, Billing, Medical & Sibling Enrolment

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bookings management, billing/statements, child medical editing, and sibling enrolment to the parent portal.

**Architecture:** Four features built on the existing parent portal auth (`withParentAuth` JWT wrapper), React Query data layer (`useParentPortal.ts` hooks), and Radix UI components. API routes follow the `withParentAuth` + Zod validation + `ApiError` pattern established by existing parent routes. The EnrolmentWizard is extended with props for portal integration rather than duplicated.

**Tech Stack:** Next.js 16, React 19, TanStack Query, Zod, Radix UI Dialog, Tailwind CSS, Prisma ORM

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `src/app/api/parent/statements/route.ts` | GET statements for authenticated parent |
| `src/app/api/parent/children/[childId]/route.ts` | PATCH child medical/dietary info |
| `src/app/parent/bookings/page.tsx` | Bookings list + request dialog + mark absent |
| `src/app/parent/billing/page.tsx` | Balance summary + statements list + mock payment methods |
| `src/app/parent/children/new/page.tsx` | Sibling enrolment wrapper page |
| `src/components/parent/RequestBookingDialog.tsx` | Casual booking request form dialog |

### Modified Files
| File | Changes |
|------|---------|
| `src/hooks/useParentPortal.ts` | Add `useParentBookings`, `useRequestBooking`, `useMarkAbsent`, `useParentStatements`, `useUpdateChildMedical` hooks + types |
| `src/app/parent/layout.tsx` | Add 5th nav item (Billing) |
| `src/app/parent/children/[id]/page.tsx` | Add edit dialog to Medical tab |
| `src/components/enrol/EnrolmentWizard.tsx` | Add `parentPrefill`, `skipSteps`, `onComplete`, `variant` props |
| `src/components/enrol/steps/ParentDetailsStep.tsx` | Add `readOnly` support |

---

## Chunk 1: Hooks & API Routes (Data Layer)

All four features share the same data-fetching pattern. Build all hooks and API routes first so UI tasks can consume them.

### Task 1: Add booking hooks and types to useParentPortal.ts

**Files:**
- Modify: `src/hooks/useParentPortal.ts`

- [ ] **Step 1: Add booking types**

Add after the existing `UpdateAccountPayload` interface (around line 71):

```ts
// ── Booking Types ───────────────────────────────────────

export interface BookingRecord {
  id: string;
  date: string;
  sessionType: "bsc" | "asc" | "vc";
  status: "requested" | "confirmed" | "waitlisted" | "cancelled" | "absent";
  type: "permanent" | "casual";
  fee: number | null;
  ccsApplied: number | null;
  child: { id: string; firstName: string; surname: string };
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
  bookingId: string;
  isIllness: boolean;
  notes?: string;
}
```

- [ ] **Step 2: Add booking hooks**

Add after the existing `useUpdateParentAccount` hook:

```ts
// ── Booking Hooks ───────────────────────────────────────

export function useParentBookings() {
  return useQuery<BookingsResponse>({
    queryKey: ["parent", "bookings"],
    queryFn: () => fetchApi<BookingsResponse>("/api/parent/bookings"),
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
    mutationFn: (payload: MarkAbsentPayload) =>
      mutateApi("/api/parent/bookings", {
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
```

- [ ] **Step 3: Verify no type errors**

Run: `npx tsc --noEmit 2>&1 | grep useParentPortal`
Expected: No output (no errors)

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useParentPortal.ts
git commit -m "feat(parent): add booking hooks and types to useParentPortal"
```

---

### Task 2: Add statement hooks and types

**Files:**
- Modify: `src/hooks/useParentPortal.ts`

- [ ] **Step 1: Add statement types**

Add after the booking types:

```ts
// ── Statement Types ─────────────────────────────────────

export interface StatementRecord {
  id: string;
  periodStart: string;
  periodEnd: string;
  totalFees: number;
  totalCcs: number;
  gapFee: number;
  status: "paid" | "unpaid" | "overdue";
  pdfUrl: string | null;
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
```

- [ ] **Step 2: Add statement hook**

```ts
export function useParentStatements() {
  return useQuery<StatementsResponse>({
    queryKey: ["parent", "statements"],
    queryFn: () => fetchApi<StatementsResponse>("/api/parent/statements"),
    retry: 2,
    staleTime: 30_000,
  });
}
```

- [ ] **Step 3: Add child medical update types and hook**

```ts
// ── Child Medical Types ─────────────────────────────────

export interface UpdateChildMedicalPayload {
  medicalConditions?: string[];
  allergies?: string[];
  medications?: string[];
  immunisationStatus?: string;
  dietary?: { requirements?: string[]; notes?: string };
  actionPlanUrl?: string;
}

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
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useParentPortal.ts
git commit -m "feat(parent): add statement and child medical hooks"
```

---

### Task 3: Create statements API route

**Files:**
- Create: `src/app/api/parent/statements/route.ts`

- [ ] **Step 1: Create the route file**

```ts
import { NextResponse } from "next/server";
import { withParentAuth } from "@/lib/parent-auth";
import { prisma } from "@/lib/prisma";

export const GET = withParentAuth(async (_req, { parent }) => {
  if (parent.enrolmentIds.length === 0) {
    return NextResponse.json({ statements: [], summary: { currentBalance: 0, overdueCount: 0 } });
  }

  // Get serviceIds from parent's enrolments
  const enrolments = await prisma.enrolmentSubmission.findMany({
    where: { id: { in: parent.enrolmentIds }, status: { not: "draft" } },
    select: { serviceId: true },
  });
  const serviceIds = [...new Set(enrolments.map((e) => e.serviceId).filter(Boolean))] as string[];

  if (serviceIds.length === 0) {
    return NextResponse.json({ statements: [], summary: { currentBalance: 0, overdueCount: 0 } });
  }

  // Find CentreContact records for this parent
  const contacts = await prisma.centreContact.findMany({
    where: {
      email: parent.email.toLowerCase(),
      serviceId: { in: serviceIds },
    },
    select: { id: true },
  });
  const contactIds = contacts.map((c) => c.id);

  if (contactIds.length === 0) {
    return NextResponse.json({ statements: [], summary: { currentBalance: 0, overdueCount: 0 } });
  }

  const statements = await prisma.statement.findMany({
    where: { contactId: { in: contactIds } },
    include: {
      service: { select: { id: true, name: true } },
    },
    orderBy: { periodEnd: "desc" },
  });

  // Calculate summary
  const unpaidStatements = statements.filter((s) => s.status === "unpaid" || s.status === "overdue");
  const currentBalance = unpaidStatements.reduce((sum, s) => sum + s.gapFee, 0);
  const overdueCount = statements.filter((s) => s.status === "overdue").length;

  return NextResponse.json({
    statements,
    summary: { currentBalance, overdueCount },
  });
});
```

- [ ] **Step 2: Verify no type errors**

Run: `npx tsc --noEmit 2>&1 | grep statements`
Expected: No output

- [ ] **Step 3: Commit**

```bash
git add src/app/api/parent/statements/route.ts
git commit -m "feat(parent): add GET /api/parent/statements route"
```

---

### Task 4: Create child medical PATCH API route

**Files:**
- Create: `src/app/api/parent/children/[childId]/route.ts`

- [ ] **Step 1: Create the route file**

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withParentAuth } from "@/lib/parent-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";

const updateMedicalSchema = z.object({
  medicalConditions: z.array(z.string()).optional(),
  allergies: z.array(z.string()).optional(),
  medications: z.array(z.string()).optional(),
  immunisationStatus: z.string().optional(),
  dietary: z
    .object({
      requirements: z.array(z.string()).optional(),
      notes: z.string().max(500).optional(),
    })
    .optional(),
  actionPlanUrl: z.string().url().optional(),
});

export const PATCH = withParentAuth(async (req, ctx) => {
  const params = await ctx.params;
  const childId = params?.childId;
  if (!childId) throw ApiError.badRequest("childId is required");

  const body = await parseJsonBody(req);
  const parsed = updateMedicalSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid medical data", parsed.error.flatten().fieldErrors);
  }

  const { parent } = ctx;

  // Verify child belongs to parent
  const child = await prisma.child.findUnique({
    where: { id: childId },
    select: { id: true, enrolmentId: true, medical: true, dietary: true },
  });
  if (!child) throw ApiError.notFound("Child not found");
  if (!child.enrolmentId || !parent.enrolmentIds.includes(child.enrolmentId)) {
    throw ApiError.forbidden("You do not have access to this child");
  }

  const { medicalConditions, allergies, medications, immunisationStatus, dietary, actionPlanUrl } =
    parsed.data;

  // Merge into existing medical JSON
  const existingMedical = (child.medical as Record<string, unknown>) ?? {};
  const updatedMedical = { ...existingMedical };
  if (medicalConditions !== undefined) updatedMedical.conditions = medicalConditions;
  if (allergies !== undefined) updatedMedical.allergies = allergies;
  if (medications !== undefined) updatedMedical.medications = medications;
  if (immunisationStatus !== undefined) updatedMedical.immunisationStatus = immunisationStatus;
  if (actionPlanUrl !== undefined) updatedMedical.actionPlanUrl = actionPlanUrl;

  // Merge dietary
  const existingDietary = (child.dietary as Record<string, unknown>) ?? {};
  const updatedDietary = dietary ? { ...existingDietary, ...dietary } : existingDietary;

  const updated = await prisma.child.update({
    where: { id: childId },
    data: {
      medical: updatedMedical,
      dietary: updatedDietary,
    },
    select: {
      id: true,
      firstName: true,
      surname: true,
      medical: true,
      dietary: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(updated);
});
```

- [ ] **Step 2: Verify no type errors**

Run: `npx tsc --noEmit 2>&1 | grep "children/\[childId\]"`
Expected: No output

- [ ] **Step 3: Commit**

```bash
git add src/app/api/parent/children/\[childId\]/route.ts
git commit -m "feat(parent): add PATCH /api/parent/children/[childId] for medical updates"
```

---

## Chunk 2: Bookings UI (Prompt 3)

### Task 5: Create RequestBookingDialog component

**Files:**
- Create: `src/components/parent/RequestBookingDialog.tsx`

- [ ] **Step 1: Create the dialog component**

```tsx
"use client";

import { useState } from "react";
import { Calendar, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/Dialog";
import {
  useParentChildren,
  useRequestBooking,
  type ParentChild,
} from "@/hooks/useParentPortal";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SESSION_OPTIONS = [
  { value: "bsc" as const, label: "BSC", fullLabel: "Before School Care" },
  { value: "asc" as const, label: "ASC", fullLabel: "After School Care" },
  { value: "vc" as const, label: "VC", fullLabel: "Vacation Care" },
];

export function RequestBookingDialog({ open, onOpenChange }: Props) {
  const { data: children } = useParentChildren();
  const requestBooking = useRequestBooking();

  const [selectedChild, setSelectedChild] = useState<ParentChild | null>(null);
  const [date, setDate] = useState("");
  const [sessionType, setSessionType] = useState<"bsc" | "asc" | "vc" | "">("");

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split("T")[0];

  const resetForm = () => {
    setSelectedChild(null);
    setDate("");
    setSessionType("");
  };

  const handleSubmit = () => {
    if (!selectedChild || !date || !sessionType) return;

    requestBooking.mutate(
      {
        childId: selectedChild.id,
        serviceId: selectedChild.serviceId,
        date,
        sessionType,
      },
      {
        onSuccess: () => {
          resetForm();
          onOpenChange(false);
        },
      }
    );
  };

  const isValid = selectedChild && date && sessionType;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Request Casual Booking</DialogTitle>
        <DialogDescription>
          Select a child, date, and session type for the booking.
        </DialogDescription>

        <div className="space-y-5 mt-4">
          {/* Child selector */}
          <div>
            <label className="block text-xs font-medium text-[#1a1a2e]/70 mb-2">
              Child
            </label>
            <div className="space-y-2">
              {(children ?? []).map((child) => (
                <button
                  key={child.id}
                  type="button"
                  onClick={() => setSelectedChild(child)}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-all min-h-[44px]",
                    selectedChild?.id === child.id
                      ? "border-[#004E64] bg-[#004E64]/5"
                      : "border-[#e8e4df] hover:border-[#004E64]/30"
                  )}
                >
                  <div className="w-8 h-8 rounded-full bg-[#004E64]/10 flex items-center justify-center text-xs font-bold text-[#004E64]">
                    {child.firstName[0]}
                    {child.lastName[0]}
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-[#1a1a2e]">
                      {child.firstName} {child.lastName}
                    </p>
                    <p className="text-xs text-[#7c7c8a]">{child.serviceName}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Date picker */}
          <div>
            <label className="block text-xs font-medium text-[#1a1a2e]/70 mb-1">
              Date
            </label>
            <input
              type="date"
              value={date}
              min={minDate}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2.5 border-2 border-[#e8e4df] rounded-lg bg-[#FAF8F5]/50 text-sm text-[#1a1a2e] focus:outline-none focus:border-[#004E64] transition-colors min-h-[44px]"
            />
          </div>

          {/* Session type */}
          <div>
            <label className="block text-xs font-medium text-[#1a1a2e]/70 mb-2">
              Session Type
            </label>
            <div className="grid grid-cols-3 gap-2">
              {SESSION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSessionType(opt.value)}
                  className={cn(
                    "py-2.5 px-3 rounded-lg border-2 text-sm font-medium transition-all min-h-[44px]",
                    sessionType === opt.value
                      ? "border-[#004E64] bg-[#004E64] text-white"
                      : "border-[#e8e4df] text-[#1a1a2e] hover:border-[#004E64]/30"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!isValid || requestBooking.isPending}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-[#004E64] hover:bg-[#003D52] text-white text-base font-semibold rounded-xl shadow-lg transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px]"
          >
            {requestBooking.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Calendar className="w-4 h-4" />
                Request Booking
              </>
            )}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/parent/RequestBookingDialog.tsx
git commit -m "feat(parent): add RequestBookingDialog component"
```

---

### Task 6: Build bookings page

**Files:**
- Modify: `src/app/parent/bookings/page.tsx` (replace existing coming-soon placeholder)

- [ ] **Step 1: Read the existing file to confirm it's the placeholder**

The existing file is a "coming soon" placeholder. Replace it entirely.

- [ ] **Step 2: Write the bookings page**

```tsx
"use client";

import { useState } from "react";
import { Calendar, Plus, Clock, AlertTriangle } from "lucide-react";
import {
  useParentBookings,
  useMarkAbsent,
  type BookingRecord,
} from "@/hooks/useParentPortal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { RequestBookingDialog } from "@/components/parent/RequestBookingDialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  requested: { bg: "bg-amber-100", text: "text-amber-700", label: "Requested" },
  confirmed: { bg: "bg-green-100", text: "text-green-700", label: "Confirmed" },
  waitlisted: { bg: "bg-blue-100", text: "text-blue-700", label: "Waitlisted" },
  cancelled: { bg: "bg-gray-100", text: "text-gray-500", label: "Cancelled" },
  absent: { bg: "bg-red-100", text: "text-red-600", label: "Absent" },
};

const SESSION_STYLES: Record<string, { bg: string; text: string }> = {
  bsc: { bg: "bg-[#004E64]/10", text: "text-[#004E64]" },
  asc: { bg: "bg-amber-100", text: "text-amber-700" },
  vc: { bg: "bg-purple-100", text: "text-purple-700" },
};

export default function BookingsPage() {
  const { data, isLoading } = useParentBookings();
  const markAbsent = useMarkAbsent();

  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const [absentBooking, setAbsentBooking] = useState<BookingRecord | null>(null);

  const handleMarkAbsent = (isIllness: boolean) => {
    if (!absentBooking) return;
    markAbsent.mutate(
      { bookingId: absentBooking.id, isIllness },
      { onSuccess: () => setAbsentBooking(null) }
    );
  };

  if (isLoading) return <BookingsSkeleton />;

  const bookings = data?.bookings ?? [];

  // Group bookings by date
  const grouped = groupByDate(bookings);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-[#1a1a2e]">
            Bookings
          </h1>
          <p className="text-sm text-[#7c7c8a] mt-1">
            View and manage your children&apos;s sessions.
          </p>
        </div>
        <button
          onClick={() => setShowRequestDialog(true)}
          className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 bg-[#004E64] hover:bg-[#003D52] text-white text-sm font-semibold rounded-xl transition-all duration-200 active:scale-[0.98] min-h-[44px]"
        >
          <Plus className="w-4 h-4" />
          Request Booking
        </button>
      </div>

      {/* Mobile CTA */}
      <button
        onClick={() => setShowRequestDialog(true)}
        className="sm:hidden w-full flex items-center justify-center gap-2 py-3 px-4 bg-[#004E64] hover:bg-[#003D52] text-white text-base font-semibold rounded-xl shadow-lg transition-all duration-200 active:scale-[0.98] min-h-[48px]"
      >
        <Plus className="w-4 h-4" />
        Request Casual Booking
      </button>

      {/* Bookings list */}
      {bookings.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center shadow-sm border border-[#e8e4df]">
          <div className="w-12 h-12 rounded-full bg-[#FECE00]/20 flex items-center justify-center mx-auto mb-3">
            <Calendar className="w-6 h-6 text-[#004E64]" />
          </div>
          <h2 className="text-base font-heading font-semibold text-[#1a1a2e] mb-1">
            No upcoming bookings
          </h2>
          <p className="text-sm text-[#7c7c8a]">
            Tap &ldquo;Request Booking&rdquo; to book a casual session.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ dateLabel, items }) => (
            <div key={dateLabel}>
              <h2 className="text-xs font-semibold text-[#7c7c8a] uppercase tracking-wider mb-2">
                {dateLabel}
              </h2>
              <div className="space-y-2">
                {items.map((booking) => {
                  const status = STATUS_STYLES[booking.status] ?? STATUS_STYLES.requested;
                  const session = SESSION_STYLES[booking.sessionType] ?? SESSION_STYLES.bsc;
                  const canMarkAbsent =
                    booking.status === "confirmed" || booking.status === "requested";

                  return (
                    <div
                      key={booking.id}
                      className="bg-white rounded-xl p-4 shadow-sm border border-[#e8e4df]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-[#004E64]/10 flex items-center justify-center text-xs font-bold text-[#004E64] shrink-0">
                            {booking.child.firstName[0]}
                            {booking.child.surname[0]}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[#1a1a2e] truncate">
                              {booking.child.firstName} {booking.child.surname}
                            </p>
                            <p className="text-xs text-[#7c7c8a] truncate">
                              {booking.service.name}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={cn(
                              "inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase",
                              session.bg,
                              session.text
                            )}
                          >
                            {booking.sessionType.toUpperCase()}
                          </span>
                          <span
                            className={cn(
                              "inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold",
                              status.bg,
                              status.text
                            )}
                          >
                            {status.label}
                          </span>
                        </div>
                      </div>

                      {/* Fee row */}
                      {booking.fee != null && (
                        <div className="flex items-center gap-4 mt-2 ml-12 text-xs text-[#7c7c8a]">
                          <span>Fee: ${booking.fee.toFixed(2)}</span>
                          {booking.ccsApplied != null && booking.ccsApplied > 0 && (
                            <span className="text-green-600">
                              CCS: -${booking.ccsApplied.toFixed(2)}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Mark absent action */}
                      {canMarkAbsent && (
                        <div className="mt-3 ml-12">
                          <button
                            onClick={() => setAbsentBooking(booking)}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-red-500 hover:text-red-700 transition-colors min-h-[44px]"
                          >
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Mark Absent
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Request Booking Dialog */}
      <RequestBookingDialog
        open={showRequestDialog}
        onOpenChange={setShowRequestDialog}
      />

      {/* Mark Absent Confirm Dialog */}
      {absentBooking && (
        <ConfirmDialog
          open={!!absentBooking}
          onOpenChange={(open) => !open && setAbsentBooking(null)}
          title="Mark as Absent"
          description={`Is ${absentBooking.child.firstName}'s absence due to illness?`}
          confirmLabel="Yes, Illness"
          cancelLabel="No, Other Reason"
          onConfirm={() => handleMarkAbsent(true)}
          onCancel={() => handleMarkAbsent(false)}
          loading={markAbsent.isPending}
        />
      )}
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────

function groupByDate(bookings: BookingRecord[]) {
  const map = new Map<string, BookingRecord[]>();
  for (const b of bookings) {
    const key = b.date;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(b);
  }

  const formatter = new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return Array.from(map.entries()).map(([dateStr, items]) => ({
    dateLabel: formatter.format(new Date(dateStr)),
    items,
  }));
}

// ── Skeleton ────────────────────────────────────────────

function BookingsSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <Skeleton className="h-8 w-32 mb-2" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-10 w-40 rounded-xl hidden sm:block" />
      </div>
      <Skeleton className="h-12 w-full rounded-xl sm:hidden" />
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-24 w-full rounded-xl" />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Verify no type errors**

Run: `npx tsc --noEmit 2>&1 | grep "bookings/page"`
Expected: No output

- [ ] **Step 4: Commit**

```bash
git add src/app/parent/bookings/page.tsx src/components/parent/RequestBookingDialog.tsx
git commit -m "feat(parent): build bookings page with request dialog and mark absent"
```

---

## Chunk 3: Billing UI (Prompt 4) & Nav Update

### Task 7: Add Billing nav item to layout

**Files:**
- Modify: `src/app/parent/layout.tsx`

- [ ] **Step 1: Add DollarSign import and nav item**

In the import line, add `DollarSign`:
```ts
import { Home, Users, Calendar, DollarSign, Settings, LogOut } from "lucide-react";
```

Add to `NAV_ITEMS` array between Bookings and Account:
```ts
const NAV_ITEMS = [
  { href: "/parent", label: "Home", icon: Home },
  { href: "/parent/children", label: "Children", icon: Users },
  { href: "/parent/bookings", label: "Bookings", icon: Calendar },
  { href: "/parent/billing", label: "Billing", icon: DollarSign },
  { href: "/parent/account", label: "Account", icon: Settings },
] as const;
```

- [ ] **Step 2: Commit**

```bash
git add src/app/parent/layout.tsx
git commit -m "feat(parent): add Billing nav item to layout"
```

---

### Task 8: Build billing page

**Files:**
- Create: `src/app/parent/billing/page.tsx`

- [ ] **Step 1: Create the billing page**

```tsx
"use client";

import { CreditCard, Download, FileText, AlertCircle } from "lucide-react";
import { useParentStatements, type StatementRecord } from "@/hooks/useParentPortal";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  paid: { bg: "bg-green-100", text: "text-green-700", label: "Paid" },
  unpaid: { bg: "bg-amber-100", text: "text-amber-700", label: "Unpaid" },
  overdue: { bg: "bg-red-100", text: "text-red-600", label: "Overdue" },
};

export default function BillingPage() {
  const { data, isLoading } = useParentStatements();

  if (isLoading) return <BillingSkeleton />;

  const statements = data?.statements ?? [];
  const summary = data?.summary ?? { currentBalance: 0, overdueCount: 0 };

  const nextDebitDate = getNextDebitDate();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-heading font-bold text-[#1a1a2e]">
          Billing
        </h1>
        <p className="text-sm text-[#7c7c8a] mt-1">
          View your balance and download statements.
        </p>
      </div>

      {/* Balance summary */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-[#e8e4df]">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-[#7c7c8a] uppercase tracking-wider">
              Current Balance
            </p>
            <p
              className={cn(
                "text-3xl font-heading font-bold mt-1",
                summary.currentBalance === 0
                  ? "text-green-600"
                  : "text-red-600"
              )}
            >
              ${summary.currentBalance.toFixed(2)}
            </p>
          </div>
          {summary.overdueCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-100 text-red-600 text-xs font-semibold">
              <AlertCircle className="w-3 h-3" />
              {summary.overdueCount} overdue
            </span>
          )}
        </div>
        <div className="mt-3 pt-3 border-t border-[#e8e4df]">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#7c7c8a]">Next Direct Debit</span>
            <span className="text-sm font-medium text-[#1a1a2e]">
              {nextDebitDate}
            </span>
          </div>
        </div>
      </div>

      {/* Statements */}
      <section>
        <h2 className="text-sm font-heading font-semibold text-[#7c7c8a] uppercase tracking-wider mb-3">
          Statements
        </h2>

        {statements.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center shadow-sm border border-[#e8e4df]">
            <div className="w-12 h-12 rounded-full bg-[#FECE00]/20 flex items-center justify-center mx-auto mb-3">
              <FileText className="w-6 h-6 text-[#004E64]" />
            </div>
            <h3 className="text-base font-heading font-semibold text-[#1a1a2e] mb-1">
              No statements yet
            </h3>
            <p className="text-sm text-[#7c7c8a]">
              Statements will appear here once generated.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {statements.map((stmt) => (
              <StatementCard key={stmt.id} statement={stmt} />
            ))}
          </div>
        )}
      </section>

      {/* Payment Methods (mock) */}
      <section>
        <h2 className="text-sm font-heading font-semibold text-[#7c7c8a] uppercase tracking-wider mb-3">
          Payment Method
        </h2>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-[#e8e4df]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#004E64]/10 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-[#004E64]" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-[#1a1a2e]">
                Visa ending in 4242
              </p>
              <p className="text-xs text-[#7c7c8a]">Expires 12/27</p>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-[#e8e4df]">
            <p className="text-xs text-[#7c7c8a]">
              To update your payment method, please contact the centre.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

// ── Statement Card ──────────────────────────────────────

function StatementCard({ statement }: { statement: StatementRecord }) {
  const status = STATUS_STYLES[statement.status] ?? STATUS_STYLES.unpaid;

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
  };

  const periodLabel = `${formatDate(statement.periodStart)} – ${formatDate(statement.periodEnd)}`;

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-[#e8e4df]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#1a1a2e]">{periodLabel}</p>
          <p className="text-xs text-[#7c7c8a] mt-0.5">
            {statement.service.name}
          </p>
        </div>
        <span
          className={cn(
            "inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0",
            status.bg,
            status.text
          )}
        >
          {status.label}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3 text-center">
        <div>
          <p className="text-[10px] text-[#7c7c8a] uppercase">Fees</p>
          <p className="text-sm font-semibold text-[#1a1a2e]">
            ${statement.totalFees.toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-[#7c7c8a] uppercase">CCS</p>
          <p className="text-sm font-semibold text-green-600">
            -${statement.totalCcs.toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-[#7c7c8a] uppercase">Gap</p>
          <p className="text-sm font-semibold text-[#1a1a2e]">
            ${statement.gapFee.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Download PDF */}
      <div className="mt-3 pt-3 border-t border-[#e8e4df]">
        {statement.pdfUrl ? (
          <a
            href={statement.pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#004E64] hover:text-[#0A7E9E] transition-colors min-h-[44px]"
          >
            <Download className="w-3.5 h-3.5" />
            Download PDF
          </a>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-[#7c7c8a] min-h-[44px]">
            <Download className="w-3.5 h-3.5" />
            PDF not yet available
          </span>
        )}
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────

function getNextDebitDate(): string {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return next.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// ── Skeleton ────────────────────────────────────────────

function BillingSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-24 mb-2" />
        <Skeleton className="h-4 w-56" />
      </div>
      <Skeleton className="h-36 w-full rounded-xl" />
      <div>
        <Skeleton className="h-4 w-28 mb-3" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 w-full rounded-xl mb-2" />
        ))}
      </div>
      <div>
        <Skeleton className="h-4 w-36 mb-3" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/parent/billing/page.tsx
git commit -m "feat(parent): build billing page with balance summary and statements"
```

---

## Chunk 4: Child Medical Editing (Prompt 5)

### Task 9: Add edit dialog to child detail Medical tab

**Files:**
- Modify: `src/app/parent/children/[id]/page.tsx`

- [ ] **Step 1: Add imports**

Add to the existing import block:

```ts
import { Pencil, Loader2, Upload, CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/Dialog";
import { useUpdateChildMedical, type UpdateChildMedicalPayload } from "@/hooks/useParentPortal";
import { toast } from "@/hooks/useToast";
```

- [ ] **Step 2: Create EditMedicalDialog component**

Add this component before the `DetailSkeleton` function at the bottom of the file:

```tsx
// ── Edit Medical Dialog ─────────────────────────────────

function EditMedicalDialog({
  child,
  open,
  onOpenChange,
}: {
  child: ParentChild;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const updateMedical = useUpdateChildMedical();

  const [conditions, setConditions] = useState(child.medicalConditions.join(", "));
  const [allergies, setAllergies] = useState(child.allergies.join(", "));
  const [medications, setMedications] = useState(child.medications.join(", "));
  const [immunisation, setImmunisation] = useState(child.immunisationStatus ?? "");
  const [dietaryNotes, setDietaryNotes] = useState("");
  const [actionPlanUploaded, setActionPlanUploaded] = useState(false);

  const splitToArray = (s: string) =>
    s
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);

  const handleSave = () => {
    const payload: UpdateChildMedicalPayload = {
      medicalConditions: splitToArray(conditions),
      allergies: splitToArray(allergies),
      medications: splitToArray(medications),
      immunisationStatus: immunisation || undefined,
      dietary: dietaryNotes ? { notes: dietaryNotes } : undefined,
      actionPlanUrl: actionPlanUploaded
        ? `/uploads/action-plan-${child.id}.pdf`
        : undefined,
    };

    updateMedical.mutate(
      { childId: child.id, payload },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Edit Medical Details</DialogTitle>
        <DialogDescription>
          Update {child.firstName}&apos;s medical and dietary information.
        </DialogDescription>

        <div className="space-y-4 mt-4">
          <MedicalFormField
            label="Medical Conditions"
            value={conditions}
            onChange={setConditions}
            placeholder="e.g. Asthma, Eczema (comma-separated)"
          />
          <MedicalFormField
            label="Allergies"
            value={allergies}
            onChange={setAllergies}
            placeholder="e.g. Peanuts, Penicillin (comma-separated)"
          />
          <MedicalFormField
            label="Medications"
            value={medications}
            onChange={setMedications}
            placeholder="e.g. Ventolin, EpiPen (comma-separated)"
          />
          <MedicalFormField
            label="Immunisation Status"
            value={immunisation}
            onChange={setImmunisation}
            placeholder="e.g. Up to date"
          />
          <div>
            <label className="block text-xs font-medium text-[#1a1a2e]/70 mb-1">
              Dietary Notes
            </label>
            <textarea
              value={dietaryNotes}
              onChange={(e) => setDietaryNotes(e.target.value)}
              placeholder="Any dietary requirements or notes..."
              maxLength={500}
              rows={3}
              className="w-full px-3 py-2.5 border-2 border-[#e8e4df] rounded-lg bg-[#FAF8F5]/50 text-sm text-[#1a1a2e] placeholder-[#7c7c8a]/60 focus:outline-none focus:border-[#004E64] transition-colors resize-none"
            />
          </div>

          {/* Mock action plan upload */}
          <div>
            <label className="block text-xs font-medium text-[#1a1a2e]/70 mb-1">
              Action Plan (Asthma/Anaphylaxis)
            </label>
            {actionPlanUploaded ? (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">
                <CheckCircle2 className="w-4 h-4" />
                Action plan uploaded
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setActionPlanUploaded(true);
                  toast({ description: "Action plan uploaded (simulated)" });
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 border-dashed border-[#e8e4df] hover:border-[#004E64]/30 text-sm text-[#7c7c8a] hover:text-[#004E64] transition-colors w-full justify-center min-h-[44px]"
              >
                <Upload className="w-4 h-4" />
                Upload Action Plan
              </button>
            )}
          </div>

          <button
            onClick={handleSave}
            disabled={updateMedical.isPending}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-[#004E64] hover:bg-[#003D52] text-white text-base font-semibold rounded-xl shadow-lg transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px]"
          >
            {updateMedical.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MedicalFormField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-[#1a1a2e]/70 mb-1">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 border-2 border-[#e8e4df] rounded-lg bg-[#FAF8F5]/50 text-sm text-[#1a1a2e] placeholder-[#7c7c8a]/60 focus:outline-none focus:border-[#004E64] transition-colors min-h-[44px]"
      />
    </div>
  );
}
```

- [ ] **Step 3: Update the MedicalTab to include the edit button and dialog**

Replace the existing `MedicalTab` function with:

```tsx
function MedicalTab({ child }: { child: ParentChild }) {
  const [editOpen, setEditOpen] = useState(false);

  const hasAny =
    child.medicalConditions.length > 0 ||
    child.allergies.length > 0 ||
    child.medications.length > 0 ||
    child.immunisationStatus;

  return (
    <div className="space-y-3">
      {/* Edit button */}
      <div className="flex justify-end">
        <button
          onClick={() => setEditOpen(true)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#004E64] hover:text-[#0A7E9E] transition-colors min-h-[44px]"
        >
          <Pencil className="w-3.5 h-3.5" />
          Edit Details
        </button>
      </div>

      {!hasAny ? (
        <div className="bg-white rounded-xl p-6 text-center shadow-sm border border-[#e8e4df]">
          <Stethoscope className="w-8 h-8 text-[#7c7c8a] mx-auto mb-2" />
          <p className="text-[#7c7c8a] text-sm">
            No medical information on file. Tap &ldquo;Edit Details&rdquo; to add.
          </p>
        </div>
      ) : (
        <>
          {child.medicalConditions.length > 0 && (
            <InfoCard
              icon={AlertTriangle}
              iconColor="text-amber-600"
              title="Medical Conditions"
              items={child.medicalConditions}
            />
          )}
          {child.allergies.length > 0 && (
            <InfoCard
              icon={AlertTriangle}
              iconColor="text-red-500"
              title="Allergies"
              items={child.allergies}
            />
          )}
          {child.medications.length > 0 && (
            <InfoCard
              icon={Pill}
              iconColor="text-blue-500"
              title="Medications"
              items={child.medications}
            />
          )}
          {child.immunisationStatus && (
            <div className="bg-white rounded-xl p-4 shadow-sm border border-[#e8e4df]">
              <div className="flex items-center gap-2 mb-1">
                <ShieldCheck className="w-4 h-4 text-green-600" />
                <h3 className="text-sm font-heading font-semibold text-[#1a1a2e]">
                  Immunisation Status
                </h3>
              </div>
              <p className="text-sm text-[#7c7c8a] ml-6">
                {child.immunisationStatus}
              </p>
            </div>
          )}
        </>
      )}

      <EditMedicalDialog
        child={child}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </div>
  );
}
```

Note: The `useState` import already exists at the top. Add `Pencil, Loader2, Upload, CheckCircle2` to the lucide-react import line, and add the Dialog + hook imports.

- [ ] **Step 4: Verify no type errors**

Run: `npx tsc --noEmit 2>&1 | grep "children/\[id\]"`
Expected: No output

- [ ] **Step 5: Commit**

```bash
git add src/app/parent/children/\[id\]/page.tsx
git commit -m "feat(parent): add medical edit dialog to child detail page"
```

---

## Chunk 5: Sibling Enrolment (Prompt 6)

### Task 10: Extend EnrolmentWizard with portal props

**Files:**
- Modify: `src/components/enrol/EnrolmentWizard.tsx`
- Modify: `src/components/enrol/steps/ParentDetailsStep.tsx`

- [ ] **Step 1: Update EnrolmentWizard props interface**

Replace the existing `EnrolmentWizardProps` interface:

```ts
interface EnrolmentWizardProps {
  prefillToken?: string;
  /** Pre-fill and lock primary parent fields (portal sibling enrolment) */
  parentPrefill?: import("./types").ParentDetails;
  /** Step indices to skip (e.g. [1] to skip Parent step) */
  skipSteps?: number[];
  /** Called on successful submission instead of showing the success screen */
  onComplete?: (result: { token: string; childNames: string }) => void;
  /** Visual variant: "standalone" = dark bg (default), "portal" = white/cream bg */
  variant?: "standalone" | "portal";
}
```

- [ ] **Step 2: Integrate new props into wizard logic**

In the `EnrolmentWizard` component body, destructure the new props:

```ts
export function EnrolmentWizard({
  prefillToken,
  parentPrefill,
  skipSteps = [],
  onComplete,
  variant = "standalone",
}: EnrolmentWizardProps) {
```

After the `loaded` state setup, add parent prefill injection:

```ts
// Inject parentPrefill into form data on mount
useEffect(() => {
  if (parentPrefill && loaded) {
    setData((prev) => ({
      ...prev,
      primaryParent: { ...prev.primaryParent, ...parentPrefill },
    }));
  }
}, [parentPrefill, loaded]);
```

Update `handleNext` to skip steps:

```ts
const handleNext = () => {
  const errors = validateStep(step, data);
  if (errors.length > 0) {
    setValidationErrors(errors);
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  setValidationErrors([]);
  let nextStep = step + 1;
  while (nextStep < STEPS.length && skipSteps.includes(nextStep)) {
    nextStep++;
  }
  setStep(Math.min(STEPS.length - 1, nextStep));
  window.scrollTo({ top: 0, behavior: "smooth" });
};
```

Similarly update the "Back" button handler to skip steps backwards. Find the existing back handler (likely `setStep((s) => Math.max(0, s - 1))`) and replace:

```ts
const handleBack = () => {
  let prevStep = step - 1;
  while (prevStep >= 0 && skipSteps.includes(prevStep)) {
    prevStep--;
  }
  setStep(Math.max(0, prevStep));
  window.scrollTo({ top: 0, behavior: "smooth" });
};
```

Update `handleSubmit` to call `onComplete` if provided (in the success path, after `setSubmitted(true)`):

```ts
if (onComplete) {
  onComplete({ token: result.token, childNames: result.childNames });
  return;
}
setSubmitResult({ ... });
setSubmitted(true);
```

- [ ] **Step 3: Adjust step display to account for skipped steps**

Where the progress bar renders step numbers, compute visible steps:

```ts
const visibleSteps = STEPS.filter((_, i) => !skipSteps.includes(i));
const visibleStepIndex = visibleSteps.findIndex(
  (_, vi) => {
    let actual = 0;
    let visible = 0;
    while (visible < vi) {
      if (!skipSteps.includes(actual)) visible++;
      actual++;
    }
    // Find the actual index for this visible index
    let count = 0;
    for (let i = 0; i < STEPS.length; i++) {
      if (!skipSteps.includes(i)) {
        if (count === vi) return i === step;
        count++;
      }
    }
    return false;
  }
);
```

A simpler approach: just calculate the visible index directly:

```ts
const visibleStepCount = STEPS.length - skipSteps.length;
const currentVisibleIndex = STEPS.slice(0, step + 1).filter((_, i) => !skipSteps.includes(i)).length;
```

Use `currentVisibleIndex` and `visibleStepCount` in the progress bar display instead of `step + 1` and `STEPS.length`.

- [ ] **Step 4: Add readOnly prop to ParentDetailsStep**

In `src/components/enrol/steps/ParentDetailsStep.tsx`, add a `readOnly` prop to the `Props` interface:

```ts
interface Props {
  data: EnrolmentFormData;
  updateData: (d: Partial<EnrolmentFormData>) => void;
  readOnly?: boolean;
}
```

In the component, when `readOnly` is true, add `disabled` and styling to all `Input` components for the primary parent section. This step is optional since we're skipping step 1 entirely — but it's a safety net.

- [ ] **Step 5: Commit**

```bash
git add src/components/enrol/EnrolmentWizard.tsx src/components/enrol/steps/ParentDetailsStep.tsx
git commit -m "feat(enrol): extend wizard with parentPrefill, skipSteps, onComplete, variant props"
```

---

### Task 11: Create sibling enrolment page

**Files:**
- Create: `src/app/parent/children/new/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParentProfile } from "@/hooks/useParentPortal";
import { EnrolmentWizard } from "@/components/enrol/EnrolmentWizard";
import { Skeleton } from "@/components/ui/Skeleton";
import { toast } from "@/hooks/useToast";
import type { ParentDetails } from "@/components/enrol/types";

export default function NewChildPage() {
  const router = useRouter();
  const { data: profile, isLoading } = useParentProfile();

  if (isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-8 w-64 mb-2" />
        <Skeleton className="h-[400px] w-full rounded-xl" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="space-y-4">
        <Link
          href="/parent/children"
          className="inline-flex items-center gap-1 text-sm text-[#004E64] hover:text-[#0A7E9E] font-medium transition-colors min-h-[44px]"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to children
        </Link>
        <div className="bg-white rounded-xl p-8 text-center shadow-sm border border-[#e8e4df]">
          <p className="text-[#7c7c8a] text-sm">
            Unable to load your profile. Please try again.
          </p>
        </div>
      </div>
    );
  }

  // Map profile to ParentDetails shape for prefill
  const parentPrefill: ParentDetails = {
    firstName: profile.firstName,
    surname: profile.lastName,
    dob: "",
    email: profile.email,
    mobile: profile.phone ?? "",
    street: profile.address?.street ?? "",
    suburb: profile.address?.suburb ?? "",
    state: profile.address?.state ?? "",
    postcode: profile.address?.postcode ?? "",
    relationship: "",
    occupation: "",
    workplace: "",
    workPhone: "",
    crn: "",
    soleCustody: null,
  };

  const handleComplete = (result: { token: string; childNames: string }) => {
    toast({
      description: `Enrolment submitted for ${result.childNames}!`,
    });
    router.push("/parent/children");
  };

  return (
    <div className="space-y-5">
      <Link
        href="/parent/children"
        className="inline-flex items-center gap-1 text-sm text-[#004E64] hover:text-[#0A7E9E] font-medium transition-colors min-h-[44px]"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to children
      </Link>

      <div>
        <h1 className="text-2xl font-heading font-bold text-[#1a1a2e]">
          Enrol a Sibling
        </h1>
        <p className="text-sm text-[#7c7c8a] mt-1">
          Your details are pre-filled. Just add the new child&apos;s information.
        </p>
      </div>

      <EnrolmentWizard
        parentPrefill={parentPrefill}
        skipSteps={[1]}
        onComplete={handleComplete}
        variant="portal"
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify no type errors**

Run: `npx tsc --noEmit 2>&1 | grep "children/new"`
Expected: No output

- [ ] **Step 3: Commit**

```bash
git add src/app/parent/children/new/page.tsx
git commit -m "feat(parent): add sibling enrolment page at /parent/children/new"
```

---

## Chunk 6: Final Verification

### Task 12: Full build check and type verification

- [ ] **Step 1: Run full type check**

Run: `npx tsc --noEmit`
Expected: Only pre-existing Next.js type warnings (no errors from our files)

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Run existing tests**

Run: `npm test`
Expected: All 700+ existing tests still pass

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address build/type issues from parent portal expansion"
```
