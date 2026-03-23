/**
 * Enrolment-related email templates.
 */

import { parentEmailLayout, buttonHtml } from "./base";

// ─── Enrolment Confirmation ─────────────────────────────────

export function enrolmentConfirmationEmail(parentName: string, childNames: string) {
  const subject = "Enrolment Received — Amana OSHC";
  const html = parentEmailLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Enrolment Submitted Successfully
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${parentName},
    </p>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Thank you for completing the enrolment form for <strong>${childNames}</strong>.
      Our team will review your submission and be in touch within 1-2 business days
      to confirm your enrolment details.
    </p>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      If you have any questions in the meantime, please contact us at <a href="mailto:contact@amanaoshc.com.au" style="color:#004E64;font-weight:600;">contact@amanaoshc.com.au</a>.
    </p>
    <p style="margin:16px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
      Warm regards,<br/>
      <strong>The Amana OSHC Team</strong>
    </p>
  `);

  return { subject, html };
}

// ─── School Enrolment Notification ─────────────────────────

interface SchoolEmailChild {
  firstName: string;
  surname: string;
  yearLevel?: string;
  schoolName?: string;
  medical?: {
    immunisationUpToDate?: boolean | null;
    anaphylaxisRisk?: boolean | null;
    allergies?: boolean | null;
    allergyDetails?: string;
    asthma?: boolean | null;
    otherConditions?: string;
    dietaryRequirements?: boolean | null;
    dietaryDetails?: string;
    medications?: { name: string; dosage: string; frequency: string }[];
  } | null;
  actionPlans?: string[];
}

export function schoolEnrolmentNotificationEmail(opts: {
  serviceName: string;
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  children: SchoolEmailChild[];
}) {
  const { serviceName, parentName, parentEmail, parentPhone, children } = opts;
  const dashboardUrl = process.env.NEXTAUTH_URL || "https://dashboard.amanaoshc.com.au";
  const childNames = children.map((c) => `${c.firstName} ${c.surname}`).join(", ");
  const subject = `New Enrolment Submitted — ${childNames}`;

  const cellStyle = `padding:8px 12px;border:1px solid #e5e7eb;font-size:14px;`;
  const labelStyle = `${cellStyle}color:#6b7280;width:160px;vertical-align:top;`;
  const valueStyle = `${cellStyle}color:#111827;font-weight:500;`;
  const alertStyle = `background:#FEF2F2;border:1px solid #FECACA;border-radius:6px;padding:10px 14px;margin:8px 0;font-size:13px;color:#991B1B;`;
  const sectionStyle = `margin:20px 0 8px;font-size:15px;font-weight:600;color:#004E64;border-bottom:2px solid #FECE00;padding-bottom:4px;`;

  // Build per-child detail blocks
  const childBlocks = children.map((child, i) => {
    const med = child.medical;

    // Collect medical conditions
    const conditions: string[] = [];
    if (med?.anaphylaxisRisk) conditions.push("Anaphylaxis risk");
    if (med?.allergies && med.allergyDetails) conditions.push(`Allergies: ${med.allergyDetails}`);
    if (med?.asthma) conditions.push("Asthma");
    if (med?.otherConditions) conditions.push(med.otherConditions);
    if (med?.dietaryRequirements && med.dietaryDetails) conditions.push(`Dietary: ${med.dietaryDetails}`);

    // Medications
    const meds = med?.medications?.filter((m) => m.name) || [];

    // Action plans uploaded
    const plans = child.actionPlans || [];

    return `
      <div style="${sectionStyle}">
        ${children.length > 1 ? `Child ${i + 1}: ` : ""}${child.firstName} ${child.surname}
      </div>
      <table style="width:100%;border-collapse:collapse;margin:0 0 8px;">
        <tr>
          <td style="${labelStyle}">Name</td>
          <td style="${valueStyle}">${child.firstName} ${child.surname}</td>
        </tr>
        <tr>
          <td style="${labelStyle}">Class / Year</td>
          <td style="${valueStyle}">${child.yearLevel || "Not specified"}</td>
        </tr>
        ${conditions.length > 0 ? `
        <tr>
          <td style="${labelStyle}">Medical Conditions</td>
          <td style="${valueStyle}">
            <div style="${alertStyle}">
              ${conditions.map((c) => `&bull; ${c}`).join("<br/>")}
            </div>
          </td>
        </tr>
        ` : `
        <tr>
          <td style="${labelStyle}">Medical Conditions</td>
          <td style="${valueStyle}; color:#059669;">None reported</td>
        </tr>
        `}
        ${meds.length > 0 ? `
        <tr>
          <td style="${labelStyle}">Medications</td>
          <td style="${valueStyle}">
            ${meds.map((m) => `${m.name} — ${m.dosage}, ${m.frequency}`).join("<br/>")}
          </td>
        </tr>
        ` : ""}
        <tr>
          <td style="${labelStyle}">Action Plans</td>
          <td style="${valueStyle}">${plans.length > 0 ? plans.join(", ") : "None uploaded"}</td>
        </tr>
        <tr>
          <td style="${labelStyle}">Immunisation</td>
          <td style="${valueStyle}">${med?.immunisationUpToDate === true ? '<span style="color:#059669;">Up to date</span>' : med?.immunisationUpToDate === false ? '<span style="color:#DC2626;">Not up to date</span>' : "Not specified"}</td>
        </tr>
      </table>
    `;
  }).join("");

  const html = parentEmailLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      New Enrolment Received
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      A new enrolment has been submitted for <strong>${serviceName}</strong>.
      Please review the details below and port the data into OWNA.
    </p>

    <div style="${sectionStyle}">Parent / Guardian</div>
    <table style="width:100%;border-collapse:collapse;margin:0 0 16px;">
      <tr>
        <td style="${labelStyle}">Parent Name</td>
        <td style="${valueStyle}">${parentName}</td>
      </tr>
      <tr>
        <td style="${labelStyle}">Phone</td>
        <td style="${valueStyle}">${parentPhone || "Not provided"}</td>
      </tr>
      <tr>
        <td style="${labelStyle}">Email</td>
        <td style="${valueStyle}"><a href="mailto:${parentEmail}" style="color:#004E64;">${parentEmail}</a></td>
      </tr>
    </table>

    ${childBlocks}

    <div style="margin-top:24px;">
      ${buttonHtml("View Full Enrolment in Dashboard", `${dashboardUrl}/enrolments`)}
    </div>
    <p style="margin:16px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
      Warm regards,<br/>
      <strong>The Amana OSHC Team</strong>
    </p>
  `);

  return { subject, html };
}

// ─── Enrolment Link Email ─────────────────────────────────

export function enrolmentLinkEmail(parentName: string, enrolUrl: string) {
  const subject = "Complete Your Enrolment — Amana OSHC";
  const html = parentEmailLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Complete Your Enrolment
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${parentName},
    </p>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      We're excited to welcome your family to Amana OSHC! Please click the button
      below to complete the enrolment form. Some of your details have been pre-filled
      to save you time.
    </p>
    ${buttonHtml("Complete Enrolment", enrolUrl)}
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      The form takes approximately 10-15 minutes to complete. You can save your
      progress and return at any time.
    </p>
    <p style="margin:16px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
      Warm regards,<br/>
      <strong>The Amana OSHC Team</strong>
    </p>
  `);

  return { subject, html };
}
