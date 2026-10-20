/**
 * The parent journey, stage by stage: every email a family can receive,
 * when it goes, and whether it's live. Drives the Parent journey page
 * (/parent-journey) — previews, test sends and "edit wording" links.
 *
 * Client-safe (no prisma). Keep in step with the real senders:
 *   - sequences: src/lib/sequence-seed-data.ts (sent by cron nurture-send)
 *   - receipt:   POST /api/parent/enrolment-draft/submit
 *   - welcome:   PATCH /api/enrolments/[id] → src/lib/enrolment-welcome.ts
 */

export type JourneyEmailStatus = "live" | "new" | "planned" | "manual";

export interface JourneyEmail {
  /** Preview id (see /api/parent-journey/preview). Absent = no preview yet. */
  id?: string;
  name: string;
  when: string;
  status: JourneyEmailStatus;
  /** Sequence templateKey, for sent/pending counts. */
  templateKey?: string;
  /** Settings → Email Templates key, when the wording is editable there. */
  overrideKey?: string;
  /** Centre-specific details come from the service's Content tab. */
  usesCentreContent?: boolean;
  note?: string;
}

export interface JourneyStage {
  key: string;
  title: string;
  description: string;
  emails: JourneyEmail[];
}

export const PARENT_JOURNEY: JourneyStage[] = [
  {
    key: "enquired",
    title: "1. Enquired",
    description: "A family enquires (website, phone, walk-in) but hasn't started the form.",
    emails: [
      { id: "welcome", templateKey: "welcome", overrideKey: "nurture.welcome", name: "Welcome", when: "Straight away (not for website enquiries — the website replies itself)", status: "live" },
      { id: "ccs_assist", templateKey: "ccs_assist", overrideKey: "nurture.ccsAssist", name: "CCS help", when: "Day 1", status: "live" },
      { id: "how_to_enrol", templateKey: "how_to_enrol", overrideKey: "nurture.howToEnrol", name: "How to enrol", when: "Day 2", status: "live" },
      { id: "nudge_1", templateKey: "nudge_1", overrideKey: "nurture.nudge1", name: "Anything we can help with?", when: "Day 5", status: "live" },
      { id: "nudge_2", templateKey: "nudge_2", overrideKey: "nurture.nudge2", name: "A peek inside our day", when: "Day 9", status: "live" },
      { id: "final_nudge", templateKey: "final_nudge", overrideKey: "nurture.finalNudge", name: "Last email — your spot's still here", when: "Day 14", status: "live" },
      { name: "Call within the hour (staff)", when: "Straight away — the centre gets an in-app + push alert", status: "new" },
    ],
  },
  {
    key: "form_started",
    title: "2. Started the form",
    description: "They've begun the enrolment form and picked their school, but haven't submitted. Everything here stops the moment they submit.",
    emails: [
      { id: "form_support", templateKey: "form_support", overrideKey: "nurture.formSupport", name: "Stuck on the form?", when: "4 hours after starting", status: "live" },
      { id: "form_abandonment", templateKey: "form_abandonment", overrideKey: "nurture.formAbandonment", name: "Still saving your spot — finish it together", when: "3 days after starting", status: "new" },
      { name: "Call list for the centre (staff)", when: "After 4 days without progress", status: "new", note: "Enrolments → Follow-ups: phone number, where they stopped, \"Email a reminder\" and \"We called them\"." },
    ],
  },
  {
    key: "submitted",
    title: "3. Submitted",
    description: "The form is in. Our team reviews it and promises to get back within 24 hours.",
    emails: [
      { id: "enrolment_received", name: "We've received your enrolment", when: "Straight away", status: "live" },
      { name: "Alert to the centre + head office (staff)", when: "Straight away — in the dashboard, by push, and to the centre's mailbox", status: "new" },
      { name: "24-hour reply clock (staff)", when: "Reminder at 20 hours; head office told at 24 hours", status: "new", note: "Countdown on Enrolments → Follow-ups until it's marked contacted." },
    ],
  },
  {
    key: "approved",
    title: "4. Approved",
    description: "Staff approve the enrolment. One email — it replaces the old plain \"enrolment confirmed\" email.",
    emails: [
      { id: "enrolment_welcome", overrideKey: "parent.enrolmentWelcome", usesCentreContent: true, name: "Welcome to Amana OSHC (school-specific)", when: "Once, when the enrolment is approved", status: "new", note: "Coordinator, first-session tips, welcome pack, next 3 weeks of activities, extra days, OWNA & CCS steps." },
    ],
  },
  {
    key: "owna",
    title: "5. Getting into OWNA",
    description: "Sent when staff tick the OWNA checklist on the enrolment — so the family always knows the next step. Staff can untick \"Email the family\".",
    emails: [
      { id: "owna_invitation", overrideKey: "parent.ownaInvitation", usesCentreContent: true, name: "Your OWNA invitation is on its way (4-step guide)", when: "When \"Invitation sent\" is ticked", status: "new" },
      { id: "owna_existing", overrideKey: "parent.ownaExisting", usesCentreContent: true, name: "You're all set in OWNA", when: "When \"Existing OWNA access\" is ticked", status: "new" },
      { id: "owna_nudge", overrideKey: "parent.ownaNudge", usesCentreContent: true, name: "Did your OWNA invitation arrive?", when: "3 days after the invitation, if they haven't got in (centre alerted too)", status: "new" },
      { id: "first_day_confirmed", overrideKey: "parent.firstDayConfirmed", usesCentreContent: true, name: "You're booked in! First day confirmed", when: "When \"First sessions confirmed\" is ticked with the date", status: "new", note: "Also re-times the day-before reminder and check-ins to that real date." },
      { id: "casual_bookings", overrideKey: "parent.casualBookings", usesCentreContent: true, name: "You're all set to book (casual bookings)", when: "When \"First sessions confirmed\" is ticked as casual bookings only", status: "new", note: "How to book in OWNA or by email, with the welcome pack attached." },
      { id: "centre_first_day", name: "To the centre: booked in, first day + Proven Process", when: "When \"First sessions confirmed\" is ticked with the date — goes to the centre's email, not the family", status: "new", note: "Sent even if \"Email the family\" is unticked. The Amana Proven Process is attached." },
      { name: "OWNA setup list for staff", when: "Enrolments → Follow-ups, until the checklist is done", status: "new" },
    ],
  },
  {
    key: "first_session",
    title: "6. First sessions",
    description: "Timed from the day the child actually first attends (OWNA sign-ins), else the first day staff confirm, else the form's start date. \"How did day one go?\" and the later check-ins wait until the child has really attended.",
    emails: [
      { id: "session_reminder", templateKey: "session_reminder", name: "Tomorrow's the big day!", when: "Day before the start date", status: "live" },
      { id: "day1_checkin", templateKey: "day1_checkin", overrideKey: "nurture.day1Checkin", name: "How did day one go? (+ SMS)", when: "Day after the start date", status: "live" },
      { id: "day3_checkin", templateKey: "day3_checkin", overrideKey: "nurture.day3Checkin", name: "Getting into the groove", when: "3 days after", status: "live" },
      { id: "week2_feedback", templateKey: "week2_feedback", overrideKey: "nurture.week2Feedback", name: "Two weeks in — feedback", when: "2 weeks after", status: "live" },
      { id: "no_show", overrideKey: "parent.noShow", usesCentreContent: true, name: "Is anything stopping you? (one-tap answers)", when: "14 days after approval with no sessions attended", status: "new", note: "Their answer goes straight to the centre. Only at centres whose OWNA sync is running." },
      { name: "Unhappy feedback alert (staff)", when: "A 1–2 out of 5 on the feedback form → centre + head office; a 3 with a comment → centre", status: "new", note: "The check-in emails link to this form." },
      { id: "extra_day", overrideKey: "parent.extraDay", usesCentreContent: true, name: "Fancy an extra day? (+ what's on next week)", when: "3 weeks after the child's first actual session", status: "new" },
    ],
  },
  {
    key: "settled",
    title: "7. Settled in",
    description: "The longer-term touches.",
    emails: [
      { id: "missed_sessions", overrideKey: "parent.missedSessions", usesCentreContent: true, name: "We've missed Yusuf! (gentle check-in)", when: "A regular hasn't been in for 14 days of term", status: "new", note: "Only children with regular booked days, never across holidays, only when OWNA data is complete. \"No need to reply\"; answers go to the centre." },
      { id: "month1_referral", templateKey: "month1_referral", overrideKey: "nurture.month1Referral", name: "Know another family? A free day each", when: "About 6 weeks after starting", status: "live" },
      { id: "nps_survey", templateKey: "nps_survey", overrideKey: "nurture.npsSurvey", name: "Would you recommend us?", when: "About 2 months after starting", status: "live" },
    ],
  },
  {
    key: "leaving",
    title: "8. Leaving",
    description: "Sent by staff when a family withdraws.",
    emails: [
      { id: "exit_survey", name: "We'll miss your family (exit survey)", when: "When staff record a withdrawal", status: "manual" },
    ],
  },
];

export const PREVIEWABLE_EMAIL_IDS = PARENT_JOURNEY.flatMap((s) => s.emails.map((e) => e.id).filter(Boolean)) as string[];
