import { getResend, sendEmail } from "@/lib/email";
import { welcomeEmail } from "@/lib/email-templates";
import { logger } from "@/lib/logger";

/**
 * Send the branded welcome/invite email with a temp password and login link.
 *
 * Extracted from `POST /api/users` (the AddStaffModal invite path,
 * 2026-09-04) so the hire→employee conversion route can reuse it verbatim.
 * Swallow-and-log on send failure — an email hiccup must never fail the
 * user creation it accompanies. In dev without a Resend key, the temp
 * password is printed to the console instead.
 */
export async function sendWelcomeInvite(opts: {
  email: string;
  /** Full name — only the first word is used in the greeting. */
  name: string;
  tempPassword: string;
}): Promise<void> {
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const loginUrl = `${baseUrl}/login`;
  const { subject, html } = await welcomeEmail(
    opts.name.split(" ")[0],
    opts.tempPassword,
    loginUrl,
  );

  const resend = getResend();
  if (resend) {
    try {
      await sendEmail({ to: opts.email, subject, html });
    } catch (emailErr) {
      logger.error("Failed to send welcome email", { err: emailErr });
      // Don't fail user creation if email fails
    }
  } else {
    if (process.env.NODE_ENV !== "production")
      console.log(
        `[DEV] Welcome email for ${opts.email} — temp password: ${opts.tempPassword}`,
      );
  }
}
