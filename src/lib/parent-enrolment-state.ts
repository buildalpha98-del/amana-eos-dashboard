/**
 * What a parent is allowed to do, based on how far their enrolment has got.
 *
 * 2026-07-30, per Daniel: "they won't see anything else except for the
 * enrolment form section. Once they complete it, it will take them to the
 * children page. However, if staff or the admin team haven't yet confirmed
 * the enrolment details are correct, they won't be able to book. However,
 * they'll still be able to view the app."
 *
 * Three states, one rule:
 *
 *   needs_enrolment  no submitted enrolment  → ONLY the form. Hard gate.
 *   pending_review   submitted, not approved → full portal, VIEW only.
 *                                              Cannot book.
 *   active           staff approved it       → everything.
 *
 * Kept as a pure function so the gate, the booking guard and the UI copy
 * all derive from the same source instead of each re-deriving "is this
 * parent allowed to…" and drifting apart.
 */

/**
 * Status values on EnrolmentSubmission that count as staff-approved.
 *
 * "processed" is the REAL one — it's what PATCH /api/enrolments/[id]
 * writes when staff confirm an enrolment, and what activates the children
 * and generates their bookings.
 *
 * It was missing here (2026-07-31). The effect was that approving a family
 * did nothing for them: this function recognised neither "processed" nor
 * "under_review", so an approved enrolment fell through to
 * needs_enrolment and the family stayed locked out of booking — the exact
 * thing approval is supposed to unlock. "approved"/"active" are kept as
 * defensive synonyms in case another path ever writes them.
 */
const APPROVED_STATUSES = new Set(["processed", "approved", "active"]);
/**
 * Submitted, awaiting a decision. "under_review" is the value the status
 * enum actually uses; "in_review"/"processing" are tolerated synonyms.
 */
const PENDING_STATUSES = new Set([
  "submitted",
  "under_review",
  "processing",
  "in_review",
]);

export type ParentEnrolmentState =
  | "needs_enrolment"
  | "pending_review"
  | "active";

export interface EnrolmentLike {
  status: string;
}

export function getParentEnrolmentState(
  enrolments: EnrolmentLike[] | null | undefined,
): ParentEnrolmentState {
  if (!enrolments || enrolments.length === 0) return "needs_enrolment";

  // Any approved enrolment unlocks the portal — a family with an approved
  // child and a second child pending shouldn't lose booking for the first.
  if (enrolments.some((e) => APPROVED_STATUSES.has(e.status))) return "active";

  if (enrolments.some((e) => PENDING_STATUSES.has(e.status))) {
    return "pending_review";
  }

  // Only drafts / rejected / archived / unknown left — treat as not
  // enrolled so they're routed back into the form rather than stranded.
  return "needs_enrolment";
}

/** Hard gate: may they use anything other than the enrolment form? */
export function canAccessPortal(state: ParentEnrolmentState): boolean {
  return state !== "needs_enrolment";
}

/** Booking stays locked until staff have checked the details. */
export function canBook(state: ParentEnrolmentState): boolean {
  return state === "active";
}

/** One place for the wording, so every surface says the same thing. */
export function enrolmentStateMessage(
  state: ParentEnrolmentState,
): string | null {
  switch (state) {
    case "needs_enrolment":
      return "Please complete your child's enrolment to get started.";
    case "pending_review":
      return "Your enrolment has been received and is being reviewed by our team. You'll be able to make bookings once it's approved.";
    case "active":
      return null;
  }
}
