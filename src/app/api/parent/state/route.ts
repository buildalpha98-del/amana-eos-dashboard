/**
 * GET /api/parent/state — where this family is in the enrolment journey.
 *
 * 2026-07-30. Drives the gate: a parent with no children on their account
 * is sent to the enrolment form instead of a home page that has nothing to
 * show them (and that was throwing "No contact record found" at them).
 *
 * Cheap on purpose — it runs on every parent page load.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withParentAuth } from "@/lib/parent-auth";
import { getParentEnrolmentState } from "@/lib/parent-enrolment-state";

export const GET = withParentAuth(async (_req, ctx) => {
  const enrolments = ctx.parent.enrolmentIds.length
    ? await prisma.enrolmentSubmission.findMany({
        where: { id: { in: ctx.parent.enrolmentIds } },
        select: { status: true },
      })
    : [];

  const draft = ctx.parent.accountId
    ? await prisma.enrolmentDraft.findUnique({
        where: { accountId: ctx.parent.accountId },
        select: { currentStep: true, submittedAt: true },
      })
    : null;

  let state = getParentEnrolmentState(enrolments);

  /**
   * A parent who has JUST submitted must not be sent back into the form.
   *
   * enrolmentIds comes from the session JWT, which was signed at LOGIN —
   * before this enrolment existed. withParentAuth only ever filters that
   * list down against the database, so a new submission can never appear
   * in it. The result was the gate bouncing a family straight back into
   * the form they had just finished.
   *
   * The submit route now re-issues the cookie, but that only helps the
   * session that did the submitting. This is the durable check: the draft
   * belongs to the account, and `submittedAt` is proof they finished,
   * with no 500-row scan of enrolment JSON on every page load.
   */
  if (state === "needs_enrolment" && draft?.submittedAt) {
    state = "pending_review";
  }

  return NextResponse.json({
    state,
    hasDraft: Boolean(draft && !draft.submittedAt),
    draftStep: draft?.currentStep ?? 0,
    // Pre-account magic-link sessions can't own a draft; the UI uses this
    // to explain why rather than silently doing nothing.
    accountBacked: Boolean(ctx.parent.accountId),
  });
});
