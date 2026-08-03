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
import {
  setParentSessionCookie,
  signParentJwt,
  withParentAuth,
} from "@/lib/parent-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { encryptField } from "@/lib/field-encryption";
import { sendEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import { normaliseEmail } from "@/lib/parent-account";
import {
  enrolmentReceivedEmail,
  secondaryCarerInviteEmail,
} from "@/lib/email-templates/parent-account";
import { matchSchoolToService } from "@/lib/school-service-match";
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
      // Readable expiry so the card-expiry reminder job can find cards
      // about to lapse without decrypting anyone's number.
      expiryMonth: payment.cardExpiryMonth ?? null,
      expiryYear: payment.cardExpiryYear ?? null,
    };
  } else if (payment?.method === "bank_account" && payment.bankAccountNumber) {
    maskedPayment = {
      bsbLastThree: (payment.bankBsb ?? "").replace(/\D/g, "").slice(-3),
      accountLastFour: payment.bankAccountNumber.replace(/\D/g, "").slice(-4),
    };
  }

  try {
    // Canonical field names, matching the public form and what
    // /api/enrolments/[id]/payment expects. Storing the raw request shape
    // here is what produced two incompatible encrypted formats and a
    // reveal that rendered blank.
    if (payment) {
      encryptedRaw = encryptField(
        JSON.stringify({
          method: payment.method,
          accountName: payment.bankAccountName,
          bsb: payment.bankBsb,
          accountNumber: payment.bankAccountNumber,
          cardName: payment.cardName,
          cardNumber: payment.cardNumber,
          expiryMonth: payment.cardExpiryMonth,
          expiryYear: payment.cardExpiryYear,
          ccv: payment.cardCcv,
        }),
      );
    }
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
      anaphylaxis: c.anaphylaxis ?? null,
      allergies: c.allergies ?? null,
      asthma: c.asthma ?? null,
      otherCondition: c.otherCondition ?? null,
      dietaryRestrictions: c.dietaryRestrictions ?? null,
      paracetamolConsent: c.paracetamol ?? null,
      allergiesDetail: c.allergiesDetail ?? "",
      asthmaDetail: c.asthmaDetail ?? "",
      otherConditionDetail: c.otherConditionDetail ?? "",
      dietaryDetail: c.dietaryDetail ?? "",
      medications: c.medications ?? "",
      doctorName: c.doctorName ?? "",
      doctorPhone: c.doctorPhone ?? "",
      doctorAddress: c.doctorAddress ?? "",
      immunisationStatus: c.immunisationStatus ?? "",
      additionalNeeds: c.additionalNeeds ?? null,
      additionalNeedsDetail: c.additionalNeedsDetail ?? "",
      medicareNumber: c.medicareNumber ?? "",
      medicareExpiry: c.medicareExpiry ?? "",
    },
    bookingPrefs: {
      bookingType: billing.bookingType ?? "",
      startDate: billing.startDate ?? "",
      // Per-program selections from the booking grid.
      sessions: billing.sessions ?? {},
      // Flattened weekday list, so anything already reading `days` (rosters,
      // the enrolment PDF) keeps working without knowing about the grid.
      days: Array.from(
        new Set([
          ...(billing.sessions?.beforeSchool ?? []),
          ...(billing.sessions?.afterSchool ?? []),
          ...(billing.days ?? []),
        ]),
      ),
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

  const emergencyContacts = (contacts.emergency ?? []).filter((c) => c.name);

  // The separate "authorised for pickup" list is gone — pickup is now a
  // per-contact authorisation. Derive the list staff actually read at the
  // door from the contacts who have that permission.
  const authorisedPickup = emergencyContacts
    .filter((c) => c.consentPickup === true)
    .map((c) => ({ name: c.name, relationship: c.relationship, phone: c.phone }));

  // Flatten every child's uploads into the two shapes the rest of the
  // dashboard already reads (documentUploads / medicalFiles).
  const documentUploads: {
    childIndex: number;
    type: string;
    filename: string;
    url: string;
  }[] = [];
  const medicalFiles: typeof documentUploads = [];
  enrichedChildren.forEach((c, childIndex) => {
    for (const u of c.uploads ?? []) {
      const row = { childIndex, type: u.type, filename: u.filename, url: u.url };
      if (u.type === "medical_action_plan") medicalFiles.push(row);
      else documentUploads.push(row);
    }
  });

  const courtOrderFiles = (contacts.courtOrderUploads ?? []).map((u) => ({
    filename: u.filename,
    url: u.url,
  }));

  /**
   * Attach the enrolment to a SERVICE.
   *
   * The form records a school; every operational view is keyed to a
   * service. Nothing joined them, so submitted children were created with
   * serviceId null — present in the database but absent from their
   * centre's children list, roll, ratios and billing.
   *
   * Resolved per child, because siblings can attend different campuses.
   * An unmatched or ambiguous school leaves serviceId null on purpose:
   * staff assign it when they approve, which is visible and fixable.
   * Guessing would put a child on the wrong centre's roll and invoice.
   */
  const activeServices = await prisma.service.findMany({
    where: { status: "active" },
    select: { id: true, name: true },
  });

  const serviceIdForChild = new Map<number, string | null>();
  enrichedChildren.forEach((c, i) => {
    const match = matchSchoolToService(c.schoolName, activeServices);
    serviceIdForChild.set(i, match.serviceId);
    if (!match.serviceId) {
      logger.warn("Enrolment: could not match school to a service", {
        school: c.schoolName,
        ambiguous: match.ambiguous,
        score: match.score,
      });
    }
  });

  // The submission's own service: the first child's, when they agree.
  const distinct = new Set(
    Array.from(serviceIdForChild.values()).filter(Boolean),
  );
  const submissionServiceId = distinct.size === 1 ? [...distinct][0]! : null;

  const submission = await prisma.$transaction(async (tx) => {
    const sub = await tx.enrolmentSubmission.create({
      data: {
        serviceId: submissionServiceId,
        primaryParent,
        secondaryParent: contacts.secondaryParent?.firstName
          ? (contacts.secondaryParent as unknown as object)
          : undefined,
        // Casts: Prisma's InputJsonValue won't take a named interface
        // directly, though the runtime shape is plain JSON.
        children: enrichedChildren as unknown as object[],
        emergencyContacts: emergencyContacts as unknown as object[],
        authorisedPickup: authorisedPickup as unknown as object[],
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
        courtOrderFiles: courtOrderFiles.length ? courtOrderFiles : undefined,
        documentUploads: documentUploads.length ? documentUploads : undefined,
        medicalFiles: medicalFiles.length ? medicalFiles : undefined,
        status: "submitted",
      },
    });

    for (const [childIndex, child] of enrichedChildren.entries()) {
      const conditions: string[] = [];
      if (child.anaphylaxis) conditions.push("Anaphylaxis");
      if (child.allergies) conditions.push("Allergies");
      if (child.asthma) conditions.push("Asthma");
      if (child.otherCondition && child.otherConditionDetail) {
        conditions.push(child.otherConditionDetail);
      }

      await tx.child.create({
        data: {
          enrolmentId: sub.id,
          // Null when the school didn't resolve — staff assign on
          // approval rather than the child silently joining a centre.
          serviceId: serviceIdForChild.get(childIndex) ?? null,
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
          // Reg 160(3)(i) wants the child AND parents. We stopped asking
          // per child (it was the same answer twice), so inherit the
          // primary carer's — falling back to anything an older draft
          // already captured.
          culturalBackground: (() => {
            const v = me.culturalBackground || child.culturalBackground;
            return v ? [v] : [];
          })(),
          schoolName: child.schoolName ?? null,
          // The dashboard's yearLevel column now carries the classroom code
          // families actually use (e.g. "D.G1Y").
          yearLevel: child.classroom ?? null,
          crn: child.crn || null,
          medical: child.medical,
          bookingPrefs: child.bookingPrefs,
          medicalConditions: conditions,
          medicationDetails: child.medications || null,
          dietaryRequirements: child.dietaryDetail ? [child.dietaryDetail] : [],
          anaphylaxisActionPlan: child.anaphylaxis === true,
          medicareNumber: child.medicareNumber || null,
          vaccinationStatus: child.immunisationStatus || null,
          additionalNeeds: child.additionalNeedsDetail || null,
          // Reg 160(3)(f). custodyArrangements is the column the Services
          // medical + sign-out screens already read, so naming the
          // restricted person here puts it in front of the educator who
          // needs it rather than burying it in the submission blob.
          custodyArrangements:
            contacts.courtOrders === true
              ? {
                  type: "court_order",
                  details: contacts.courtOrderRestrictedPersons ?? "",
                  courtOrderUrl: contacts.courtOrderUploads?.[0]?.url ?? null,
                }
              : undefined,
          // Stays "pending" until staff approve — canBook() reads this, so
          // creating it active would let a family book before review.
          status: "pending",
        },
      });
    }

    /**
     * Authorised pickup list.
     *
     * Nothing used to create these on a fresh enrolment — only the
     * sibling-copy path did — so a new family ended up with an EMPTY
     * pickup list despite having just named a second carer and emergency
     * contacts with pickup permission. Educators at the door then had
     * nothing to check against.
     *
     * The SECOND CARER is always added (Daniel, 2026-08-01: they should
     * automatically be an authorised pickup), with their full name and
     * mobile so staff can identify and reach them.
     */
    const pickupRows: {
      name: string;
      relationship: string;
      phone: string;
      isEmergencyContact: boolean;
    }[] = [];

    const sp = contacts.secondaryParent;
    if (sp?.firstName?.trim() && sp?.mobile?.trim()) {
      pickupRows.push({
        name: [sp.firstName, sp.surname].filter(Boolean).join(" ").trim(),
        relationship: sp.relationship?.trim() || "Parent / carer",
        phone: sp.mobile.trim(),
        isEmergencyContact: false,
      });
    }

    for (const c of emergencyContacts) {
      if (c.consentPickup !== true) continue;
      if (!c.name?.trim() || !c.phone?.trim()) continue;
      pickupRows.push({
        name: c.name.trim(),
        relationship: c.relationship?.trim() || "Emergency contact",
        phone: c.phone.trim(),
        isEmergencyContact: true,
      });
    }

    if (pickupRows.length > 0) {
      const childIds = await tx.child.findMany({
        where: { enrolmentId: sub.id },
        select: { id: true },
      });
      await tx.authorisedPickup.createMany({
        data: childIds.flatMap((child) =>
          pickupRows.map((r) => ({ ...r, childId: child.id, active: true })),
        ),
      });
    }

    await tx.enrolmentDraft.update({
      where: { id: draftRow.id },
      data: { submittedAt: new Date() },
    });

    // The household's name, from the PRIMARY carer's surname. Stored on
    // the account so the Families list has something to show and staff can
    // correct it — blended families and differing surnames are normal.
    // Only set when blank, so a staff correction is never overwritten by a
    // later resubmission.
    if (me.surname?.trim()) {
      await tx.parentAccount.updateMany({
        where: { id: accountId, OR: [{ familyName: null }, { familyName: "" }] },
        data: { familyName: me.surname.trim() },
      });
    }

    return sub;
  });

  logger.info("Parent enrolment submitted", {
    accountId,
    submissionId: submission.id,
    children: enrichedChildren.length,
  });

  // ── Invite the second carer to the Family Portal ──────────────────────
  // They set their OWN password via the normal sign-up: we never mint
  // credentials on someone else's behalf and email them out. Because their
  // address is now on the submitted enrolment, findEnrolmentIdsForEmail()
  // links this child to them automatically the moment they register.
  //
  // Deliberately outside the transaction and fully swallowed: a bounced
  // invite must never roll back a family's completed enrolment.
  const sp = contacts.secondaryParent;
  if (sp?.email?.trim()) {
    try {
      const spEmail = normaliseEmail(sp.email);
      if (spEmail !== normaliseEmail(ctx.parent.email)) {
        const { subject, html } = await secondaryCarerInviteEmail({
          name: sp.firstName ?? null,
          invitedBy:
            [me.firstName, me.surname].filter(Boolean).join(" ") || "a parent",
          childNames: enrichedChildren
            .map((c) => c.firstName)
            .filter(Boolean) as string[],
        });
        await sendEmail({ to: spEmail, subject, html });
      }
    } catch (err) {
      logger.warn("Secondary carer invite failed to send", {
        submissionId: submission.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ── Confirm receipt to the family ────────────────────────────────────
  // Swallowed like the carer invite: a mail failure must never look like
  // a failed enrolment to someone who just finished a 5-step form.
  try {
    const { subject, html } = await enrolmentReceivedEmail({
      name: me.firstName?.trim() || "there",
      childNames: enrichedChildren
        .map((c) => c.firstName)
        .filter(Boolean) as string[],
    });
    await sendEmail({ to: ctx.parent.email, subject, html });
  } catch (err) {
    logger.warn("Enrolment confirmation email failed to send", {
      submissionId: submission.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const res = NextResponse.json({ ok: true, submissionId: submission.id });

  /**
   * Re-issue the session with the new enrolment attached.
   *
   * enrolmentIds is baked into the JWT at login, and withParentAuth only
   * ever filters it DOWN against the database — so without this the
   * enrolment we just created would be invisible to every subsequent
   * request, and the gate would send this family straight back into the
   * form they had just completed.
   */
  try {
    const jwt = await signParentJwt({
      email: ctx.parent.email,
      name: ctx.parent.name,
      enrolmentIds: [...ctx.parent.enrolmentIds, submission.id],
      accountId,
    });
    setParentSessionCookie(res, jwt);
  } catch (err) {
    // /api/parent/state also treats a submitted draft as "submitted", so
    // a failure here degrades rather than trapping them in the form.
    logger.warn("Could not refresh parent session after enrolment", {
      submissionId: submission.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return res;
});
