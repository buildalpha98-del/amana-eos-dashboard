import { describe, it, expect } from "vitest";
import { z } from "zod";

// Re-create the enrolment schema inline to test without importing from route
// (route files aren't importable in test context without full Next.js env)

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
  crn: z.string().default(""),
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

const consentsSchema = z.object({
  firstAid: z.boolean().nullable().default(null),
  medication: z.boolean().nullable().default(null),
  ambulance: z.boolean().nullable().default(null),
  transport: z.boolean().nullable().default(null),
  excursions: z.boolean().nullable().default(null),
  photos: z.boolean().nullable().default(null),
  sunscreen: z.boolean().nullable().default(null),
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

const enrolmentBodySchema = z.object({
  children: z.array(childSchema).min(1, "At least one child is required"),
  primaryParent: parentSchema,
  secondaryParent: z.object({
    firstName: z.string().default(""),
    surname: z.string().default(""),
    email: z.string().default(""),
    mobile: z.string().default(""),
  }).passthrough().optional(),
  medicals: z.array(z.object({}).passthrough()).default([]),
  emergencyContacts: z.array(z.object({ name: z.string().default(""), relationship: z.string().default(""), phone: z.string().default(""), email: z.string().default("") })).default([]),
  authorisedPickup: z.array(z.object({ name: z.string().min(1), relationship: z.string().min(1) })).default([]),
  consents: consentsSchema,
  courtOrders: z.boolean().default(false),
  courtOrderFiles: z.array(z.object({ filename: z.string(), url: z.string() })).default([]),
  medicalFiles: z.array(z.object({ childIndex: z.number(), type: z.string(), filename: z.string(), url: z.string() })).default([]),
  documentUploads: z.array(z.object({ childIndex: z.number(), type: z.string(), filename: z.string(), url: z.string() })).default([]),
  bookingPrefs: z.array(z.object({ serviceId: z.string().default(""), sessionTypes: z.array(z.string()).default([]), days: z.record(z.string(), z.array(z.string())).default({}), bookingType: z.enum(["permanent", "casual", ""]).default(""), startDate: z.string().default(""), requirements: z.string().default("") })).default([]),
  payment: paymentSchema,
  referralSource: z.string().default(""),
  termsAccepted: z.literal(true, { message: "Terms must be accepted" }),
  privacyAccepted: z.literal(true, { message: "Privacy Policy must be accepted" }),
  debitAgreement: z.literal(true, { message: "Direct debit agreement is required" }),
  signature: z.string().min(1, "Digital signature is required"),
  prefillToken: z.string().optional(),
});

function validPayload() {
  return {
    children: [{
      firstName: "Emma",
      surname: "Smith",
      dob: "2020-06-15",
      gender: "female",
    }],
    primaryParent: {
      firstName: "John",
      surname: "Smith",
      email: "john@example.com",
      mobile: "0412345678",
    },
    consents: {
      firstAid: true,
      medication: true,
      ambulance: true,
      transport: true,
      sunscreen: true,
    },
    payment: { method: "bank_account", bankAccountName: "John Smith", bankBsb: "062000", bankAccountNumber: "12345678" },
    termsAccepted: true,
    privacyAccepted: true,
    debitAgreement: true,
    signature: "data:image/png;base64,abc123",
  };
}

describe("Enrolment body validation", () => {
  it("accepts a valid minimal payload", () => {
    const result = enrolmentBodySchema.safeParse(validPayload());
    expect(result.success).toBe(true);
  });

  it("rejects empty children array", () => {
    const result = enrolmentBodySchema.safeParse({ ...validPayload(), children: [] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.children).toBeDefined();
    }
  });

  it("rejects child without firstName", () => {
    const payload = validPayload();
    payload.children[0].firstName = "";
    const result = enrolmentBodySchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("rejects invalid parent email", () => {
    const payload = validPayload();
    payload.primaryParent.email = "not-an-email";
    const result = enrolmentBodySchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("rejects missing parent firstName", () => {
    const payload = validPayload();
    payload.primaryParent.firstName = "";
    const result = enrolmentBodySchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("rejects termsAccepted = false", () => {
    const result = enrolmentBodySchema.safeParse({ ...validPayload(), termsAccepted: false });
    expect(result.success).toBe(false);
  });

  it("rejects privacyAccepted = false", () => {
    const result = enrolmentBodySchema.safeParse({ ...validPayload(), privacyAccepted: false });
    expect(result.success).toBe(false);
  });

  it("rejects debitAgreement = false", () => {
    const result = enrolmentBodySchema.safeParse({ ...validPayload(), debitAgreement: false });
    expect(result.success).toBe(false);
  });

  it("rejects missing signature", () => {
    const result = enrolmentBodySchema.safeParse({ ...validPayload(), signature: "" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid payment method", () => {
    const payload = validPayload();
    (payload.payment as Record<string, unknown>).method = "bitcoin";
    const result = enrolmentBodySchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("defaults optional fields correctly", () => {
    const result = enrolmentBodySchema.safeParse(validPayload());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.medicals).toEqual([]);
      expect(result.data.emergencyContacts).toEqual([]);
      expect(result.data.courtOrders).toBe(false);
      expect(result.data.referralSource).toBe("");
      expect(result.data.children[0].culturalBackground).toEqual([]);
    }
  });

  it("accepts multiple children", () => {
    const payload = validPayload();
    payload.children.push({
      firstName: "Liam",
      surname: "Smith",
      dob: "2022-01-10",
      gender: "male",
    });
    const result = enrolmentBodySchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.children).toHaveLength(2);
    }
  });

  it("strips unknown fields from children (no passthrough)", () => {
    const payload = validPayload();
    (payload.children[0] as Record<string, unknown>).maliciousField = "<script>alert(1)</script>";
    const result = enrolmentBodySchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data.children[0] as Record<string, unknown>).maliciousField).toBeUndefined();
    }
  });

  it("returns structured field errors on validation failure", () => {
    const result = enrolmentBodySchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.children).toBeDefined();
      expect(errors.primaryParent).toBeDefined();
      expect(errors.signature).toBeDefined();
    }
  });
});
