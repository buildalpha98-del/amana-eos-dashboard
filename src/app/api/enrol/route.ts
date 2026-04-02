import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendTeamsNotification } from "@/lib/teams-notify";
import { sendEmail, FROM_EMAIL } from "@/lib/email";
import { enrolmentConfirmationEmail, schoolEnrolmentNotificationEmail } from "@/lib/email-templates";
import { encryptField } from "@/lib/field-encryption";
import { checkRateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { ApiError } from "@/lib/api-error";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Zod schemas — mirrors src/components/enrol/types.ts
// ---------------------------------------------------------------------------

const childSchema = z.object({
  firstName: z.string().min(1, "Child first name is required"),
  surname: z.string().min(1, "Child surname is required"),
  dob: z.string().min(1, "Child date of birth is required"),
  gender: z.enum(["female", "male", ""]).default(""),
  street: z.string().default(""),
  suburb: z.string().default(""),
  state: z.string().default(""),
  postcode: z.string().default(""),
  culturalBackground: z.array(z.string()).default([]),
  schoolName: z.string().default(""),
  yearLevel: z.string().default(""),
  crn: z.string().min(1, "Child CRN is required"),
});

const parentSchema = z.object({
  firstName: z.string().min(1, "Parent first name is required"),
  surname: z.string().min(1, "Parent surname is required"),
  dob: z.string().default(""),
  email: z.string().email("Valid email is required"),
  mobile: z.string().min(1, "Mobile is required"),
  street: z.string().default(""),
  suburb: z.string().default(""),
  state: z.string().default(""),
  postcode: z.string().default(""),
  relationship: z.string().default(""),
  occupation: z.string().default(""),
  workplace: z.string().default(""),
  workPhone: z.string().default(""),
  crn: z.string().default(""),
  soleCustody: z.boolean().nullable().default(null),
});

const secondaryParentSchema = z.object({
  firstName: z.string().default(""),
  surname: z.string().default(""),
  dob: z.string().default(""),
  email: z.string().default(""),
  mobile: z.string().default(""),
  street: z.string().default(""),
  suburb: z.string().default(""),
  state: z.string().default(""),
  postcode: z.string().default(""),
  relationship: z.string().default(""),
  occupation: z.string().default(""),
  workplace: z.string().default(""),
  workPhone: z.string().default(""),
  crn: z.string().default(""),
  soleCustody: z.boolean().nullable().default(null),
});

const medicationSchema = z.object({
  name: z.string().default(""),
  dosage: z.string().default(""),
  frequency: z.string().default(""),
});

const medicalSchema = z.object({
  doctorName: z.string().default(""),
  doctorPractice: z.string().default(""),
  doctorPhone: z.string().default(""),
  medicareNumber: z.string().default(""),
  medicareRef: z.string().default(""),
  medicareExpiry: z.string().default(""),
  immunisationUpToDate: z.boolean().nullable().default(null),
  immunisationDetails: z.string().default(""),
  anaphylaxisRisk: z.boolean().nullable().default(null),
  allergies: z.boolean().nullable().default(null),
  allergyDetails: z.string().default(""),
  asthma: z.boolean().nullable().default(null),
  otherConditions: z.string().default(""),
  medications: z.array(medicationSchema).default([]),
  dietaryRequirements: z.boolean().nullable().default(null),
  dietaryDetails: z.string().default(""),
});

const emergencyContactSchema = z.object({
  name: z.string().default(""),
  relationship: z.string().default(""),
  phone: z.string().default(""),
  email: z.string().default(""),
});

const authorisedPersonSchema = z.object({
  name: z.string().min(1),
  relationship: z.string().min(1),
});

const consentsSchema = z.object({
  firstAid: z.boolean().nullable().default(null),
  medication: z.boolean().nullable().default(null),
  ambulance: z.boolean().nullable().default(null),
  transport: z.boolean().nullable().default(null),
  excursions: z.boolean().nullable().default(null),
  photos: z.boolean().nullable().default(null),
  sunscreen: z.boolean().nullable().default(null),
});

const bookingPrefsSchema = z.object({
  serviceId: z.string().default(""),
  sessionTypes: z.array(z.string()).default([]),
  days: z.record(z.string(), z.array(z.string())).default({}),
  bookingType: z.enum(["permanent", "casual", ""]).default(""),
  startDate: z.string().default(""),
  requirements: z.string().default(""),
});

const paymentSchema = z.object({
  method: z.enum(["credit_card", "bank_account", ""]),
  cardName: z.string().default(""),
  cardNumber: z.string().default(""),
  cardExpiryMonth: z.string().default(""),
  cardExpiryYear: z.string().default(""),
  cardCcv: z.string().default(""),
  bankAccountName: z.string().default(""),
  bankBsb: z.string().default(""),
  bankAccountNumber: z.string().default(""),
});

const fileUploadSchema = z.object({
  filename: z.string(),
  url: z.string(),
});

const documentUploadSchema = z.object({
  childIndex: z.number(),
  type: z.string(),
  filename: z.string(),
  url: z.string(),
});

const medicalFileSchema = z.object({
  childIndex: z.number(),
  type: z.string(),
  filename: z.string(),
  url: z.string(),
});

const enrolmentBodySchema = z.object({
  children: z.array(childSchema).min(1, "At least one child is required"),
  primaryParent: parentSchema,
  secondaryParent: secondaryParentSchema.optional(),
  medicals: z.array(medicalSchema).default([]),
  emergencyContacts: z.array(emergencyContactSchema).default([]),
  authorisedPickup: z.array(authorisedPersonSchema).default([]),
  consents: consentsSchema,
  courtOrders: z.boolean().default(false),
  courtOrderFiles: z.array(fileUploadSchema).default([]),
  medicalFiles: z.array(medicalFileSchema).default([]),
  documentUploads: z.array(documentUploadSchema).default([]),
  bookingPrefs: z.array(bookingPrefsSchema).default([]),
  payment: paymentSchema,
  referralSource: z.string().default(""),
  termsAccepted: z.literal(true, { message: "Terms must be accepted" }),
  privacyAccepted: z.literal(true, { message: "Privacy Policy must be accepted" }),
  debitAgreement: z.literal(true, { message: "Direct debit agreement is required" }),
  signature: z.string().min(1, "Digital signature is required"),
  prefillToken: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export const POST = withApiHandler(async (req: NextRequest) => {
  // Rate limit: 5 submissions per IP per 15 minutes
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const rl = await checkRateLimit(`enrol:${ip}`, 5, 15 * 60 * 1000);
  if (rl.limited) {
    throw new ApiError(429, "Too many submissions. Please try again later.");
  }

  const raw = await req.json();
  const parsed = enrolmentBodySchema.safeParse(raw);
  if (!parsed.success) {
    throw ApiError.badRequest(
      "Validation failed",
      parsed.error.flatten().fieldErrors,
    );
  }

  const {
    children,
    primaryParent,
    secondaryParent,
    medicals,
    emergencyContacts,
    authorisedPickup,
    consents,
    courtOrders,
    courtOrderFiles,
    medicalFiles,
    documentUploads,
    bookingPrefs,
    payment,
    referralSource,
    signature,
    prefillToken,
  } = parsed.data;

  // Payment method validation — require payment-specific fields
  if (payment.method === "credit_card") {
    if (!payment.cardName || !payment.cardNumber || payment.cardNumber.length < 13) {
      throw ApiError.badRequest("Valid credit card details are required");
    }
    if (!payment.cardExpiryMonth || !payment.cardExpiryYear || !payment.cardCcv) {
      throw ApiError.badRequest("Card expiry and CCV are required");
    }
  } else if (payment.method === "bank_account") {
    if (!payment.bankAccountName || !payment.bankBsb || payment.bankBsb.length < 6) {
      throw ApiError.badRequest("Valid bank account details are required");
    }
    if (!payment.bankAccountNumber) {
      throw ApiError.badRequest("Bank account number is required");
    }
  } else if (!payment.method) {
    throw ApiError.badRequest("Payment method is required");
  }

  // Mask payment details — store only non-sensitive identifiers.
  // Full cardholder name and account name are ONLY in the encrypted raw field,
  // accessible via the /api/enrolments/[id]/payment decrypt endpoint.
  let maskedPayment = null;
  const paymentMethod = payment.method || null;
  if (payment.method === "credit_card" && payment.cardNumber) {
    maskedPayment = {
      lastFour: payment.cardNumber.slice(-4),
      cardType: detectCardType(payment.cardNumber),
    };
  } else if (payment.method === "bank_account" && payment.bankAccountNumber) {
    maskedPayment = {
      bsbLastThree: payment.bankBsb.slice(-3),
      accountLastFour: payment.bankAccountNumber.slice(-4),
    };
  }

  // Store encrypted full payment details for OWNA porting
  // Gracefully degrade if FIELD_ENCRYPTION_KEY is not configured — masked
  // payment data is always stored; encrypted raw is a bonus for OWNA porting.
  let encryptedPaymentRaw: string | null = null;
  try {
    if (payment.method === "credit_card") {
      encryptedPaymentRaw = encryptField(JSON.stringify({
        method: "credit_card",
        cardName: payment.cardName,
        cardNumber: payment.cardNumber,
        expiryMonth: payment.cardExpiryMonth,
        expiryYear: payment.cardExpiryYear,
        ccv: payment.cardCcv,
      }));
    } else if (payment.method === "bank_account") {
      encryptedPaymentRaw = encryptField(JSON.stringify({
        method: "bank_account",
        accountName: payment.bankAccountName,
        bsb: payment.bankBsb,
        accountNumber: payment.bankAccountNumber,
      }));
    }
  } catch (encErr) {
    logger.warn("Payment encryption failed — storing masked data only", {
      error: encErr instanceof Error ? encErr.message : String(encErr),
    });
  }

  const paymentData = {
    ...maskedPayment,
    // Encrypted full details for OWNA porting — decrypt with decryptField()
    ...(encryptedPaymentRaw ? { raw: encryptedPaymentRaw } : {}),
  };

  // Merge medical + booking into children array for storage
  const enrichedChildren = children.map((child, i) => ({
    ...child,
    medical: medicals[i] ?? null,
    bookingPrefs: bookingPrefs[i] ?? null,
  }));

  // Find linked enquiry
  let enquiryId: string | null = null;
  let serviceId: string | null = null;
  if (prefillToken) {
    const enquiry = await prisma.parentEnquiry.findFirst({
      where: { id: prefillToken },
      select: { id: true, serviceId: true },
    });
    if (enquiry) {
      enquiryId = enquiry.id;
      serviceId = enquiry.serviceId;
    }
  }
  if (!serviceId && bookingPrefs[0]?.serviceId) {
    // Validate the service ID actually exists before using it
    const svc = await prisma.service.findUnique({
      where: { id: bookingPrefs[0].serviceId },
      select: { id: true },
    });
    if (svc) {
      serviceId = svc.id;
    } else {
      logger.warn("Enrolment: invalid serviceId in bookingPrefs", {
        serviceId: bookingPrefs[0].serviceId,
      });
    }
  }

  // Atomic transaction: create submission + child records + update enquiry
  const submission = await prisma.$transaction(async (tx) => {
    const sub = await tx.enrolmentSubmission.create({
      data: {
        enquiryId,
        serviceId,
        primaryParent,
        secondaryParent: secondaryParent?.firstName ? secondaryParent : undefined,
        children: enrichedChildren,
        emergencyContacts: emergencyContacts.filter((c) => c.name),
        authorisedPickup: authorisedPickup.length > 0 ? authorisedPickup : undefined,
        consents,
        paymentMethod,
        paymentDetails: Object.keys(paymentData).length > 0 ? paymentData : undefined,
        referralSource,
        signature,
        termsAccepted: true,
        privacyAccepted: true,
        debitAgreement: true,
        courtOrders,
        courtOrderFiles: courtOrderFiles.length > 0 ? courtOrderFiles : undefined,
        medicalFiles: medicalFiles.length > 0 ? medicalFiles : undefined,
        documentUploads: documentUploads.length > 0 ? documentUploads : undefined,
      },
    });

    // Create structured Child records
    for (const child of enrichedChildren) {
      await tx.child.create({
        data: {
          enrolmentId: sub.id,
          serviceId,
          firstName: child.firstName,
          surname: child.surname,
          dob: child.dob ? new Date(child.dob) : undefined,
          gender: child.gender || undefined,
          address: child.street
            ? { street: child.street, suburb: child.suburb, state: child.state, postcode: child.postcode }
            : undefined,
          culturalBackground: child.culturalBackground,
          schoolName: child.schoolName || undefined,
          yearLevel: child.yearLevel || undefined,
          crn: child.crn || undefined,
          medical: child.medical || undefined,
          dietary: child.medical?.dietaryRequirements
            ? { details: child.medical.dietaryDetails }
            : undefined,
          bookingPrefs: child.bookingPrefs || undefined,
        },
      });
    }

    // Update enquiry stage if linked
    if (enquiryId) {
      await tx.parentEnquiry.update({
        where: { id: enquiryId },
        data: {
          stage: "enrolled",
          formCompleted: true,
          stageChangedAt: new Date(),
        },
      });
    }

    return sub;
  });

  // Teams notification (fire and forget)
  const childNames = children
    .map((c) => `${c.firstName} ${c.surname}`)
    .join(", ");
  sendTeamsNotification({
    title: "New Enrolment Submitted",
    body: `${primaryParent.firstName} ${primaryParent.surname} has submitted an enrolment for ${childNames}.`,
    facts: [
      { title: "Parent Email", value: primaryParent.email },
      { title: "Parent Phone", value: primaryParent.mobile || "—" },
      { title: "Children", value: childNames },
    ],
    actions: [
      {
        type: "Action.OpenUrl",
        title: "View Submission",
        url: `${process.env.NEXTAUTH_URL}/enrolments`,
      },
    ],
  }).catch(() => {});

  // Send confirmation email to parent (fire and forget)
  if (primaryParent.email) {
    const { subject, html } = enrolmentConfirmationEmail(
      primaryParent.firstName,
      childNames,
    );
    sendEmail({
      from: FROM_EMAIL,
      to: primaryParent.email,
      subject,
      html,
    }).catch(() => {});
  }

  // Send notification to school (fire and forget)
  if (serviceId) {
    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      select: { name: true, email: true },
    });
    if (service?.email) {
      // Build per-child details with medical info and action plan filenames
      const schoolChildren = enrichedChildren.map((child, i) => {
        const actionPlans: string[] = [];
        const medFiles = medicalFiles.filter((f) => f.childIndex === i);
        for (const f of medFiles) {
          actionPlans.push(f.filename);
        }
        return {
          firstName: child.firstName,
          surname: child.surname,
          yearLevel: child.yearLevel,
          schoolName: child.schoolName,
          medical: child.medical,
          actionPlans,
        };
      });

      const { subject: schoolSubject, html: schoolHtml } = schoolEnrolmentNotificationEmail({
        serviceName: service.name,
        parentName: `${primaryParent.firstName} ${primaryParent.surname}`,
        parentEmail: primaryParent.email,
        parentPhone: primaryParent.mobile,
        children: schoolChildren,
      });
      sendEmail({
        from: FROM_EMAIL,
        to: service.email,
        subject: schoolSubject,
        html: schoolHtml,
      }).catch(() => {});
    }
  }

  return NextResponse.json({
    success: true,
    id: submission.id,
    token: submission.token,
    childNames,
    parentName: `${primaryParent.firstName} ${primaryParent.surname}`,
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function detectCardType(number: string): string {
  if (number.startsWith("4")) return "visa";
  if (/^5[1-5]/.test(number) || /^2[2-7]/.test(number)) return "mastercard";
  if (number.startsWith("3") && ["4", "7"].includes(number[1])) return "amex";
  return "unknown";
}
