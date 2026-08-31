import { Resend } from "resend";
import { getSuppressedEmails } from "@/lib/email-suppression";
import { logger } from "@/lib/logger";

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
  process.env.EMAIL_FROM || "Amana OSHC <contact@amanaoshc.com.au>";

// ── Suppression-aware send wrapper ─────────────────────────

interface SendEmailParams {
  from?: string;
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}

export interface SendEmailResult {
  messageId?: string;
  suppressed: string[];
  /**
   * Addresses the provider ACCEPTED. Empty when the send was rejected —
   * a caller logging "sent" off this field must not be told yes when
   * the answer was no.
   */
  sent: string[];
  /**
   * Set when Resend rejected the send.
   *
   * This exists because the SDK does NOT throw on an API error: it
   * resolves with `{ data: null, error }`. Code that destructured only
   * `data` therefore reported success for every rejected send — an
   * unverified domain, a rate limit, a blocked recipient — and the one
   * place it mattered most was the password reset, where the user is
   * told "a link has been sent" and nothing arrives.
   */
  failed?: { message: string; name?: string };
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

  // Check suppression for all recipients in one query
  const suppressedSet = await getSuppressedEmails(recipients);
  for (const email of recipients) {
    if (suppressedSet.has(email.toLowerCase())) {
      suppressed.push(email);
      if (process.env.NODE_ENV !== "production") logger.info("Email suppressed (bounce/complaint)", { email });
    } else {
      eligible.push(email);
    }
  }

  if (eligible.length === 0) {
    return { suppressed, sent: [] };
  }

  const { data, error } = await resend.emails.send({
    from: params.from ?? FROM_EMAIL,
    to: eligible,
    subject: params.subject,
    html: params.html,
    replyTo: params.replyTo,
  });

  /**
   * Deliberately not thrown.
   *
   * There are 80-odd callers, and for most of them the email is a
   * side-effect of something that already succeeded — a user was
   * created, an enrolment was submitted. Throwing would turn "the
   * invite didn't send" into "creating the user failed", which is
   * worse. So it's logged loudly and returned, and callers that need
   * to act on it can read `failed`.
   */
  if (error) {
    logger.error("Email rejected by provider", {
      to: eligible,
      subject: params.subject,
      error: error.message,
      name: error.name,
    });
    return {
      suppressed,
      sent: [],
      failed: { message: error.message, name: error.name },
    };
  }

  return {
    messageId: data?.id,
    suppressed,
    sent: eligible,
  };
}
