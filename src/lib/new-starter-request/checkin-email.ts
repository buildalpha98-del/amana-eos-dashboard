/**
 * Onboarding touchpoint check-in emails — "how's your first day/week/
 * month going?" Sent by the onboarding-checkins cron when a
 * NewStarterCheckIn becomes due. The link needs no login — `token` is
 * the whole secret, since a new starter answering from their phone
 * shouldn't have to sign in first.
 */
import { baseLayout, buttonHtml } from "@/lib/email-templates/base";
import { sendEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import type { NewStarterCheckInMilestone } from "@prisma/client";

const MILESTONE_COPY: Record<NewStarterCheckInMilestone, { subject: string; heading: string; question: string }> = {
  day_1: {
    subject: "How was your first day at Amana OSHC?",
    heading: "How was your first day?",
    question: "We'd love to know how it went, and if there's anything we could do better.",
  },
  week_1: {
    subject: "How's your first week at Amana OSHC going?",
    heading: "How's your first week going?",
    question: "A week in — how are you settling in, and is there anything we could improve?",
  },
  month_1: {
    subject: "How's your first month at Amana OSHC been?",
    heading: "How's your first month been?",
    question: "You've had a full month with us now — how's it been, and what could we have done better with your onboarding?",
  },
};

export async function sendCheckInEmail(opts: {
  email: string;
  name: string;
  milestone: NewStarterCheckInMilestone;
  token: string;
}): Promise<void> {
  const firstName = opts.name.trim().split(/\s+/)[0] || opts.name;
  const copy = MILESTONE_COPY[opts.milestone];
  const formUrl = `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/onboarding-checkin/${opts.token}`;

  const html = baseLayout(
    `
      <h2 style="margin:0 0 16px;">${copy.heading}</h2>
      <p>Hi ${escapeHtml(firstName)}, ${copy.question}</p>
      <p>It only takes a minute — no need to log in.</p>
      ${buttonHtml("Share how it's going", formUrl)}
    `,
    "staff",
  );

  try {
    await sendEmail({ to: opts.email, subject: copy.subject, html });
  } catch (err) {
    logger.error("sendCheckInEmail failed", { err, email: opts.email, milestone: opts.milestone });
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
