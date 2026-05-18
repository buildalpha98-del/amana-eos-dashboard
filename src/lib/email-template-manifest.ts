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
  category:
    | "Auth"
    | "Waitlist"
    | "Notifications"
    | "Parent"
    | "Nurture"
    | "Retention";
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
  {
    key: "reports.boardReport",
    category: "Notifications",
    label: "Monthly board report send",
    description: "Sent to board recipients when an admin sends the finalised monthly report.",
    variables: [
      { name: "name", description: "Recipient's first name" },
      { name: "month", description: "Long month name (e.g. April)" },
      { name: "year", description: "Year (e.g. 2026)" },
      { name: "formattedRevenue", description: "Total revenue with $ prefix and AU formatting" },
      { name: "avgMargin", description: "Average margin percentage (integer)" },
      { name: "avgOccupancy", description: "Average BSC/ASC occupancy percentage" },
      { name: "activeStaff", description: "Count of active staff" },
      { name: "rocksOnTrack", description: "Count of rocks on-track or complete" },
      { name: "rocksTotal", description: "Total quarterly rocks" },
      { name: "executiveSummary", description: "Auto-generated executive summary paragraph" },
      { name: "viewReportButton", description: "Pre-rendered \"View Full Report\" CTA button HTML" },
    ],
  },
  {
    key: "notifications.complianceAdminSummary",
    category: "Notifications",
    label: "Daily compliance summary (admins)",
    description: "Daily cron email to owner/admin/head_office summarising certificate expiry counts.",
    variables: [
      { name: "expired", description: "Count of already-expired certificates" },
      { name: "due7d", description: "Count expiring within 7 days" },
      { name: "due14d", description: "Count expiring within 14 days" },
      { name: "due30d", description: "Count expiring within 30 days" },
      { name: "total", description: "Total certificates needing attention" },
      { name: "viewButton", description: "Pre-rendered \"View Compliance Dashboard\" CTA button HTML" },
    ],
  },
  // ── Notifications (assignment) ───────────────────────────
  {
    key: "notifications.todoAssigned",
    category: "Notifications",
    label: "To-do assigned",
    description: "Sent when a to-do is assigned to a staff member.",
    variables: [
      { name: "assigneeName", description: "Person who received the to-do" },
      { name: "todoTitle", description: "To-do title" },
      { name: "assignerName", description: "Person who assigned the to-do" },
    ],
  },
  {
    key: "notifications.rockAssigned",
    category: "Notifications",
    label: "Rock assigned",
    description: "Sent when a quarterly rock is assigned to a staff member.",
    variables: [
      { name: "assigneeName", description: "Person who received the rock" },
      { name: "rockTitle", description: "Rock title" },
      { name: "assignerName", description: "Person who assigned the rock" },
    ],
  },
  {
    key: "notifications.issueAssigned",
    category: "Notifications",
    label: "Issue assigned",
    description: "Sent when an issue is assigned to a staff member for resolution.",
    variables: [
      { name: "assigneeName", description: "Person who received the issue" },
      { name: "issueTitle", description: "Issue title" },
      { name: "assignerName", description: "Person who assigned the issue" },
    ],
  },
  // ── Nurture sequences (parent-facing marketing flow) ─────
  // Dispatched via TEMPLATE_MAP in /api/cron/nurture-send. A handful of
  // templates with conditional blocks (session reminder, exit survey, term
  // transition) remain hardcoded for now — listed here are the ones that
  // route through applyEmailTemplateOverride().
  {
    key: "nurture.welcome",
    category: "Nurture",
    label: "Nurture step 1 — welcome",
    description: "First marketing email after a parent submits an enquiry.",
    variables: [
      { name: "firstName", description: "Parent's first name" },
      { name: "centreName", description: "Centre name" },
    ],
  },
  {
    key: "nurture.ccsAssist",
    category: "Nurture",
    label: "Nurture step 2 — CCS assistance",
    description: "Sent 24h after the welcome explaining Child Care Subsidy eligibility.",
    variables: [
      { name: "firstName", description: "Parent's first name" },
      { name: "centreName", description: "Centre name" },
    ],
  },
  {
    key: "nurture.howToEnrol",
    category: "Nurture",
    label: "Nurture step 3 — How to enrol",
    description: "Sent 48h after info_sent. Walks parents through the 3-step enrolment form.",
    variables: [
      { name: "firstName", description: "Parent's first name" },
      { name: "centreName", description: "Centre name" },
      { name: "enrolUrl", description: "Enrolment form URL" },
      { name: "startButton", description: "Pre-rendered CTA button HTML" },
    ],
  },
  {
    key: "nurture.nudge1",
    category: "Nurture",
    label: "Nurture nudge 1 (info_sent +3d)",
    description: "Gentle re-engagement. Lists common questions and invites a reply.",
    variables: [
      { name: "firstName", description: "Parent's first name" },
      { name: "centreName", description: "Centre name" },
    ],
  },
  {
    key: "nurture.nudge2",
    category: "Nurture",
    label: "Nurture nudge 2 (nurturing +5d)",
    description: "Walks the parent through what a typical OSHC afternoon looks like.",
    variables: [
      { name: "firstName", description: "Parent's first name" },
      { name: "centreName", description: "Centre name" },
    ],
  },
  {
    key: "nurture.finalNudge",
    category: "Nurture",
    label: "Nurture final nudge (nurturing +12d)",
    description: "Last email in the enquiry-stage flow. Soft sign-off, invites return whenever they're ready.",
    variables: [
      { name: "firstName", description: "Parent's first name" },
      { name: "centreName", description: "Centre name" },
    ],
  },
  {
    key: "nurture.formSupport",
    category: "Nurture",
    label: "Nurture form support (form_started +4h)",
    description: "Sent shortly after a parent starts the enrolment form. Offers help if they get stuck.",
    variables: [
      { name: "firstName", description: "Parent's first name" },
      { name: "centreName", description: "Centre name" },
    ],
  },
  {
    key: "nurture.formAbandonment",
    category: "Nurture",
    label: "Nurture form abandonment (form_started +3d)",
    description: "Sent when an enrolment form has been started but not finished. Lists common blockers and a continue CTA.",
    variables: [
      { name: "firstName", description: "Parent's first name" },
      { name: "centreName", description: "Centre name" },
      { name: "enrolUrl", description: "Pre-filled enrolment URL" },
      { name: "continueButton", description: "Pre-rendered \"Continue Your Enrolment\" CTA button HTML" },
    ],
  },
  {
    key: "nurture.whatToBring",
    category: "Nurture",
    label: "Nurture what-to-bring (first_session 0d)",
    description: "Sent the morning of the first session. Quick packing checklist + drop-off tips.",
    variables: [
      { name: "firstName", description: "Parent's first name" },
      { name: "centreName", description: "Centre name" },
    ],
  },
  {
    key: "nurture.day1Checkin",
    category: "Nurture",
    label: "Nurture day-1 check-in (first_session +1d)",
    description: "Sent the day after the first session asking how things went and offering a chat if needed.",
    variables: [
      { name: "firstName", description: "Parent's first name" },
      { name: "centreName", description: "Centre name" },
    ],
  },
  {
    key: "nurture.day3Checkin",
    category: "Nurture",
    label: "Nurture day-3 check-in (first_session +3d)",
    description: "Mid-week check-in normalising settling-in struggles and inviting questions.",
    variables: [
      { name: "firstName", description: "Parent's first name" },
      { name: "centreName", description: "Centre name" },
    ],
  },
  {
    key: "nurture.appSetup",
    category: "Nurture",
    label: "Nurture app setup (first_session +5d)",
    description: "Walks the parent through downloading OWNA and linking their child's profile.",
    variables: [
      { name: "firstName", description: "Parent's first name" },
      { name: "centreName", description: "Centre name" },
    ],
  },
  {
    key: "nurture.firstWeek",
    category: "Nurture",
    label: "Nurture first-week recap (first_session +7d)",
    description: "End-of-first-week recap with a few highlights from the centre's typical week.",
    variables: [
      { name: "firstName", description: "Parent's first name" },
      { name: "centreName", description: "Centre name" },
    ],
  },
  {
    key: "nurture.week2Feedback",
    category: "Nurture",
    label: "Nurture week-2 feedback (first_session +14d)",
    description: "Asks for quick feedback after two weeks. Door is open for any concerns.",
    variables: [
      { name: "firstName", description: "Parent's first name" },
      { name: "centreName", description: "Centre name" },
    ],
  },
  {
    key: "nurture.npsSurvey",
    category: "Nurture",
    label: "Nurture NPS survey (first_session +30d)",
    description: "30-day anonymous rating prompt with a single-tap CTA.",
    variables: [
      { name: "firstName", description: "Parent's first name" },
      { name: "centreName", description: "Centre name" },
      { name: "surveyUrl", description: "Anonymous rating form URL" },
      { name: "ratingButton", description: "Pre-rendered \"Share Your Rating\" CTA button HTML" },
    ],
  },
  {
    key: "nurture.month1Referral",
    category: "Nurture",
    label: "Nurture month-1 referral ask (first_session +45d)",
    description: "Soft referral ask after the first settled month, with a clear invite to refer friends.",
    variables: [
      { name: "firstName", description: "Parent's first name" },
      { name: "centreName", description: "Centre name" },
    ],
  },
  // ── Retention (existing-family lifecycle) ────────────────
  {
    key: "retention.casualReengage",
    category: "Retention",
    label: "Retention casual re-engage (no bookings 30d)",
    description: "Sent to casual families who haven't booked in 30+ days. Soft re-engagement.",
    variables: [
      { name: "firstName", description: "Parent's first name" },
      { name: "centreName", description: "Centre name" },
    ],
  },
  {
    key: "retention.withdrawalIntercept",
    category: "Retention",
    label: "Retention withdrawal intercept",
    description: "Sent when a family signals they're leaving. Offers a chat before things finalise.",
    variables: [
      { name: "firstName", description: "Parent's first name" },
      { name: "centreName", description: "Centre name" },
    ],
  },
  {
    key: "retention.dayChangeReminder",
    category: "Retention",
    label: "Retention booking-day check-in",
    description: "Periodic prompt asking if current booking days still suit the family.",
    variables: [
      { name: "firstName", description: "Parent's first name" },
      { name: "centreName", description: "Centre name" },
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
