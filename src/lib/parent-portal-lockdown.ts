import { ApiError } from "@/lib/api-error";

/**
 * Parent portal lockdown — ONE definition, read by ParentShell (what renders)
 * and by the parent booking API routes (what is allowed to happen).
 *
 * Parents book, pay and manage family details in OWNA, not here. Until that
 * changes the portal is enrolment + messages only: a family can finish
 * enrolling, see their centre, ask us for help, and manage their account.
 * Hiding the Bookings page alone is not enough — the API behind it is
 * reachable directly — so the booking routes refuse writes on the same flag.
 *
 * Flip PARENT_PORTAL_LOCKED to false (and redeploy) to open the full portal.
 */
export const PARENT_PORTAL_LOCKED = true;

/** What parents are told whenever they reach something that's switched off. */
export const OWNA_BOOKING_MESSAGE =
  "Bookings are made in OWNA, not in this app. We'll email you new OWNA login details — if you need a hand, send us a message.";

/** Parent pages that stay usable while the portal is locked. */
export function isAllowedWhileLocked(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const under = (base: string) => pathname === base || pathname.startsWith(`${base}/`);
  return (
    under("/parent/enrol") || // the form AND its thank-you page
    under("/parent/messages") || // support stays open
    under("/parent/my-centre") ||
    under("/parent/account")
  );
}

/**
 * Call first thing in every parent booking WRITE (book, bulk-book, change,
 * cancel, mark absent). Throws a 403 carrying the OWNA message, so a stale
 * tab, a bookmarked page or a direct API call can't create a booking the
 * centre never sees.
 */
export function assertParentBookingsOpen(): void {
  if (PARENT_PORTAL_LOCKED) {
    throw new ApiError(403, OWNA_BOOKING_MESSAGE);
  }
}
