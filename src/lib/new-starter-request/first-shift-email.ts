/**
 * "Before your first shift" checklist email — sent once, right after a
 * new starter's account is created (alongside the standard login
 * invite from sendWelcomeInvite). Lists whatever the assigned
 * onboarding pack's tasks are, so it stays in sync with whatever admin
 * has configured on /onboarding — never a second, hand-typed list that
 * can drift from the real checklist.
 */
import { baseLayout, buttonHtml } from "@/lib/email-templates/base";
import { sendEmail } from "@/lib/email";
import { logger } from "@/lib/logger";

export async function sendFirstShiftChecklistEmail(opts: {
  email: string;
  name: string;
  startDate: Date;
  checklistItems: string[];
}): Promise<void> {
  const firstName = opts.name.trim().split(/\s+/)[0] || opts.name;
  const startDateLabel = opts.startDate.toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const dashboardUrl = `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/my-training`;

  const listHtml = opts.checklistItems.length
    ? `<ul style="padding-left:20px;margin:16px 0;">${opts.checklistItems
        .map((item) => `<li style="margin-bottom:8px;">${escapeHtml(item)}</li>`)
        .join("")}</ul>`
    : `<p>Your onboarding checklist will appear on your Training page once it's set up — check back soon.</p>`;

  const html = baseLayout(
    `
      <h2 style="margin:0 0 16px;">Welcome to Amana OSHC, ${escapeHtml(firstName)}!</h2>
      <p>We're looking forward to having you start on <strong>${startDateLabel}</strong>. Before your
      first shift, here's what to get done:</p>
      ${listHtml}
      <p>You can track your progress any time from the Training page in your dashboard.</p>
      ${buttonHtml("Go to My Training", dashboardUrl)}
      <p style="margin-top:24px;">See you soon,<br/>The Amana OSHC Team</p>
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
