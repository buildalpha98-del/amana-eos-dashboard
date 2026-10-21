import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { decryptField, encryptField } from "@/lib/field-encryption";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { ADMIN_ROLES } from "@/lib/role-permissions";
import { logger } from "@/lib/logger";
import { NO_STORE_HEADERS, assertRecentAuth } from "@/lib/recent-auth";
import { bankMask, bankPlaintext, parseBankDetails, revealBankDetails } from "@/lib/payment-details";

/**
 * POST /api/enrolments/[id]/payment
 * Decrypts and returns a family's FULL bank details.
 *
 * Used for OWNA porting and, per Daniel (2026-07-31), for reimbursing a
 * family — which needs the real BSB and account number, not a mask.
 *
 * Security brief 2026-10-21, batch 2 (S04):
 *   - the person must have confirmed it's them in THIS login within the last
 *     five minutes (`assertRecentAuth`); shared centre logins never can;
 *   - the audit row is written BEFORE anything is released — if it can't be
 *     written, nothing is revealed (a reveal nobody can account for is the
 *     thing the log exists to prevent);
 *   - bank fields only: a historical card record reveals nothing beyond its
 *     mask, and never a security code;
 *   - private, no-store response.
 */
export const POST = withApiAuth(
  async (req: NextRequest, session, context) => {
    const { id } = await context!.params!;

    try {
      await assertRecentAuth(req, session, "payment_reveal");
    } catch (err) {
      // Denials are recorded too (best-effort — a denial releases nothing).
      await prisma.activityLog
        .create({
          data: {
            userId: session.user.id,
            action: "payment_details_reveal_denied",
            entityType: "EnrolmentSubmission",
            entityId: id,
            details: { reason: err instanceof ApiError && err.status === 428 ? "recent_auth_required" : "forbidden" },
          },
        })
        .catch(() => {});
      throw err;
    }

    const submission = await prisma.enrolmentSubmission.findUnique({
      where: { id },
      select: { paymentDetails: true, paymentMethod: true },
    });
    if (!submission) {
      throw ApiError.notFound("Enrolment submission not found");
    }

    const details = submission.paymentDetails as Record<string, unknown> | null;
    if (submission.paymentMethod !== "bank_account") {
      throw ApiError.conflict(
        "This family has an old card record. Card details are no longer shown — ask the family for bank details.",
      );
    }
    if (!details?.raw || typeof details.raw !== "string") {
      throw ApiError.notFound("No encrypted payment details available for this submission");
    }

    let bank: ReturnType<typeof revealBankDetails>;
    try {
      bank = revealBankDetails(JSON.parse(decryptField(details.raw)));
    } catch {
      throw new ApiError(500, "These details couldn't be decrypted. Nothing was shown.");
    }

    try {
      await prisma.activityLog.create({
        data: {
          userId: session.user.id,
          action: "payment_details_revealed",
          entityType: "EnrolmentSubmission",
          entityId: id,
          details: { method: "bank_account", result: "released" },
        },
      });
    } catch (err) {
      logger.error("Payment reveal blocked: audit write failed", { enrolmentId: id, userId: session.user.id, err });
      throw new ApiError(503, "We couldn't record this access, so the details weren't shown. Please try again in a moment.");
    }

    return NextResponse.json({ method: "bank_account", ...bank }, { headers: NO_STORE_HEADERS });
  },
  { roles: [...ADMIN_ROLES], rateLimit: { max: 20, windowMs: 60_000 } },
);

/**
 * PUT /api/enrolments/[id]/payment — replace the stored bank details.
 *
 * Staff correcting a mistyped BSB, or moving a family off an old card record
 * to direct debit. Bank ONLY (`parseBankDetails` refuses any card or
 * security-code value). Re-masks AND re-encrypts, so the two never drift
 * apart: showing "ending 4321" next to a decrypted number ending 9876 is
 * worse than showing nothing.
 *
 * Owner/head_office only — narrower than the reveal, because writing someone's
 * bank details is a bigger deal than reading them.
 */
export const PUT = withApiAuth(
  async (req: NextRequest, session, context) => {
    const { id } = await context!.params!;
    const parsed = parseBankDetails(await parseJsonBody(req));
    if (!parsed.ok) throw ApiError.badRequest(parsed.error);
    const d = parsed.data;

    const exists = await prisma.enrolmentSubmission.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw ApiError.notFound("Enrolment submission not found");

    let raw: string;
    try {
      raw = encryptField(bankPlaintext(d));
    } catch {
      // Refuse rather than degrade: storing only a mask would silently lose
      // the numbers staff just typed.
      throw new ApiError(
        500,
        "Payment details could not be encrypted, so they were not saved. Please contact support.",
      );
    }

    const masked = bankMask(d);
    await prisma.enrolmentSubmission.update({
      where: { id },
      data: { paymentMethod: "bank_account", paymentDetails: { ...masked, raw } },
    });

    await prisma.activityLog
      .create({
        data: {
          userId: session.user.id,
          action: "payment_details_updated",
          entityType: "EnrolmentSubmission",
          entityId: id,
          details: { method: "bank_account" },
        },
      })
      .catch(() => {});

    return NextResponse.json({ ok: true, method: "bank_account", ...masked }, { headers: NO_STORE_HEADERS });
  },
  { roles: ["owner", "head_office"] },
);
