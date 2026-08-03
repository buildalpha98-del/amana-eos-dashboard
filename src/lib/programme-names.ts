/**
 * What Amana calls its programmes, for families.
 *
 * Booking rows carry session CODES — bsc / asc / vc. Those are internal:
 * they're written into every booking, attendance record and fortnight
 * pattern, so renaming them would be a migration rather than a setting.
 * But no parent has ever been told what "BSC" means, and a portal that
 * shows it is asking them to learn our filing system.
 *
 * ONE place on purpose. These strings were previously typed inline
 * wherever a session needed a label, which is how "ASC" ended up on the
 * parent booking dialog while the roll call said "After School Care".
 *
 * A service can override the ROOM name in Service Info → Rooms & fees
 * (see roomLabel in service-settings.ts). These are the organisation-wide
 * programme names used where no service context is to hand.
 */

export type SessionCode = "bsc" | "asc" | "vc";

export const PROGRAMME_NAMES: Record<SessionCode, string> = {
  bsc: "Rise and Shine Club",
  asc: "Amana Afternoons",
  vc: "Holiday Quest",
};

/**
 * Family-facing programme name for a session code.
 *
 * Falls back to the code UPPERCASED for anything unrecognised, rather
 * than an empty string — a stray code should look wrong on screen, not
 * silently vanish from a booking row.
 */
export function programmeName(code: string | null | undefined): string {
  if (!code) return "";
  const key = code.toLowerCase() as SessionCode;
  return PROGRAMME_NAMES[key] ?? code.toUpperCase();
}

/** True for codes we have a programme name for. */
export function isSessionCode(v: unknown): v is SessionCode {
  return typeof v === "string" && v.toLowerCase() in PROGRAMME_NAMES;
}
