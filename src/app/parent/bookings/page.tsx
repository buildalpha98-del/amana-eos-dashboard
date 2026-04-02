"use client";

import { useState } from "react";
import {
  Calendar,
  Plus,
  AlertTriangle,
  XCircle,
  Clock,
} from "lucide-react";
import {
  useParentBookings,
  useMarkAbsent,
  useCancelBooking,
  type BookingRecord,
} from "@/hooks/useParentPortal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { RequestBookingDialog } from "@/components/parent/RequestBookingDialog";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

type Tab = "upcoming" | "past";

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  requested: { bg: "bg-amber-100", text: "text-amber-700", label: "Requested" },
  confirmed: { bg: "bg-green-100", text: "text-green-700", label: "Confirmed" },
  waitlisted: { bg: "bg-blue-100", text: "text-blue-700", label: "Waitlisted" },
  cancelled: { bg: "bg-gray-100", text: "text-gray-500", label: "Cancelled" },
  absent_notified: { bg: "bg-red-100", text: "text-red-600", label: "Absent" },
};

const SESSION_STYLES: Record<string, { bg: string; text: string }> = {
  bsc: { bg: "bg-[#004E64]/10", text: "text-[#004E64]" },
  asc: { bg: "bg-amber-100", text: "text-amber-700" },
  vc: { bg: "bg-purple-100", text: "text-purple-700" },
};

export default function BookingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("upcoming");
  const { data, isLoading } = useParentBookings(activeTab);
  const markAbsent = useMarkAbsent();
  const cancelBooking = useCancelBooking();

  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const [absentBooking, setAbsentBooking] = useState<BookingRecord | null>(null);
  const [cancelTarget, setCancelTarget] = useState<BookingRecord | null>(null);

  const handleMarkAbsent = (isIllness: boolean) => {
    if (!absentBooking) return;
    markAbsent.mutate(
      { bookingId: absentBooking.id, isIllness },
      { onSuccess: () => setAbsentBooking(null) }
    );
  };

  const handleCancel = () => {
    if (!cancelTarget) return;
    cancelBooking.mutate(cancelTarget.id, {
      onSuccess: () => setCancelTarget(null),
    });
  };

  const bookings = data?.bookings ?? [];
  const grouped = groupByDate(bookings);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-[#1a1a2e]">
            My Bookings
          </h1>
          <p className="text-sm text-[#7c7c8a] mt-1">
            Manage your children&apos;s sessions.
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

      {/* Tabs */}
      <div className="flex gap-1 bg-[#F2EDE8] rounded-xl p-1">
        {(["upcoming", "past"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium transition-all min-h-[44px] capitalize",
              activeTab === tab
                ? "bg-white text-[#004E64] shadow-sm"
                : "text-[#7c7c8a] hover:text-[#1a1a2e]"
            )}
          >
            {tab === "upcoming" ? (
              <Calendar className="w-4 h-4" />
            ) : (
              <Clock className="w-4 h-4" />
            )}
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <BookingsSkeleton />
      ) : bookings.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center shadow-sm border border-[#e8e4df]">
          <div className="w-12 h-12 rounded-full bg-[#FECE00]/20 flex items-center justify-center mx-auto mb-3">
            <Calendar className="w-6 h-6 text-[#004E64]" />
          </div>
          <h2 className="text-base font-heading font-semibold text-[#1a1a2e] mb-1">
            {activeTab === "upcoming"
              ? "No upcoming bookings"
              : "No past bookings"}
          </h2>
          <p className="text-sm text-[#7c7c8a]">
            {activeTab === "upcoming"
              ? 'Tap "Request Booking" to book a casual session.'
              : "Past booking history will appear here."}
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
                {items.map((booking) => (
                  <BookingCard
                    key={booking.id}
                    booking={booking}
                    isUpcoming={activeTab === "upcoming"}
                    onMarkAbsent={() => setAbsentBooking(booking)}
                    onCancel={() => setCancelTarget(booking)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dialogs */}
      <RequestBookingDialog
        open={showRequestDialog}
        onOpenChange={setShowRequestDialog}
      />

      {/* Mark Absent Dialog — custom two-action dialog */}
      {absentBooking && (
        <Dialog open={!!absentBooking} onOpenChange={(open) => !open && setAbsentBooking(null)}>
          <DialogContent>
            <DialogTitle>Mark as Absent</DialogTitle>
            <DialogDescription>
              Is {absentBooking.child.firstName}&apos;s absence due to illness?
            </DialogDescription>
            <div className="flex flex-col gap-2 mt-4">
              <button
                onClick={() => handleMarkAbsent(true)}
                disabled={markAbsent.isPending}
                className="w-full py-3 px-4 bg-[#004E64] hover:bg-[#003D52] text-white text-sm font-semibold rounded-xl transition-all disabled:opacity-50 min-h-[48px]"
              >
                Yes, Due to Illness
              </button>
              <button
                onClick={() => handleMarkAbsent(false)}
                disabled={markAbsent.isPending}
                className="w-full py-3 px-4 bg-[#F2EDE8] hover:bg-[#e8e4df] text-[#1a1a2e] text-sm font-semibold rounded-xl transition-all disabled:opacity-50 min-h-[48px]"
              >
                No, Other Reason
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Cancel Booking Confirmation */}
      {cancelTarget && (
        <ConfirmDialog
          open={!!cancelTarget}
          onOpenChange={(open) => !open && setCancelTarget(null)}
          title="Cancel Booking"
          description={`Are you sure you want to cancel ${cancelTarget.child.firstName}'s ${cancelTarget.sessionType.toUpperCase()} session?`}
          confirmLabel="Yes, Cancel"
          onConfirm={handleCancel}
          variant="danger"
          loading={cancelBooking.isPending}
        />
      )}
    </div>
  );
}

// ── Booking Card ────────────────────────────────────────

function BookingCard({
  booking,
  isUpcoming,
  onMarkAbsent,
  onCancel,
}: {
  booking: BookingRecord;
  isUpcoming: boolean;
  onMarkAbsent: () => void;
  onCancel: () => void;
}) {
  const status = STATUS_STYLES[booking.status] ?? STATUS_STYLES.requested;
  const session = SESSION_STYLES[booking.sessionType] ?? SESSION_STYLES.bsc;

  const canMarkAbsent =
    isUpcoming &&
    (booking.status === "confirmed" || booking.status === "requested") &&
    isWithinDays(booking.date, 7);

  const canCancel =
    isUpcoming &&
    booking.type === "casual" &&
    (booking.status === "requested" || booking.status === "confirmed") &&
    isMoreThanHoursAway(booking.date, 24);

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-[#e8e4df]">
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
              {booking.child.yearLevel ? ` \u00b7 ${booking.child.yearLevel}` : ""}
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
      {booking.gapFee != null && (
        <div className="mt-2 ml-12 text-xs text-[#7c7c8a]">
          ${booking.gapFee.toFixed(2)} gap fee
        </div>
      )}

      {/* Actions */}
      {(canMarkAbsent || canCancel) && (
        <div className="flex items-center gap-4 mt-3 ml-12">
          {canMarkAbsent && (
            <button
              onClick={onMarkAbsent}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-red-500 hover:text-red-700 transition-colors min-h-[44px]"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Mark Absent
            </button>
          )}
          {canCancel && (
            <button
              onClick={onCancel}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#7c7c8a] hover:text-[#1a1a2e] transition-colors min-h-[44px]"
            >
              <XCircle className="w-3.5 h-3.5" />
              Cancel
            </button>
          )}
        </div>
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

function isWithinDays(dateStr: string, days: number): boolean {
  const target = new Date(dateStr);
  const now = new Date();
  const diff = target.getTime() - now.getTime();
  return diff >= 0 && diff <= days * 24 * 60 * 60 * 1000;
}

function isMoreThanHoursAway(dateStr: string, hours: number): boolean {
  const target = new Date(dateStr);
  const now = new Date();
  return (target.getTime() - now.getTime()) > hours * 60 * 60 * 1000;
}

// ── Skeleton ────────────────────────────────────────────

function BookingsSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-24 w-full rounded-xl" />
      ))}
    </div>
  );
}
