"use client";

import { BookingRequestsInbox } from "@/components/bookings/BookingRequestsInbox";
import { useStaffV2Flag } from "@/lib/useStaffV2Flag";

export default function BookingsPage() {
  const v2 = useStaffV2Flag();
  return (
    <div {...(v2 ? { "data-v2": "staff" } : {})}>
      <BookingRequestsInbox />
    </div>
  );
}
