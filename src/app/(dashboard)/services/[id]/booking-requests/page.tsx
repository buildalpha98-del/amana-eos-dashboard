"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { CalendarCheck, CalendarX, Inbox } from "lucide-react";
import { useBookingRequests, useUpdateBookingStatus } from "@/hooks/useBookingRequests";
import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Button } from "@/components/ui/Button";

const SESSION_LABELS: Record<string, string> = {
  bsc: "Before School Care",
  asc: "After School Care",
  vc: "Vacation Care",
};

export default function BookingRequestsPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useBookingRequests(id);
  const updateStatus = useUpdateBookingStatus(id);
  // Track which booking is currently being mutated for per-row loading state
  const [activeBookingId, setActiveBookingId] = useState<string | null>(null);

  if (error) return <ErrorState error={error} />;

  const bookings = data?.items ?? [];

  function handleStatusChange(bookingId: string, status: "confirmed" | "cancelled") {
    setActiveBookingId(bookingId);
    updateStatus.mutate(
      { bookingId, status },
      { onSettled: () => setActiveBookingId(null) },
    );
  }

  return (
    <div>
      <PageHeader
        title="Booking Requests"
        description="Review and manage parent booking requests"
      />

      {isLoading ? (
        <div className="space-y-3 mt-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : bookings.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No pending requests"
          description="All booking requests have been processed."
        />
      ) : (
        <div className="mt-6">
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted uppercase tracking-wider">
                  <th className="pb-3 pr-4 font-medium">Date</th>
                  <th className="pb-3 pr-4 font-medium">Session</th>
                  <th className="pb-3 pr-4 font-medium">Child</th>
                  <th className="pb-3 pr-4 font-medium">Parent</th>
                  <th className="pb-3 pr-4 font-medium">Notes</th>
                  <th className="pb-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {bookings.map((booking) => {
                  const date = new Date(booking.date);
                  const parent = booking.child.enrolment?.primaryParent;
                  const isActive = activeBookingId === booking.id;
                  return (
                    <tr key={booking.id} className="hover:bg-surface/50">
                      <td className="py-3 pr-4">
                        {date.toLocaleDateString("en-AU", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                        })}
                      </td>
                      <td className="py-3 pr-4">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-surface text-foreground">
                          {SESSION_LABELS[booking.sessionType] ?? booking.sessionType.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 pr-4 font-medium">
                        {booking.child.firstName} {booking.child.surname}
                      </td>
                      <td className="py-3 pr-4 text-muted">
                        {parent ? `${parent.firstName} ${parent.surname}` : "—"}
                      </td>
                      <td className="py-3 pr-4 text-muted max-w-[200px] truncate">
                        {booking.notes || "—"}
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="xs"
                            variant="primary"
                            iconLeft={<CalendarCheck className="w-3.5 h-3.5" />}
                            loading={isActive}
                            disabled={activeBookingId !== null}
                            onClick={() => handleStatusChange(booking.id, "confirmed")}
                          >
                            Approve
                          </Button>
                          <Button
                            size="xs"
                            variant="destructive"
                            iconLeft={<CalendarX className="w-3.5 h-3.5" />}
                            loading={isActive}
                            disabled={activeBookingId !== null}
                            onClick={() => handleStatusChange(booking.id, "cancelled")}
                          >
                            Reject
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-3">
            {bookings.map((booking) => {
              const date = new Date(booking.date);
              const parent = booking.child.enrolment?.primaryParent;
              const isActive = activeBookingId === booking.id;
              return (
                <div
                  key={booking.id}
                  className="bg-card border border-border rounded-xl p-4 space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-foreground">
                        {booking.child.firstName} {booking.child.surname}
                      </p>
                      <p className="text-sm text-muted mt-0.5">
                        {date.toLocaleDateString("en-AU", {
                          weekday: "long",
                          day: "numeric",
                          month: "short",
                        })}
                      </p>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-surface text-foreground">
                      {SESSION_LABELS[booking.sessionType] ?? booking.sessionType.toUpperCase()}
                    </span>
                  </div>
                  {parent && (
                    <p className="text-xs text-muted">
                      Requested by {parent.firstName} {parent.surname}
                    </p>
                  )}
                  {booking.notes && (
                    <p className="text-sm text-muted bg-surface rounded-lg p-2">
                      {booking.notes}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      className="flex-1"
                      iconLeft={<CalendarCheck className="w-4 h-4" />}
                      loading={isActive}
                      disabled={activeBookingId !== null}
                      onClick={() => handleStatusChange(booking.id, "confirmed")}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="flex-1"
                      iconLeft={<CalendarX className="w-4 h-4" />}
                      loading={isActive}
                      disabled={activeBookingId !== null}
                      onClick={() => handleStatusChange(booking.id, "cancelled")}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
