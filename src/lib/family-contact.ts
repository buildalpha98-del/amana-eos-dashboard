/**
 * Who families contact, and for what (Daniel, 20 Oct 2026).
 *
 *   Bookings (casual or recurring), changes, absences, fees, payments,
 *   OWNA access → ALWAYS the enrolments team: 1300 200 262 and
 *   enrolment@amanaoshc.com.au. Never the centre.
 *   The centre's own phone is only for the day itself — "has my child been
 *   picked up?", "I'm here for pick-up, where are you?".
 *
 * Every parent-facing email and page reads these; don't hard-code them.
 */
export const FAMILY_BOOKINGS_EMAIL = "enrolment@amanaoshc.com.au";
export const FAMILY_BOOKINGS_PHONE = "1300 200 262";
export const FAMILY_BOOKINGS_TEL = "tel:1300200262";

/** "call 1300 200 262 or email enrolment@amanaoshc.com.au" as email HTML. */
export function bookingsContactHtml(color = "#004E64"): string {
  return `call <a href="${FAMILY_BOOKINGS_TEL}" style="color:${color};font-weight:700;text-decoration:none;">${FAMILY_BOOKINGS_PHONE}</a> or email <a href="mailto:${FAMILY_BOOKINGS_EMAIL}" style="color:${color};font-weight:700;word-break:break-all;">${FAMILY_BOOKINGS_EMAIL}</a>`;
}
