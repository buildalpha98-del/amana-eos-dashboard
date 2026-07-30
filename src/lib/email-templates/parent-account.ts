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


/**
 * Sent the moment a family submits their enrolment.
 *
 * Two jobs: reassure them it arrived (a long form ending in silence reads
 * as "did that work?"), and set an expectation for what happens next so
 * they aren't left wondering whether to chase us.
 */
export async function enrolmentReceivedEmail(params: {
  name: string;
  childNames: string[];
}): Promise<{ subject: string; html: string }> {
  const base = process.env.NEXTAUTH_URL ?? "https://amanaoshc.company";

  const child =
    params.childNames.length === 1
      ? params.childNames[0]
      : params.childNames.length > 1
        ? `${params.childNames.slice(0, -1).join(", ")} and ${params.childNames.at(-1)}`
        : "your child";

  return {
    subject: "We've received your enrolment — Amana OSHC",
    html: await baseLayout(
      `
      <p>Hi ${params.name},</p>
      <p>Thank you — we've received ${child}'s enrolment.</p>
      <p>Our team will review the details and get back to you within
      <strong>one business day</strong> to confirm the enrolment. If we
      need anything else, we'll give you a call on the number you gave us.</p>
      <p>In the meantime you can sign in to the Family Portal any time to
      see where things are up to.</p>
      ${buttonHtml("Go to my Family Portal", `${base}/parent`)}
      <p><strong>One thing to know:</strong> the Family Portal is our new
      system and we're still building it. Insha'Allah we'll let you know
      as soon as it's fully up and running. You'll receive a separate
      email within 24 hours with your login details for <strong>OWNA</strong>,
      the parent app we currently use for bookings and daily updates.</p>
      <p style="font-size:13px;color:#6b7280;">Any questions in the
      meantime, just reply to this email or contact us at
      enrolments@amanaoshc.com.au.</p>
    `,
      "family",
    ),
  };
}


/**
 * Sent when STAFF confirm an enrolment.
 *
 * This is where email verification now lives. Families sign up and go
 * straight into the form without confirming an address first — asking
 * them to go and find an email before they could even see the form was
 * losing people at the doorstep. By this point the address has been used
 * for the submission receipt and staff have checked the details, so
 * verifying here costs the family nothing and still proves the address
 * before it carries anything sensitive.
 *
 * `verifyLink` is null when the address is already verified — then this is
 * purely a "you're all set" email with nothing to action.
 */
export async function enrolmentApprovedEmail(params: {
  name: string;
  childNames: string[];
  verifyLink: string | null;
}): Promise<{ subject: string; html: string }> {
  const base = process.env.NEXTAUTH_URL ?? "https://amanaoshc.company";

  const child =
    params.childNames.length === 1
      ? params.childNames[0]
      : params.childNames.length > 1
        ? `${params.childNames.slice(0, -1).join(", ")} and ${params.childNames.at(-1)}`
        : "your child";

  const verifyBlock = params.verifyLink
    ? `
      <p>One last thing — please confirm your email address so we can be
      sure important updates about ${child} reach you.</p>
      ${buttonHtml("Verify my email address", params.verifyLink)}
      <p style="font-size:13px;color:#6b7280;">This link expires in 24 hours.
      If it does, just ask us for a new one.</p>`
    : `${buttonHtml("Go to my Family Portal", `${base}/parent`)}`;

  return {
    subject: `${child}'s enrolment is confirmed — Amana OSHC`,
    html: await baseLayout(
      `
      <p>Assalamu alaikum ${params.name},</p>
      <p>Good news — ${child}'s enrolment with Amana OSHC has been
      confirmed. We're looking forward to having them with us.</p>
      ${verifyBlock}
      <p>You'll receive your OWNA login details separately; that's the app
      we currently use day to day for bookings and updates.</p>
      <p style="font-size:13px;color:#6b7280;">Any questions, just reply to
      this email or contact us at enrolments@amanaoshc.com.au.</p>
    `,
      "family",
    ),
  };
}


/**
 * Sent to the second parent/carer named on a submitted enrolment, letting
 * them know they have access to the Family Portal for their child.
 *
 * Deliberately does NOT contain credentials. Daniel asked for "an email
 * with their login details", but minting a password for a third party and
 * emailing it out would put a working credential in an inbox we don't
 * control — and any forward of that message is a live account handover.
 * Instead they register themselves in the normal way; because their address
 * is on the submitted enrolment, findEnrolmentIdsForEmail() attaches the
 * child to them automatically the moment they do.
 *
 * Also written to be safe if the primary carer mistypes the address: it
 * names who added them and reveals nothing beyond a first name.
 */
export async function secondaryCarerInviteEmail(params: {
  name: string | null;
  invitedBy: string;
  childNames: string[];
}): Promise<{ subject: string; html: string }> {
  const base = process.env.NEXTAUTH_URL ?? "https://amanaoshc.company";
  const greeting = params.name ? `Hi ${params.name},` : "Hello,";

  const child =
    params.childNames.length === 1
      ? params.childNames[0]
      : params.childNames.length > 1
        ? `${params.childNames.slice(0, -1).join(", ")} and ${params.childNames.at(-1)}`
        : "your child";

  return {
    subject: "You've been added as a carer — Amana OSHC Family Portal",
    html: await baseLayout(
      `
      <p>${greeting}</p>
      <p>${params.invitedBy} has listed you as a parent or carer on
      ${child}'s enrolment with Amana OSHC.</p>
      <p>That means you can have your own access to the Family Portal, where
      you can see bookings, account statements and updates about
      ${child}'s time with us.</p>
      ${buttonHtml("Set up my access", `${base}/parent/signup`)}
      <p>Use this same email address when you sign up and we'll connect you
      to ${child}'s enrolment automatically. You'll choose your own password
      — we never send one by email.</p>
      <p style="font-size:13px;color:#6b7280;">If you weren't expecting this,
      or you don't think you should be listed as a carer, please contact us at
      enrolments@amanaoshc.com.au and we'll sort it out.</p>
    `,
      "family",
    ),
  };
}


/**
 * Staff-triggered nudge for a family who created an account but hasn't
 * finished (or started) their child's enrolment.
 *
 * Deliberately warm rather than administrative — this goes to a parent who
 * has already shown intent by signing up, so the tone is "we've saved your
 * spot", not "you have failed to comply".
 */
export async function parentEnrolmentReminderEmail(params: {
  name: string;
  link: string;
  /** True when they have a part-finished form waiting. */
  hasDraft: boolean;
}): Promise<{ subject: string; html: string }> {
  const subject = params.hasDraft
    ? "Pick up where you left off — Amana OSHC"
    : "Finish your child's enrolment — Amana OSHC";

  const opening = params.hasDraft
    ? `<p>You've made a start on your child's enrolment — everything you entered has been saved, so you can carry on from exactly where you stopped.</p>`
    : `<p>Thanks for creating your Amana OSHC account. To finish setting up, we just need your child's enrolment details.</p>`;

  return {
    subject,
    html: await baseLayout(
      `
      <p>Hi ${params.name},</p>
      ${opening}
      <p>It takes about ten minutes, and you can stop and come back at any
      point — your answers save as you go.</p>
      ${buttonHtml(params.hasDraft ? "Continue my enrolment" : "Start my enrolment", params.link)}
      <p style="font-size:13px;color:#6b7280;">If you've already spoken to
      us about your enrolment, or you no longer need care, just reply to
      this email and let us know.</p>
    `,
      "family",
    ),
  };
}
