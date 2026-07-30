/**
 * Child Care Subsidy (CCS) prompting for the parent enrolment form.
 *
 * 2026-07-30, per Daniel. Two questions in the "Me" step:
 *   1. Is your child's Child Care Subsidy approved?
 *   2. (only if not approved) Have you applied for it?
 *
 * The point is to catch families who haven't applied BEFORE they finish
 * enrolling, because Services Australia takes roughly two weeks to
 * approve and a family that discovers this later pays full fees in the
 * meantime.
 *
 * Deliberately NON-BLOCKING: a parent who hasn't applied still gets a
 * prompt urging them to do it now and come back, but is never prevented
 * from finishing. Blocking enrolment on an external government process
 * would cost us the enrolment.
 *
 * Pure function so the branching is testable without rendering anything.
 */

export type CcsApproved = "yes" | "no" | null;
export type CcsApplied = "yes" | "no" | null;

export interface CcsAnswers {
  approved: CcsApproved;
  /** Only meaningful when `approved` is "no". */
  applied: CcsApplied;
}

export type CcsPromptTone = "none" | "info" | "action";

export interface CcsPrompt {
  tone: CcsPromptTone;
  /** Show the "Have you applied?" follow-up question. */
  askApplied: boolean;
  title: string | null;
  body: string | null;
  /** Deep link to the Services Australia claim, when we're pushing them to apply. */
  actionLabel: string | null;
  actionHref: string | null;
}

const SERVICES_AUSTRALIA_CCS_URL =
  "https://www.servicesaustralia.gov.au/how-to-claim-child-care-subsidy";

export function ccsPrompt(answers: CcsAnswers): CcsPrompt {
  const none: CcsPrompt = {
    tone: "none",
    askApplied: false,
    title: null,
    body: null,
    actionLabel: null,
    actionHref: null,
  };

  // Not answered yet, or approved — nothing to prompt.
  if (answers.approved === null) return none;
  if (answers.approved === "yes") return none;

  // Not approved → we always ask whether they've applied.
  if (answers.applied === null) {
    return { ...none, askApplied: true };
  }

  if (answers.applied === "yes") {
    return {
      tone: "info",
      askApplied: true,
      title: "Great — your claim is in",
      body:
        "Services Australia usually takes about two weeks to approve a Child Care Subsidy claim. " +
        "You can finish your enrolment now; let us know your CRN once it comes through and we'll apply the subsidy to your fees.",
      actionLabel: null,
      actionHref: null,
    };
  }

  // Hasn't applied — the case this exists for.
  return {
    tone: "action",
    askApplied: true,
    title: "Please apply for Child Care Subsidy now",
    body:
      "Most families are eligible for Child Care Subsidy, including the 3 Day Guarantee — even when both parents are working. " +
      "Claims take about two weeks to approve, and we can't backdate the subsidy, so applying today means you pay less sooner. " +
      "You can carry on with this enrolment — please start your claim as soon as you can and come back to it.",
    actionLabel: "Apply on Services Australia",
    actionHref: SERVICES_AUSTRALIA_CCS_URL,
  };
}

/**
 * Whether the CCS section is answered enough to move on.
 * "No + haven't applied" still passes — the prompt urges, it doesn't block.
 */
export function ccsAnswered(answers: CcsAnswers): boolean {
  if (answers.approved === null) return false;
  if (answers.approved === "yes") return true;
  return answers.applied !== null;
}
