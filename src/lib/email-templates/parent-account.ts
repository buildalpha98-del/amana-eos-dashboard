/**
 * Parent account emails. Uses the shared branded layout so these match the
 * rest of our transactional mail rather than being one-off HTML.
 */
import { baseLayout, buttonHtml } from "@/lib/email-templates";

export async function parentVerifyEmail(params: {
  name: string;
  link: string;
  /** True when the address already had a verified account. */
  alreadyRegistered: boolean;
}): Promise<{ subject: string; html: string }> {
  if (params.alreadyRegistered) {
    // Deliberately does NOT confirm or deny anything to a third party who
    // typed someone else's address — it reads as a normal account notice.
    return {
      subject: "Your Amana OSHC account",
      html: await baseLayout(`
        <p>Hi ${params.name},</p>
        <p>Someone just tried to create an Amana OSHC account with this email
        address. You already have one, so there's nothing to do.</p>
        <p>If you've forgotten your password, use the
        <strong>Email me a login link</strong> option on the sign-in page.</p>
        <p>If this wasn't you, you can safely ignore this message.</p>
      `, "family"),
    };
  }

  return {
    subject: "Confirm your email — Amana OSHC",
    html: await baseLayout(`
      <p>Hi ${params.name},</p>
      <p>Welcome to Amana OSHC. Please confirm your email address to activate
      your account and start your child's enrolment.</p>
      ${buttonHtml("Confirm my email", params.link)}
      <p style="font-size:13px;color:#6b7280;">This link expires in 24 hours.
      If you didn't create an account, you can ignore this email.</p>
    `, "family"),
  };
}
