/**
 * Manifest of admin-editable transactional email templates.
 *
 * Each entry binds a stable `key` to a human label + the variables the
 * template substitutes at render time. The editor at /settings/email-templates
 * uses this list to know what's editable and what placeholders are valid.
 *
 * Variables are substituted via `{{name}}` syntax; see `interpolateTemplate()`
 * below. The editor shows the variable list as a hint so admins don't have
 * to remember them.
 *
 * 2026-05-17: introduced as part of the editable-templates rollout. The
 * registry below covers an initial slice — every transactional template
 * that's high-impact and exec-name-sensitive. Other templates remain
 * hardcoded until the consumer is migrated; adding one means listing it
 * here and updating its template function to call
 * `applyEmailTemplateOverride()`.
 */

export interface EmailTemplateManifestEntry {
  /** Stable identifier; namespaced by domain module (e.g. "auth.welcomeEmail"). */
  key: string;
  /** Module bucket — drives the grouping on the editor list page. */
  category: "Auth" | "Waitlist" | "Notifications" | "Parent" | "Nurture";
  /** Human label for the editor list. */
  label: string;
  /** One-line description of when this template is sent. */
  description: string;
  /** Variables interpolated at send time (e.g. {{name}}, {{loginUrl}}). */
  variables: Array<{ name: string; description: string }>;
}

export const EMAIL_TEMPLATE_MANIFEST: EmailTemplateManifestEntry[] = [
  {
    key: "auth.welcomeEmail",
    category: "Auth",
    label: "Welcome email (new user)",
    description:
      "Sent the first time an admin creates a dashboard user, with a temporary password.",
    variables: [
      { name: "name", description: "User's first name" },
      { name: "tempPassword", description: "Temporary password to display" },
      { name: "loginUrl", description: "Dashboard sign-in URL" },
    ],
  },
  {
    key: "auth.passwordReset",
    category: "Auth",
    label: "Password reset",
    description: "Sent when a user requests a password reset.",
    variables: [
      { name: "name", description: "User's first name" },
      { name: "resetUrl", description: "Single-use reset URL (1h TTL)" },
    ],
  },
  // ── Waitlist ─────────────────────────────────────────────
  {
    key: "waitlist.confirmation",
    category: "Waitlist",
    label: "Waitlist confirmation",
    description:
      "Sent when a family joins the waitlist. Confirms their position.",
    variables: [
      { name: "parentName", description: "Parent's first name" },
      { name: "serviceName", description: "Centre name" },
      { name: "position", description: "Their position number on the waitlist" },
    ],
  },
  {
    key: "waitlist.spotAvailable",
    category: "Waitlist",
    label: "Waitlist spot available",
    description:
      "Sent when a spot opens up. Gives the family 48 hours to enrol.",
    variables: [
      { name: "parentName", description: "Parent's first name" },
      { name: "serviceName", description: "Centre name" },
      { name: "enrolUrl", description: "Enrolment completion URL" },
    ],
  },
  {
    key: "waitlist.spotExpired",
    category: "Waitlist",
    label: "Waitlist spot offered to next family",
    description:
      "Sent when a family's 48h window expires and the spot moves to the next on the list.",
    variables: [
      { name: "parentName", description: "Parent's first name" },
      { name: "serviceName", description: "Centre name" },
    ],
  },
  // ── Parent portal notifications ──────────────────────────
  {
    key: "parent.bookingConfirmed",
    category: "Parent",
    label: "Booking confirmed",
    description:
      "Confirmation sent when a parent's booking is locked in by the centre.",
    variables: [
      { name: "parentName", description: "Parent's first name" },
      { name: "childName", description: "Child's first name" },
      { name: "formattedDate", description: "Long-form date string (e.g. \"Tuesday, 5 May 2026\")" },
      { name: "sessionLabel", description: "Long session label (e.g. \"Before School Care\")" },
      { name: "serviceName", description: "Centre name" },
    ],
  },
  {
    key: "parent.bookingCancelled",
    category: "Parent",
    label: "Booking cancelled by centre",
    description: "Sent when a centre cancels an upcoming booking.",
    variables: [
      { name: "parentName", description: "Parent's first name" },
      { name: "childName", description: "Child's first name" },
      { name: "sessionShort", description: "Short session label (BSC / ASC / VC)" },
      { name: "formattedDate", description: "Long-form date string" },
      { name: "serviceName", description: "Centre name" },
    ],
  },
  {
    key: "parent.newStatement",
    category: "Parent",
    label: "New statement available",
    description: "Periodic statement notification with totals and gap fee.",
    variables: [
      { name: "parentName", description: "Parent's first name" },
      { name: "period", description: "Period range (e.g. \"1 May – 14 May\")" },
      { name: "totalFeesFormatted", description: "Total fees with $ prefix" },
      { name: "totalCcsFormatted", description: "CCS amount with $ prefix" },
      { name: "gapFeeFormatted", description: "Gap fee with $ prefix" },
    ],
  },
  {
    key: "parent.newMessageReply",
    category: "Parent",
    label: "New message reply",
    description: "Sent when staff replies to a parent's conversation.",
    variables: [
      { name: "parentName", description: "Parent's first name" },
      { name: "conversationSubject", description: "Original conversation subject" },
      { name: "staffName", description: "Replying staff member's name" },
      { name: "previewText", description: "First 200 chars of the reply" },
    ],
  },
  {
    key: "parent.newChildPost",
    category: "Parent",
    label: "New child post (observation / announcement)",
    description: "Sent when centre posts an observation, reminder, or announcement about a child.",
    variables: [
      { name: "parentName", description: "Parent's first name" },
      { name: "childList", description: "Child name(s), joined with \" & \"" },
      { name: "postTitle", description: "Post title / headline" },
      { name: "postType", description: "Title-cased post type (Observation / Reminder / Announcement)" },
      { name: "postTypeLower", description: "Same as postType but lowercase" },
    ],
  },
  // ── Enrolment ────────────────────────────────────────────
  {
    key: "enrolment.confirmation",
    category: "Notifications",
    label: "Enrolment received confirmation",
    description: "Sent to parents after they submit the enrolment form.",
    variables: [
      { name: "parentName", description: "Parent's first name" },
      { name: "childNames", description: "Comma-joined list of children being enrolled" },
    ],
  },
  {
    key: "enrolment.link",
    category: "Notifications",
    label: "Enrolment form link",
    description: "Sent to families to invite them to complete the enrolment form (pre-fill link).",
    variables: [
      { name: "parentName", description: "Parent's first name" },
      { name: "enrolUrl", description: "Pre-filled enrolment URL" },
    ],
  },
  {
    key: "parentPortal.magicLink",
    category: "Auth",
    label: "Parent portal magic link",
    description: "Sent to parents to log in to the parent portal (15-min single-use link).",
    variables: [
      { name: "name", description: "Parent's first name" },
      { name: "loginUrl", description: "Magic link URL (15 min TTL)" },
    ],
  },
  {
    key: "contracts.issued",
    category: "Notifications",
    label: "Contract issued",
    description: "Sent to staff when a new contract is issued for their acknowledgement.",
    variables: [
      { name: "name", description: "Staff member's first name" },
      { name: "contractName", description: "Contract template name" },
      { name: "portalUrl", description: "URL to the staff portal contract view" },
      { name: "pdfUrl", description: "Direct PDF download URL" },
    ],
  },
  // ── Reports ──────────────────────────────────────────────
  {
    key: "reports.boardReportDraft",
    category: "Notifications",
    label: "Board report draft notification",
    description: "Sent to admins on the 2nd of the month when the auto-generated board report draft is ready.",
    variables: [
      { name: "name", description: "Admin's first name" },
      { name: "monthName", description: "Long month name (e.g. April)" },
      { name: "year", description: "Year (e.g. 2026)" },
      { name: "reportUrl", description: "URL to the report review page" },
    ],
  },
  {
    key: "reports.pulseSurvey",
    category: "Notifications",
    label: "Monthly staff pulse survey invite",
    description: "Sent to staff at the start of each month inviting them to complete the pulse survey.",
    variables: [
      { name: "name", description: "Staff first name" },
      { name: "monthName", description: "Long month + year (e.g. April 2026)" },
      { name: "portalUrl", description: "URL to the survey form" },
    ],
  },
];

export function getEmailTemplateManifestEntry(
  key: string,
): EmailTemplateManifestEntry | null {
  return EMAIL_TEMPLATE_MANIFEST.find((e) => e.key === key) ?? null;
}

/**
 * Substitute `{{name}}` placeholders. Unknown placeholders are left as-is so
 * a partial / outdated override doesn't blank out a real variable.
 */
export function interpolateTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, k) =>
    Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : match,
  );
}
