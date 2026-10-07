/**
 * "Before your first shift" email — sent once, right after a new starter's
 * account is created (alongside the login invite from sendWelcomeInvite).
 *
 * 2026-10-07: this used to paste the onboarding pack's task list straight
 * in — 33 bullets ("Submit valid CPR certificate (HLTAID009)", "Read
 * Behaviour Guidance policy" …) for someone who hasn't logged in yet. It
 * read as a wall. Now it's the same steps as the "Get ready for your
 * first shift" checklist on My Portal (src/lib/get-ready-steps.ts), in the
 * same order, so the email and the app tell one story. The detailed pack
 * stays on /onboarding for the people running it.
 */
import { baseLayout, buttonHtml } from "@/lib/email-templates/base";
import { sendEmail } from "@/lib/email";
import { logger } from "@/lib/logger";

const STEPS: { title: string; detail: string }[] = [
  {
    title: "Sign in and choose your password",
    detail:
      "Use the temporary password from your welcome email. You'll be asked to pick your own straight away.",
  },
  {
    title: "Sign your employment contract",
    detail: "It's waiting for you under My Contract — read it through and sign at the bottom.",
  },
  {
    title: "Add your details",
    detail:
      "A photo, your phone number and an emergency contact — plus your tax file declaration, bank and super through the Employment Hero email you'll receive separately.",
  },
  {
    title: "Upload your compliance documents",
    detail:
      "Your Working With Children Check, first aid, CPR, anaphylaxis and asthma certificates, all in My Compliance. A photo from your phone is fine.",
  },
  {
    title: "Read the Staff Handbook and The Amana Way",
    detail: "Both are in your menu under Handbook — tap \"I've read it\" when you're done.",
  },
  {
    title: "Complete your essential training",
    detail: "Short online courses under My Training — child safety, your first day and more.",
  },
];

export async function sendFirstShiftChecklistEmail(opts: {
  email: string;
  name: string;
  startDate: Date;
}): Promise<void> {
  const firstName = opts.name.trim().split(/\s+/)[0] || opts.name;
  const startDateLabel = opts.startDate.toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const portalUrl = `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/my-portal`;

  const stepsHtml = STEPS.map(
    (s, i) => `
      <tr>
        <td style="vertical-align:top;padding:0 12px 14px 0;width:28px;">
          <div style="width:26px;height:26px;border-radius:13px;background:#004E64;color:#FECE00;font-weight:700;font-size:13px;line-height:26px;text-align:center;">${i + 1}</div>
        </td>
        <td style="vertical-align:top;padding:0 0 14px 0;">
          <div style="font-weight:600;color:#004E64;">${s.title}</div>
          <div style="font-size:14px;color:#555;margin-top:2px;">${s.detail}</div>
        </td>
      </tr>`,
  ).join("");

  const html = baseLayout(
    `
      <h2 style="margin:0 0 12px;">Welcome to Amana OSHC, ${escapeHtml(firstName)}!</h2>
      <p>We can't wait to see you on <strong>${startDateLabel}</strong>. Before your first
      shift there are a few quick things to do — most take a couple of minutes, and your
      portal walks you through each one.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0 8px;width:100%;">${stepsHtml}</table>
      ${buttonHtml("Open my portal", portalUrl)}
      <p style="margin-top:20px;">On your first day your coordinator will show you around the centre.
      Any questions before then, just reply to this email.</p>
      <p style="margin-top:20px;">See you soon,<br/>The Amana OSHC Team</p>
    `,
    "staff",
  );

  try {
    await sendEmail({
      to: opts.email,
      subject: `Before your first shift at Amana OSHC`,
      html,
    });
  } catch (err) {
    // Never block account creation on an email hiccup.
    logger.error("sendFirstShiftChecklistEmail failed", { err, email: opts.email });
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
