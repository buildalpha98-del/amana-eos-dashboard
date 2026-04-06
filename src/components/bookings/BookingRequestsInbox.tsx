"use client";

import { useState } from "react";
import {
  CheckCircle2,
  XCircle,
  Clock,
  CalendarDays,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/layout/PageHeader";
import { ServiceFilter } from "@/components/marketing/ServiceFilter";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/Dialog";
import {
  useAllBookingRequests,
  useApproveBooking,
  useDeclineBooking,
  type BookingRequest,
} from "@/hooks/useBookingRequests";

// ── Helpers ────────────────────────────────────────────────

const SESSION_LABELS: Record<string, string> = {
  bsc: "Before School Care",
  asc: "After School Care",
  vc: "Vacation Care",
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Australia/Sydney",
  });
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function childAge(dob: string | null): string | null {
  if (!dob) return null;
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return `${age}y`;
}

// ── Session Type Filter ────────────────────────────────────

const SESSION_TYPES = [
  { label: "All", value: "" },
  { label: "BSC", value: "bsc" },
  { label: "ASC", value: "asc" },
  { label: "VAC", value: "vc" },
];

// ── Main Component ─────────────────────────────────────────

export function BookingRequestsInbox() {
  const [serviceId, setServiceId] = useState("");
  const [sessionFilter, setSessionFilter] = useState("");
  const [page, setPage] = useState(1);
  const [declineTarget, setDeclineTarget] = useState<BookingRequest | null>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  const { data, isLoading, error } = useAllBookingRequests({
    serviceId: serviceId || undefined,
    status: "requested",
    page,
  });

  const approveMutation = useApproveBooking();
  const declineMutation = useDeclineBooking();

  // Client-side session type filter
  const filtered = data?.bookings?.filter((b) =>
    sessionFilter ? b.sessionType === sessionFilter : true
  ) ?? [];

  const total = data?.total ?? 0;

  function handleApprove(booking: BookingRequest) {
    setProcessingIds((s) => new Set(s).add(booking.id));
    approveMutation.mutate(booking.id, {
      onSettled: () => {
        setProcessingIds((s) => {
          const next = new Set(s);
          next.delete(booking.id);
          return next;
        });
      },
    });
  }

  function handleDeclineConfirm() {
    if (!declineTarget) return;
    setProcessingIds((s) => new Set(s).add(declineTarget.id));
    declineMutation.mutate(
      { bookingId: declineTarget.id, reason: declineReason || undefined },
      {
        onSettled: () => {
          setProcessingIds((s) => {
            const next = new Set(s);
            next.delete(declineTarget!.id);
            return next;
          });
          setDeclineTarget(null);
          setDeclineReason("");
        },
      }
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Booking Requests"
        description="Review and action casual booking requests from parents"
        badge={total > 0 ? String(total) : undefined}
      />

      {/* Filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <ServiceFilter value={serviceId} onChange={(v) => { setServiceId(v); setPage(1); }} />
        <div className="flex gap-1">
          {SESSION_TYPES.map((st) => (
            <button
              key={st.value}
              onClick={() => setSessionFilter(st.value)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium transition-colors min-h-[36px]",
                sessionFilter === st.value
                  ? "bg-[#004E64] text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              )}
            >
              {st.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Failed to load booking requests. Please try again.
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && filtered.length === 0 && (
        <EmptyState
          icon={CheckCircle2}
          title="No pending booking requests"
          description="All booking requests have been actioned. New requests from parents will appear here."
        />
      )}

      {/* Booking request cards */}
      {!isLoading && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((booking) => {
            const isProcessing = processingIds.has(booking.id);
            const parentName = booking.requestedBy
              ? `${booking.requestedBy.firstName || ""} ${booking.requestedBy.lastName || ""}`.trim()
              : null;

            return (
              <div
                key={booking.id}
                className={cn(
                  "rounded-xl border bg-white p-4 shadow-sm transition-opacity",
                  isProcessing && "opacity-50 pointer-events-none"
                )}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  {/* Left: child + booking info */}
                  <div className="flex items-start gap-3 min-w-0">
                    {/* Avatar */}
                    <div className="flex-shrink-0">
                      {booking.child.photo ? (
                        <img
                          src={booking.child.photo}
                          alt=""
                          className="h-10 w-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#004E64]/10 text-[#004E64]">
                          <User className="h-5 w-5" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900">
                          {booking.child.firstName} {booking.child.surname}
                        </span>
                        {booking.child.dob && (
                          <span className="text-xs text-gray-500">
                            {childAge(booking.child.dob)}
                          </span>
                        )}
                        {booking.child.yearLevel && (
                          <span className="text-xs text-gray-400">
                            Year {booking.child.yearLevel}
                          </span>
                        )}
                      </div>

                      <div className="mt-1 flex items-center gap-1.5 text-sm text-gray-600">
                        <CalendarDays className="h-3.5 w-3.5 flex-shrink-0" />
                        <span>
                          {booking.service.name} &mdash;{" "}
                          {SESSION_LABELS[booking.sessionType] || booking.sessionType.toUpperCase()} &mdash;{" "}
                          {formatDate(booking.date)}
                        </span>
                      </div>

                      {parentName && (
                        <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
                          <User className="h-3 w-3 flex-shrink-0" />
                          <span>
                            Requested by {parentName}
                            {booking.requestedBy?.email && (
                              <span className="ml-1 text-gray-400">
                                ({booking.requestedBy.email})
                              </span>
                            )}
                          </span>
                        </div>
                      )}

                      <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-400">
                        <Clock className="h-3 w-3 flex-shrink-0" />
                        <span>{relativeTime(booking.createdAt)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: action buttons */}
                  <div className="flex items-center gap-2 sm:flex-shrink-0">
                    <Button
                      size="sm"
                      onClick={() => handleApprove(booking)}
                      disabled={isProcessing}
                      className="min-h-[44px] min-w-[44px] bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="hidden sm:inline">Approve</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setDeclineTarget(booking); setDeclineReason(""); }}
                      disabled={isProcessing}
                      className="min-h-[44px] min-w-[44px] border-red-300 text-red-600 hover:bg-red-50 gap-1.5"
                    >
                      <XCircle className="h-4 w-4" />
                      <span className="hidden sm:inline">Decline</span>
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="min-h-[44px]"
          >
            Previous
          </Button>
          <span className="text-sm text-gray-500">
            Page {page} of {data.totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
            disabled={page >= data.totalPages}
            className="min-h-[44px]"
          >
            Next
          </Button>
        </div>
      )}

      {/* Decline dialog */}
      <Dialog
        open={!!declineTarget}
        onOpenChange={(open) => { if (!open) { setDeclineTarget(null); setDeclineReason(""); } }}
      >
        <DialogContent className="max-w-md">
          <DialogTitle>Decline Booking</DialogTitle>
          {declineTarget && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Decline the booking for{" "}
                <strong>
                  {declineTarget.child.firstName} {declineTarget.child.surname}
                </strong>{" "}
                on {formatDate(declineTarget.date)}?
              </p>
              <div>
                <label
                  htmlFor="decline-reason"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Reason (optional)
                </label>
                <textarea
                  id="decline-reason"
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  placeholder="e.g. Session is at capacity"
                  rows={3}
                  maxLength={500}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64]"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => { setDeclineTarget(null); setDeclineReason(""); }}
                  className="min-h-[44px]"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleDeclineConfirm}
                  disabled={declineMutation.isPending}
                  className="min-h-[44px] bg-red-600 hover:bg-red-700 text-white"
                >
                  {declineMutation.isPending ? "Declining..." : "Decline Booking"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
