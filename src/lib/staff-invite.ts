import { getResend, sendEmail } from "@/lib/email";
import { welcomeEmail } from "@/lib/email-templates";
import { logger } from "@/lib/logger";

/**
 * Outcome of an invite send. Mirrors NewStarterInviteStatus.
 *
 * This is a RESULT, not a void, because every interesting failure mode of
 * `sendEmail` is a returned value rather than a thrown error:
 *
 *   - a suppressed address returns `{ suppressed: [x], sent: [] }`
 *   - a provider rejection returns `{ failed: {...}, sent: [] }`
 *
 * The old helper `await`ed the call and discarded it, catching only
 * throws. So on 2026-09-14, when a State Manager completed an onboarding
 * and the new hire never received their login, every layer above reported
 * success and nothing in production logged why.
 */
export type InviteStatus =
  | "sent"
  | "suppressed"
  | "rejected"
  | "not_configured"
  | "error";

export interface InviteResult {
  status: InviteStatus;
  /** Human-readable reason for a non-`sent` status, safe to show an admin. */
  detail?: string;
}

/** Did the invite actually reach them? */
export function inviteDelivered(result: InviteResult): boolean {
  return result.status === "sent";
}

/**
 * Send the branded welcome/invite email with a temp password and login link.
 *
 * Extracted from `POST /api/users` (the AddStaffModal invite path,
 * 2026-09-04) so the hire→employee conversion route can reuse it verbatim.
 *
 * Still never throws — the account it accompanies has already been created,
 * and turning "the invite didn't send" into "creating the user failed" is
 * worse. Callers get the outcome back instead and are expected to surface
 * it. In dev without a Resend key, the temp password is printed to the
 * console.
 */
export async function sendWelcomeInvite(opts: {
  email: string;
  /** Full name — only the first word is used in the greeting. */
  name: string;
  tempPassword: string;
}): Promise<InviteResult> {
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const loginUrl = `${baseUrl}/login`;
  const { subject, html } = await welcomeEmail(
    opts.name.split(" ")[0],
    opts.tempPassword,
    loginUrl,
  );

  const resend = getResend();
  if (!resend) {
    if (process.env.NODE_ENV !== "production") {
      console.log(
        `[DEV] Welcome email for ${opts.email} — temp password: ${opts.tempPassword}`,
      );
      // Dev without a key is the normal local setup, not a fault worth
      // flagging up the stack as a delivery failure.
      return { status: "sent" };
    }
    logger.error("Welcome invite not sent — RESEND_API_KEY is not configured", {
      email: opts.email,
    });
    return {
      status: "not_configured",
      detail: "Email sending isn't configured on this environment.",
    };
  }

  try {
    const result = await sendEmail({ to: opts.email, subject, html });

    if (result.suppressed.length > 0) {
      logger.error("Welcome invite suppressed", { email: opts.email });
      return {
        status: "suppressed",
        detail:
          "This address is on the suppression list from a previous bounce, complaint or unsubscribe. Clear it in email settings, then resend.",
      };
    }

    if (result.failed) {
      logger.error("Welcome invite rejected by provider", {
        email: opts.email,
        error: result.failed.message,
      });
      return { status: "rejected", detail: result.failed.message };
    }

    if (result.sent.length === 0) {
      // Belt and braces: no send, no suppression, no error. Shouldn't
      // happen, but reporting "sent" on an empty result is how this
      // whole class of bug started.
      logger.error("Welcome invite reported neither sent nor failed", {
        email: opts.email,
      });
      return {
        status: "error",
        detail: "The email provider returned no result for this send.",
      };
    }

    return { status: "sent" };
  } catch (emailErr) {
    logger.error("Failed to send welcome email", { err: emailErr, email: opts.email });
    return {
      status: "error",
      detail:
        emailErr instanceof Error ? emailErr.message : "Unknown sending error.",
    };
  }
}
