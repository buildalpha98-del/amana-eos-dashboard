import { Resend } from "resend";
import { isEmailSuppressed } from "@/lib/email-suppression";

// Lazy singleton — Resend only initialises when actually called,
// preventing build-time errors when RESEND_API_KEY isn't set.
let _resend: Resend | null = null;

export function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

export const FROM_EMAIL =
  process.env.EMAIL_FROM || "Amana OSHC <noreply@amanaoshc.com.au>";

// ── Suppression-aware send wrapper ─────────────────────────

interface SendEmailParams {
  from?: string;
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}

interface SendEmailResult {
  messageId?: string;
  suppressed: string[];
  sent: string[];
}

/**
 * Send an email via Resend, automatically skipping suppressed addresses.
 *
 * Returns which addresses were sent vs suppressed.
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const resend = getResend();
  if (!resend) {
    throw new Error("Email is not configured. Set RESEND_API_KEY environment variable.");
  }

  const recipients = Array.isArray(params.to) ? params.to : [params.to];
  const suppressed: string[] = [];
  const eligible: string[] = [];

  // Check suppression for each recipient
  for (const email of recipients) {
    if (await isEmailSuppressed(email)) {
      suppressed.push(email);
      if (process.env.NODE_ENV !== "production") console.log(`Email suppressed (bounce/complaint): ${email}`);
    } else {
      eligible.push(email);
    }
  }

  if (eligible.length === 0) {
    return { suppressed, sent: [] };
  }

  const { data } = await resend.emails.send({
    from: params.from ?? FROM_EMAIL,
    to: eligible,
    subject: params.subject,
    html: params.html,
    replyTo: params.replyTo,
  });

  return {
    messageId: data?.id,
    suppressed,
    sent: eligible,
  };
}
