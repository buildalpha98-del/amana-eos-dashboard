import type jsPDF from "jspdf";
import { parseJsonField, primaryParentSchema } from "@/lib/schemas/json-fields";
import { BRAND, drawLogo, createPdfBuilder } from "@/lib/pdf/branding";

/**
 * Every field this generator reads is a `Json` column, and the route
 * hands the row over as `any` — so the types on the interface below
 * describe what SHOULD be there, not what is.
 *
 * That distinction stopped being academic when the pack started
 * returning `{"error":"Internal server error"}`: spreading a non-array
 * throws "is not iterable", `.forEach` on an object throws, and
 * `Object.entries(null)` throws. Any one of them takes down the whole
 * document — including sections that render perfectly well — for a
 * staff member who just wanted to print an enrolment.
 *
 * A string is the case worth naming, because it doesn't throw:
 * `[..."none"]` yields four one-character entries. So this checks for
 * an array rather than wrapping the lot in a try/catch, and drops
 * entries that aren't objects.
 */
function asRows(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v)
    ? (v.filter((r) => r && typeof r === "object") as Record<string, unknown>[])
    : [];
}

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
  /**
   * Birth certificates, immunisation records, court orders — everything
   * the family uploaded that isn't a medical action plan.
   *
   * This field was missing from the interface entirely, and the route
   * passed the submission through as `any`, so it type-checked and
   * silently vanished. See the Documents section below for why that
   * mattered.
   */
  documentUploads?: Record<string, unknown>[] | null;
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
  const children = asRows(submission.children);
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
    if (Array.isArray(cultural) && cultural.length)
      row("Cultural Background", cultural.join(", "));
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
      const meds = asRows(med.medications) as unknown as {
        name: string;
        dosage: string;
        frequency: string;
      }[];
      if (meds.length) {
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
      const sessions = Array.isArray(bp.sessionTypes)
        ? (bp.sessionTypes.filter((x) => typeof x === "string") as string[])
        : [];
      const days = bp.days as Record<string, string[]> | undefined;
      const SESSION_LABELS: Record<string, string> = { bsc: "Before School Care", asc: "After School Care", vc: "Vacation Care" };
      if (sessions.length) {
        for (const st of sessions) {
          const sessionDays = Array.isArray(days?.[st]) ? days![st] : [];
          const dayStr = sessionDays.length
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
  const contacts = asRows(submission.emergencyContacts);
  contacts.forEach((c, i) => {
    if (c.name) {
      row(`Contact ${i + 1}`, `${c.name} (${c.relationship}) — ${c.phone}`);
    }
  });

  const pickup = asRows(submission.authorisedPickup);
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
  /*
   * `Object.entries(null)` throws, and `consents` is a Json column like
   * every other field here — a submission missing it would have taken
   * the whole pack down.
   */
  const consents =
    submission.consents && typeof submission.consents === "object"
      ? (submission.consents as Record<string, boolean>)
      : {};
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

  /**
   * ── Documents provided ──
   *
   * None of this appeared in the pack before. `medicalFiles` and
   * `courtOrderFiles` were declared on the interface and never
   * rendered; `documentUploads` wasn't even declared. So the printed
   * enrolment — the artefact staff check and file — recorded no
   * evidence of a birth certificate, an immunisation history or an
   * anaphylaxis action plan, however many the family had uploaded.
   *
   * Filenames rather than the files themselves: embedding a scanned PDF
   * or a photo would balloon the pack and can't be done for every
   * format. What this needs to answer is "did they give us the
   * immunisation record", and a named list answers it.
   */
  const docRows = documentRows(submission);
  if (docRows.length > 0) {
    heading("Documents Provided");
    for (const { label, filename } of docRows) row(label, filename);
  }

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

/**
 * The "Documents Provided" rows: one per uploaded file, grouped by child.
 *
 * Exported and pure so it can be asserted without rendering a PDF —
 * this is the part with the judgement in it, and the part that was
 * silently absent.
 */
export function documentRows(submission: {
  children: Record<string, unknown>[];
  documentUploads?: Record<string, unknown>[] | null;
  medicalFiles?: Record<string, unknown>[] | null;
  courtOrderFiles?: Record<string, unknown>[] | null;
}): Array<{ label: string; filename: string }> {
  const uploads = [
    ...asRows(submission.documentUploads),
    ...asRows(submission.medicalFiles),
    ...asRows(submission.courtOrderFiles),
  ];

  /** "immunisation_record" reads badly on a printed page. */
  const prettyType = (t: unknown) =>
    typeof t === "string" && t
      ? t.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
      : "Document";

  /**
   * Grouped by child, because "we have an action plan" is only useful
   * when you know WHOSE. `childIndex` is how the submit route flattens
   * them; anything without one is a household-level document.
   */
  const childName = (i: unknown) => {
    if (typeof i !== "number") return null;
    // Same reasoning as `asRows` — `children` is a Json column too.
    if (!Array.isArray(submission.children)) return null;
    const child = submission.children[i];
    if (!child) return null;
    const first = typeof child.firstName === "string" ? child.firstName : "";
    const last = typeof child.surname === "string" ? child.surname : "";
    return [first, last].filter(Boolean).join(" ") || null;
  };

  return uploads.map((file) => {
    const who = childName(file.childIndex);
    return {
      label: who
        ? `${prettyType(file.type)} — ${who}`
        : prettyType(file.type),
      filename:
        typeof file.filename === "string" && file.filename
          ? file.filename
          : "(unnamed file)",
    };
  });
}
