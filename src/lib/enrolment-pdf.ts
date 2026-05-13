import type jsPDF from "jspdf";
import { parseJsonField, primaryParentSchema } from "@/lib/schemas/json-fields";
import { BRAND, drawLogo, createPdfBuilder } from "@/lib/pdf/branding";

interface EnrolmentSubmission {
  id: string;
  primaryParent: Record<string, unknown>;
  secondaryParent?: Record<string, unknown> | null;
  children: Record<string, unknown>[];
  emergencyContacts: Record<string, unknown>[];
  authorisedPickup?: Record<string, unknown>[] | null;
  consents: Record<string, boolean>;
  paymentMethod?: string | null;
  paymentDetails?: Record<string, unknown> | null;
  referralSource?: string | null;
  termsAccepted: boolean;
  privacyAccepted: boolean;
  debitAgreement: boolean;
  courtOrders: boolean;
  courtOrderFiles?: Record<string, unknown>[] | null;
  medicalFiles?: Record<string, unknown>[] | null;
  createdAt: Date | string;
}

export async function generateEnrolmentPdf(submission: EnrolmentSubmission): Promise<jsPDF> {
  const { default: JsPDF } = await import("jspdf");
  const doc = new JsPDF("p", "mm", "a4");
  const pw = doc.internal.pageSize.getWidth();
  const margin = 18;

  const b = createPdfBuilder(doc, { margin });
  // Aliases keep the body code (200+ lines below) unchanged from the
  // inline-helpers version while the implementation now lives in the
  // shared module.
  const heading = (text: string) => b.heading(text);
  const row = (label: string, value: string | boolean | null | undefined) =>
    b.row(label, value);
  const checkPage = (needed?: number) => b.checkPage(needed);

  // ── Header ──
  doc.setFillColor(...BRAND.green.rgb);
  doc.rect(0, 0, pw, 30, "F");
  drawLogo(doc, { x: margin, y: 13, fontSize: 16 });
  doc.setFontSize(10);
  doc.setTextColor(...BRAND.cream.rgb);
  doc.text("ENROLMENT PACK", margin, 22);
  doc.setFontSize(8);
  doc.text(
    new Date(submission.createdAt).toLocaleDateString("en-AU", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    pw - margin,
    22,
    { align: "right" }
  );
  b.y = 38;

  // ── Children ──
  const children = (submission.children || []) as Record<string, unknown>[];
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    heading(`Child ${i + 1}: ${child.firstName} ${child.surname}`);
    row("Date of Birth", child.dob as string);
    row("Gender", child.gender as string);
    const addr = [child.street, child.suburb, child.state, child.postcode]
      .filter(Boolean)
      .join(", ");
    row("Address", addr);
    row("School", child.schoolName as string);
    row("Year Level", child.yearLevel as string);
    const cultural = child.culturalBackground as string[] | undefined;
    if (cultural?.length) row("Cultural Background", cultural.join(", "));
    row("CRN", child.crn as string);

    // Medical
    const med = child.medical as Record<string, unknown> | null;
    if (med) {
      checkPage(10);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bolditalic");
      doc.setTextColor(...BRAND.green.rgb);
      doc.text("Medical Information", margin, b.y);
      b.y += 5;
      row("Doctor", `${med.doctorName} — ${med.doctorPractice}`);
      row("Doctor Phone", med.doctorPhone as string);
      row("Medicare", med.medicareNumber as string);
      row("Medicare Ref", med.medicareRef as string);
      row("Medicare Expiry", med.medicareExpiry as string);
      row("Immunisation", med.immunisationUpToDate as boolean);
      if (med.immunisationUpToDate === false) row("Immunisation Details", med.immunisationDetails as string);
      row("Anaphylaxis Risk", med.anaphylaxisRisk as boolean);
      row("Allergies", med.allergies as boolean);
      if (med.allergies) row("Allergy Details", med.allergyDetails as string);
      row("Asthma", med.asthma as boolean);
      row("Other Conditions", med.otherConditions as string);
      const meds = med.medications as { name: string; dosage: string; frequency: string }[] | undefined;
      if (meds?.length) {
        row("Medications", meds.map((m) => `${m.name} (${m.dosage}, ${m.frequency})`).join("; "));
      }
      row("Dietary Requirements", med.dietaryRequirements as boolean);
      if (med.dietaryRequirements) row("Dietary Details", med.dietaryDetails as string);
    }

    // Booking
    const bp = child.bookingPrefs as Record<string, unknown> | null;
    if (bp) {
      checkPage(10);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bolditalic");
      doc.setTextColor(...BRAND.green.rgb);
      doc.text("Booking Preferences", margin, b.y);
      b.y += 5;
      const sessions = bp.sessionTypes as string[] | undefined;
      const days = bp.days as Record<string, string[]> | undefined;
      const SESSION_LABELS: Record<string, string> = { bsc: "Before School Care", asc: "After School Care", vc: "Vacation Care" };
      if (sessions?.length) {
        for (const st of sessions) {
          const sessionDays = days?.[st];
          const dayStr = sessionDays?.length
            ? sessionDays.map((d) => d.charAt(0).toUpperCase() + d.slice(1)).join(", ")
            : "Days not specified";
          row(SESSION_LABELS[st] || st.toUpperCase(), dayStr);
        }
      }
      row("Booking Type", bp.bookingType as string);
      row("Start Date", bp.startDate as string);
      row("Requirements", bp.requirements as string);
    }
  }

  // ── Primary Parent ──
  const pp = parseJsonField(submission.primaryParent, primaryParentSchema, { firstName: "", surname: "" }) as Record<string, unknown>;
  heading("Primary Parent / Guardian");
  row("Name", `${pp.firstName} ${pp.surname}`);
  row("DOB", pp.dob as string);
  row("Email", pp.email as string);
  row("Mobile", pp.mobile as string);
  row("Relationship", pp.relationship as string);
  const ppAddr = [pp.street, pp.suburb, pp.state, pp.postcode].filter(Boolean).join(", ");
  row("Address", ppAddr);
  row("Occupation", pp.occupation as string);
  row("Workplace", pp.workplace as string);
  row("Work Phone", pp.workPhone as string);
  row("CRN", pp.crn as string);

  // ── Secondary Parent ──
  const sp = submission.secondaryParent as Record<string, unknown> | null;
  if (sp?.firstName) {
    heading("Secondary Parent / Guardian");
    row("Name", `${sp.firstName} ${sp.surname}`);
    row("DOB", sp.dob as string);
    row("Email", sp.email as string);
    row("Mobile", sp.mobile as string);
    row("Relationship", sp.relationship as string);
  }

  // ── Emergency Contacts ──
  heading("Emergency Contacts");
  const contacts = (submission.emergencyContacts || []) as Record<string, unknown>[];
  contacts.forEach((c, i) => {
    if (c.name) {
      row(`Contact ${i + 1}`, `${c.name} (${c.relationship}) — ${c.phone}`);
    }
  });

  const pickup = (submission.authorisedPickup || []) as Record<string, unknown>[];
  if (pickup.length) {
    checkPage(8);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bolditalic");
    doc.setTextColor(...BRAND.green.rgb);
    doc.text("Authorised Pickup", margin, b.y);
    b.y += 5;
    pickup.forEach((p) => row(p.name as string, `${p.relationship}${p.phone ? ` — ${p.phone}` : ""}`));
  }

  // ── Consents ──
  heading("Consents & Permissions");
  const consents = submission.consents as Record<string, boolean>;
  Object.entries(consents).forEach(([key, val]) => {
    row(key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()), val);
  });
  row("Court Orders", submission.courtOrders);

  // ── Payment (FULL details for staff — sensitive!) ──
  heading("Payment Details — CONFIDENTIAL");
  row("Method", submission.paymentMethod === "credit_card" ? "Credit Card" : "Bank Account");
  const pd = submission.paymentDetails as Record<string, unknown> | null;
  if (pd) {
    if (submission.paymentMethod === "credit_card") {
      row("Card Type", pd.cardType as string);
      row("Last 4 Digits", pd.lastFour as string);
    } else {
      row("BSB (last 3)", pd.bsbLastThree as string);
      row("Account (last 4)", pd.accountLastFour as string);
    }
  }
  row("Direct Debit Agreement", submission.debitAgreement);

  // ── Referral ──
  row("Referral Source", submission.referralSource);

  // ── Footer ──
  checkPage(15);
  b.y += 5;
  doc.setDrawColor(...BRAND.yellow.rgb);
  doc.setLineWidth(0.5);
  doc.line(margin, b.y, pw - margin, b.y);
  b.y += 6;
  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.text(
    "This document contains confidential information. Delete after processing in OWNA.",
    margin,
    b.y
  );
  b.y += 4;
  doc.text(`Submission ID: ${submission.id}`, margin, b.y);

  return doc;
}
