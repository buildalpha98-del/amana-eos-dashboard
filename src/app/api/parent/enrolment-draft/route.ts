/**
 * GET  /api/parent/enrolment-draft — load this account's in-progress form
 * PUT  /api/parent/enrolment-draft — autosave it
 *
 * 2026-07-30, Phase 2. Daniel: "it's automatic save points. So if a
 * parent's completing it, then they have to go and do something, whatever
 * they've inputted stays on their account. So when they log back in, it
 * continues the enrolment form."
 *
 * The draft is keyed to the ParentAccount, NOT to a browser — that's the
 * whole point. localStorage (what the public form uses) is lost the moment
 * they switch device, which for a form this long is a real risk of a
 * family giving up.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withParentAuth } from "@/lib/parent-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";

const saveSchema = z.object({
  // Intentionally unvalidated shape: autosave fires mid-typing, so it must
  // accept partial and even nonsensical values. The form is validated on
  // SUBMIT. Rejecting an autosave would silently lose the parent's work,
  // since there's no sensible way to surface the error mid-keystroke.
  data: z.record(z.string(), z.unknown()),
  currentStep: z.number().int().min(0).max(10).optional(),
});

/** Only an account-backed session can own a draft. */
function requireAccountId(parent: { accountId?: string }): string {
  if (!parent.accountId) {
    // A pre-accounts magic-link session. They can still use the portal,
    // but the enrolment form needs an account to attach the draft to.
    throw ApiError.forbidden(
      "Please sign in with your Amana OSHC account to continue your enrolment.",
    );
  }
  return parent.accountId;
}

export const GET = withParentAuth(async (_req, ctx) => {
  const accountId = requireAccountId(ctx.parent);

  const draft = await prisma.enrolmentDraft.findUnique({
    where: { accountId },
    select: { data: true, currentStep: true, submittedAt: true, updatedAt: true },
  });

  // No draft yet is a normal first visit, not an error.
  return NextResponse.json(
    draft ?? { data: {}, currentStep: 0, submittedAt: null, updatedAt: null },
  );
});

export const PUT = withParentAuth(async (req, ctx) => {
  const accountId = requireAccountId(ctx.parent);
  const parsed = saveSchema.safeParse(await parseJsonBody(req));
  if (!parsed.success) throw ApiError.badRequest("Could not save your progress.");

  const existing = await prisma.enrolmentDraft.findUnique({
    where: { accountId },
    select: { submittedAt: true },
  });
  // Once submitted, the draft is history — don't let a stray autosave from
  // a stale tab overwrite it after the fact.
  if (existing?.submittedAt) {
    throw ApiError.badRequest("This enrolment has already been submitted.");
  }

  const saved = await prisma.enrolmentDraft.upsert({
    where: { accountId },
    create: {
      accountId,
      data: parsed.data.data as object,
      currentStep: parsed.data.currentStep ?? 0,
    },
    update: {
      data: parsed.data.data as object,
      ...(parsed.data.currentStep !== undefined
        ? { currentStep: parsed.data.currentStep }
        : {}),
    },
    select: { updatedAt: true, currentStep: true },
  });

  return NextResponse.json({ ok: true, ...saved });
});
