import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { z } from "zod";
import { decryptField, encryptField } from "@/lib/field-encryption";
import { ApiError, parseJsonBody } from "@/lib/api-error";

/**
 * POST /api/enrolments/[id]/payment
 * Decrypts and returns the FULL payment details.
 *
 * Used for OWNA porting and, per Daniel (2026-07-31), for reimbursing a
 * family — which needs the real BSB and account number, not a mask.
 *
 * Every reveal is written to the audit log. Reading a family's bank
 * details is legitimate but sensitive, so it should never be invisible:
 * if it's ever questioned, there has to be a record of who looked and
 * when.
 */
export const POST = withApiAuth(
  async (req: NextRequest, session, context) => {
    const { id } = await context!.params!;

    const submission = await prisma.enrolmentSubmission.findUnique({
      where: { id },
      select: { paymentDetails: true, paymentMethod: true },
    });

    if (!submission) {
      throw ApiError.notFound("Enrolment submission not found");
    }

    const details = submission.paymentDetails as Record<string, unknown> | null;
    if (!details?.raw || typeof details.raw !== "string") {
      throw ApiError.notFound("No encrypted payment details available for this submission");
    }

    const decrypted = decryptField(details.raw as string);
    const parsed = normalisePaymentShape(JSON.parse(decrypted));

    await prisma.activityLog.create({
      data: {
        userId: session?.user?.id ?? null,
        action: "payment_details_revealed",
        entityType: "EnrolmentSubmission",
        entityId: id,
        details: JSON.parse(
          JSON.stringify({ method: submission.paymentMethod }),
        ),
      },
    }).catch(() => {
      // Never block a legitimate reveal on a logging failure.
    });

    return NextResponse.json({
      method: submission.paymentMethod,
      ...parsed,
    });
  },
  { roles: ["owner", "head_office", "admin"] },
);

/**
 * PUT /api/enrolments/[id]/payment — replace the stored payment method.
 *
 * Staff correcting a mistyped BSB, or switching a family from card to
 * direct debit. Re-masks AND re-encrypts, so the two never drift apart:
 * showing "ending 4321" next to a decrypted number ending 9876 is worse
 * than showing nothing.
 *
 * Owner/head_office only — narrower than the GET's role list, because
 * writing someone's bank details is a bigger deal than reading them.
 */
const putSchema = z.object({
  method: z.enum(["credit_card", "bank_account"]),
  cardName: z.string().optional(),
  cardNumber: z.string().optional(),
  expiryMonth: z.string().optional(),
  expiryYear: z.string().optional(),
  ccv: z.string().optional(),
  accountName: z.string().optional(),
  bsb: z.string().optional(),
  accountNumber: z.string().optional(),
});

/**
 * Two encrypted shapes exist in the wild, and they disagree on field names.
 *
 *   public form   (/api/enrol)                accountName / bsb / accountNumber
 *   parent portal (/api/parent/enrolment-draft/submit)
 *                                             bankAccountName / bankBsb /
 *                                             bankAccountNumber
 *
 * The card fields diverge the same way (expiryMonth vs cardExpiryMonth).
 * The Families page read only the first set, so revealing a portal-submitted
 * enrolment "succeeded" and rendered entirely blank rows — which is what
 * Daniel saw as "nothing gets revealed".
 *
 * Normalised HERE rather than in the UI so every consumer — this page, any
 * future export, the OWNA port — gets one shape without each re-learning
 * the history.
 */
function normalisePaymentShape(raw: unknown): Record<string, unknown> {
  const p = (raw ?? {}) as Record<string, unknown>;
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = p[k];
      if (typeof v === "string" && v.trim() !== "") return v;
    }
    return undefined;
  };
  return {
    method: p.method,
    accountName: pick("accountName", "bankAccountName"),
    bsb: pick("bsb", "bankBsb"),
    accountNumber: pick("accountNumber", "bankAccountNumber"),
    cardName: pick("cardName"),
    cardNumber: pick("cardNumber"),
    expiryMonth: pick("expiryMonth", "cardExpiryMonth"),
    expiryYear: pick("expiryYear", "cardExpiryYear"),
    ccv: pick("ccv", "cardCcv"),
  };
}

function detectCardType(number: string): string {
  const n = number.replace(/\D/g, "");
  if (/^4/.test(n)) return "Visa";
  if (/^5[1-5]/.test(n)) return "Mastercard";
  if (/^3[47]/.test(n)) return "Amex";
  return "Card";
}

export const PUT = withApiAuth(
  async (req: NextRequest, session, context) => {
    const { id } = await context!.params!;
    const parsed = putSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.issues[0].message);
    }
    const d = parsed.data;

    let masked: Record<string, unknown>;
    if (d.method === "bank_account") {
      const bsb = (d.bsb ?? "").replace(/\D/g, "");
      const acct = (d.accountNumber ?? "").replace(/\D/g, "");
      if (bsb.length !== 6) {
        throw ApiError.badRequest("BSB must be 6 digits.");
      }
      if (acct.length < 5) {
        throw ApiError.badRequest("Account number looks too short.");
      }
      if (!d.accountName?.trim()) {
        throw ApiError.badRequest("Account name is required.");
      }
      masked = { bsbLastThree: bsb.slice(-3), accountLastFour: acct.slice(-4) };
    } else {
      const num = (d.cardNumber ?? "").replace(/\D/g, "");
      if (num.length < 13) throw ApiError.badRequest("Card number looks too short.");
      if (!d.cardName?.trim()) {
        throw ApiError.badRequest("Name on card is required.");
      }
      masked = { lastFour: num.slice(-4), cardType: detectCardType(num) };
    }

    let raw: string | null = null;
    try {
      // Canonical shape only — see normalisePaymentShape.
      raw = encryptField(JSON.stringify(normalisePaymentShape(d)));
    } catch {
      // Unlike the enrolment path, refuse rather than degrade: staff typed
      // these expecting them to be retrievable, and storing only a mask
      // would silently lose the numbers they just entered.
      throw new ApiError(
        500,
        "Payment details could not be encrypted, so they were not saved. Please contact support.",
      );
    }

    await prisma.enrolmentSubmission.update({
      where: { id },
      data: { paymentMethod: d.method, paymentDetails: { ...masked, raw } },
    });

    await prisma.activityLog.create({
      data: {
        userId: session?.user?.id ?? null,
        action: "payment_details_updated",
        entityType: "EnrolmentSubmission",
        entityId: id,
        details: JSON.parse(JSON.stringify({ method: d.method })),
      },
    }).catch(() => {});

    return NextResponse.json({ ok: true, method: d.method, ...masked });
  },
  { roles: ["owner", "head_office"] },
);
