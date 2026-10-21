/**
 * GET  /api/parent/payment — this family's payment method, MASKED.
 * PUT  /api/parent/payment — the family updates it themselves.
 *
 * 2026-08-01, per Daniel: "Parents should also be able to edit their
 * payment method via the app."
 *
 * SCOPE: strictly the requesting parent's own enrolment. The enrolment id
 * is taken from their session, never from the request body — accepting an
 * id from the client would let any signed-in parent rewrite another
 * family's bank details by guessing one.
 *
 * The GET never decrypts. A parent already knows their own account
 * number, so returning the plaintext buys nothing and turns any hijacked
 * parent session into a data leak. They see the same mask staff see, and
 * replace it wholesale if it's wrong.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withParentAuth } from "@/lib/parent-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { encryptField } from "@/lib/field-encryption";
import { bankMask, bankPlaintext, parseBankDetails } from "@/lib/payment-details";
import { logger } from "@/lib/logger";

/**
 * The family's current enrolment, or null.
 *
 * enrolmentIds comes from the verified session and withParentAuth has
 * already filtered it against the database, so anything left is genuinely
 * theirs.
 */
async function ownEnrolmentId(enrolmentIds: string[]): Promise<string | null> {
  if (enrolmentIds.length === 0) return null;
  const latest = await prisma.enrolmentSubmission.findFirst({
    where: { id: { in: enrolmentIds } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return latest?.id ?? null;
}

export const GET = withParentAuth(async (_req, ctx) => {
  const id = await ownEnrolmentId(ctx.parent.enrolmentIds);
  if (!id) return NextResponse.json({ payment: null });

  const sub = await prisma.enrolmentSubmission.findUnique({
    where: { id },
    select: { paymentMethod: true, paymentDetails: true },
  });

  const masked = (sub?.paymentDetails ?? null) as Record<
    string,
    unknown
  > | null;

  // The real debit schedule, set by staff on the family account. The
  // billing page used to invent this as "the 1st of next month" and show
  // it to every parent regardless of their actual arrangement.
  const account = ctx.parent.accountId
    ? await prisma.parentAccount.findUnique({
        where: { id: ctx.parent.accountId },
        select: {
          nextBillingDate: true,
          billingFrequency: true,
          pauseDebiting: true,
        },
      })
    : null;

  return NextResponse.json({
    // Null when staff haven't set a schedule — the UI must then say
    // nothing rather than guess a date.
    nextBillingDate: account?.pauseDebiting
      ? null
      : (account?.nextBillingDate ?? null),
    billingFrequency: account?.billingFrequency ?? null,
    debitingPaused: account?.pauseDebiting ?? false,
    payment: masked
      ? {
          method: sub?.paymentMethod ?? null,
          // Mask only — `raw` is deliberately never returned here.
          lastFour: masked.lastFour ?? null,
          cardType: masked.cardType ?? null,
          bsbLastThree: masked.bsbLastThree ?? null,
          accountLastFour: masked.accountLastFour ?? null,
        }
      : null,
  });
});

/**
 * PUT — bank details only (security brief 2026-10-21, batch 2): any card or
 * security-code value is refused, even beside `method: "bank_account"`, and
 * the body is never spread into storage. Currently dormant (the parent app
 * gate keeps this page closed) but kept safe for when it reopens.
 */
export const PUT = withParentAuth(async (req, ctx) => {
  const id = await ownEnrolmentId(ctx.parent.enrolmentIds);
  if (!id) {
    throw ApiError.badRequest(
      "We can't find an enrolment on your account yet. Please finish your enrolment first.",
    );
  }

  const parsed = parseBankDetails(await parseJsonBody(req));
  if (!parsed.ok) throw ApiError.badRequest(parsed.error);
  const d = parsed.data;

  let raw: string;
  try {
    raw = encryptField(bankPlaintext(d));
  } catch {
    // Refuse rather than degrade to a mask: the family typed these
    // expecting them to work, and silently keeping only the last four
    // would leave staff unable to debit and nobody aware.
    throw new ApiError(
      500,
      "We couldn't save your payment details securely. Please contact the centre.",
    );
  }

  const masked = bankMask(d);
  await prisma.enrolmentSubmission.update({
    where: { id },
    data: { paymentMethod: "bank_account", paymentDetails: { ...masked, raw } },
  });

  // A family changing their own bank details is exactly what someone
  // needs to be able to reconstruct after a disputed debit.
  logger.info("Parent updated their payment method", {
    enrolmentId: id,
    email: ctx.parent.email,
    method: "bank_account",
  });

  return NextResponse.json({ ok: true, method: "bank_account", ...masked });
});
