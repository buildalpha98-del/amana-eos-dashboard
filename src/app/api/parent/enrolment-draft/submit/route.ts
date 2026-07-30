/**
 * POST /api/parent/enrolment-draft/submit
 *
 * Turns a completed draft into a real EnrolmentSubmission + Child records,
 * then stamps the draft as submitted so it can't be edited or re-sent.
 *
 * Completeness is re-checked HERE against the same pure rules the wizard
 * uses (src/lib/enrol-draft.ts). The client disabling a button is a
 * courtesy, not a control — this endpoint is reachable directly.
 *
 * Payment arrives in the request body rather than from the draft, because
 * card and bank numbers are deliberately never autosaved. See the header
 * comment in src/app/parent/enrol/BillingStep.tsx.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withParentAuth } from "@/lib/parent-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { encryptField } from "@/lib/field-encryption";
import { logger } from "@/lib/logger";
import {
  draftSubmittable,
  firstIncompleteStep,
  type DraftChild,
  type EnrolDraft,
} from "@/lib/enrol-draft";

const paymentSchema = z.object({
  method: z.enum(["credit_card", "bank_account"]),
  cardName: z.string().optional(),
  cardNumber: z.string().optional(),
  cardExpiryMonth: z.string().optional(),
  cardExpiryYear: z.string().optional(),
  cardCcv: z.string().optional(),
  bankAccountName: z.string().optional(),
  bankBsb: z.string().optional(),
  bankAccountNumber: z.string().optional(),
});

const bodySchema = z.object({ payment: paymentSchema.optional() });

const STEP_LABELS = ["About you", "Your child", "Contacts", "Billing", "Agreement"];

function detectCardType(number: string): string {
  const n = number.replace(/\D/g, "");
  if (/^4/.test(n)) return "Visa";
  if (/^5[1-5]/.test(n)) return "Mastercard";
  if (/^3[47]/.test(n)) return "Amex";
  return "Card";
}

export const POST = withParentAuth(async (req, ctx) => {
  const accountId = ctx.parent.accountId;
  if (!accountId) {
    throw ApiError.forbidden(
      "Please sign in with your Amana OSHC account to submit your enrolment.",
    );
  }

  const body = bodySchema.safeParse(await parseJsonBody(req));
  if (!body.success) throw ApiError.badRequest("Invalid submission.");

  const draftRow = await prisma.enrolmentDraft.findUnique({
    where: { accountId },
    select: { id: true, data: true, submittedAt: true },
  });
  if (!draftRow) throw ApiError.badRequest("There's no enrolment to submit yet.");
  if (draftRow.submittedAt) {
    throw ApiError.badRequest("This enrolment has already been submitted.");
  }

  const draft = (draftRow.data ?? {}) as EnrolDraft;

  if (!draftSubmittable(draft)) {
    const step = firstIncompleteStep(draft);
    // Name the step rather than saying "form incomplete" — the parent has
    // just been told they're done by a button they were allowed to press.
    throw ApiError.badRequest(
      `Please finish the "${STEP_LABELS[step ?? 0]}" step before submitting.`,
    );
  }

  const me = draft.me ?? {};
  const contacts = draft.contacts ?? {};
  const billing = draft.billing ?? {};
  const agreement = draft.agreement ?? {};
  const children = draft.children ?? [];

  // ── Payment: mask for storage, encrypt the full value for the OWNA port.
  const payment = body.data.payment;
  let maskedPayment: Record<string, unknown> | null = null;
  let encryptedRaw: string | null = null;

  if (payment?.method === "credit_card" && payment.cardNumber) {
    maskedPayment = {
      lastFour: payment.cardNumber.replace(/\D/g, "").slice(-4),
      cardType: detectCardType(payment.cardNumber),
    };
  } else if (payment?.method === "bank_account" && payment.bankAccountNumber) {
    maskedPayment = {
      bsbLastThree: (payment.bankBsb ?? "").replace(/\D/g, "").slice(-3),
      accountLastFour: payment.bankAccountNumber.replace(/\D/g, "").slice(-4),
    };
  }

  try {
    if (payment) encryptedRaw = encryptField(JSON.stringify(payment));
  } catch (err) {
    // Degrade exactly as the public form does: masked data is always
    // stored, the encrypted copy is a bonus. Losing it must not cost the
    // family their enrolment.
    logger.warn("Parent enrolment: payment encryption failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const primaryParent = {
    firstName: me.firstName ?? "",
    surname: me.surname ?? "",
    dob: me.dob ?? "",
    email: ctx.parent.email,
    mobile: me.mobile ?? "",
    street: me.street ?? "",
    suburb: me.suburb ?? "",
    state: me.state ?? "",
    postcode: me.postcode ?? "",
    relationship: "Parent",
    crn: me.crn ?? "",
    ccsApproved: me.ccsApproved ?? null,
    ccsApplied: me.ccsApplied ?? null,
    languageSpoken: me.languageSpoken ?? "",
    gender: me.gender ?? "",
  };

  const enrichedChildren = children.map((c: DraftChild) => ({
    ...c,
    // Children inherit the account holder's address unless we ever collect
    // a separate one — storing "" would read as "no address on file".
    street: me.street ?? "",
    suburb: me.suburb ?? "",
    state: me.state ?? "",
    postcode: me.postcode ?? "",
    medical: {
      allergies: c.allergies ?? "",
      conditions: c.conditions ?? "",
      medications: c.medications ?? "",
      dietary: c.dietary ?? "",
      none: c.medicalNone ?? false,
      hasMedicalPlan: c.hasMedicalPlan ?? null,
      doctorName: c.doctorName ?? "",
      doctorPhone: c.doctorPhone ?? "",
      medicareNumber: c.medicareNumber ?? "",
    },
    bookingPrefs: {
      bookingType: billing.bookingType ?? "",
      days: billing.days ?? [],
      startDate: billing.startDate ?? "",
    },
  }));

  const consents = {
    firstAid: agreement.firstAid ?? null,
    medication: agreement.medication ?? null,
    ambulance: agreement.ambulance ?? null,
    transport: agreement.transport ?? null,
    excursions: agreement.excursions ?? null,
    photos: agreement.photos ?? null,
    sunscreen: agreement.sunscreen ?? null,
  };

  const submission = await prisma.$transaction(async (tx) => {
    const sub = await tx.enrolmentSubmission.create({
      data: {
        primaryParent,
        secondaryParent: contacts.secondaryParent?.firstName
          ? contacts.secondaryParent
          : undefined,
        children: enrichedChildren,
        // Cast: Prisma's InputJsonValue doesn't accept a named interface
        // array directly, though the runtime shape is plain JSON.
        emergencyContacts: (contacts.emergency ?? []).filter(
          (c) => c.name,
        ) as unknown as object[],
        authorisedPickup: (contacts.authorised ?? []).filter(
          (c) => c.name,
        ) as unknown as object[],
        consents,
        paymentMethod: payment?.method ?? null,
        paymentDetails:
          maskedPayment || encryptedRaw
            ? { ...(maskedPayment ?? {}), ...(encryptedRaw ? { raw: encryptedRaw } : {}) }
            : undefined,
        referralSource: agreement.referralSource ?? null,
        signature: agreement.signature ?? null,
        termsAccepted: agreement.termsAccepted === true,
        privacyAccepted: agreement.privacyAccepted === true,
        debitAgreement: agreement.debitAgreement === true,
        courtOrders: contacts.courtOrders === true,
        status: "submitted",
      },
    });

    for (const child of enrichedChildren) {
      await tx.child.create({
        data: {
          enrolmentId: sub.id,
          firstName: child.firstName ?? "",
          surname: child.surname ?? "",
          dob: child.dob ? new Date(child.dob) : null,
          gender: child.gender || null,
          address: {
            street: child.street,
            suburb: child.suburb,
            state: child.state,
            postcode: child.postcode,
          },
          culturalBackground: child.culturalBackground
            ? [child.culturalBackground]
            : [],
          schoolName: child.schoolName ?? null,
          yearLevel: child.yearLevel ?? null,
          crn: child.crn || null,
          medical: child.medical,
          bookingPrefs: child.bookingPrefs,
          medicationDetails: child.medications || null,
          dietaryRequirements: child.dietary ? [child.dietary] : [],
          anaphylaxisActionPlan: child.hasMedicalPlan === true,
          medicareNumber: child.medicareNumber || null,
          // Stays "pending" until staff approve — canBook() reads this, so
          // creating it active would let a family book before review.
          status: "pending",
        },
      });
    }

    await tx.enrolmentDraft.update({
      where: { id: draftRow.id },
      data: { submittedAt: new Date() },
    });

    return sub;
  });

  logger.info("Parent enrolment submitted", {
    accountId,
    submissionId: submission.id,
    children: enrichedChildren.length,
  });

  return NextResponse.json({ ok: true, submissionId: submission.id });
});
