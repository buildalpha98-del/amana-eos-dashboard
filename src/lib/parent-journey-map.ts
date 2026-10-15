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
    ],
  },
  {
    key: "form_started",
    title: "2. Started the form",
    description: "They've begun the enrolment form and picked their school, but haven't submitted. Everything here stops the moment they submit.",
    emails: [
      { id: "form_support", templateKey: "form_support", overrideKey: "nurture.formSupport", name: "Stuck on the form?", when: "4 hours after starting", status: "live" },
      { id: "form_abandonment", templateKey: "form_abandonment", overrideKey: "nurture.formAbandonment", name: "Still saving your spot — finish it together", when: "3 days after starting", status: "new" },
      { name: "Call list for the centre", when: "After 7 days", status: "planned", note: "Families still unfinished show up for a phone call." },
    ],
  },
  {
    key: "submitted",
    title: "3. Submitted",
    description: "The form is in. Our team reviews it and promises to get back within 24 hours.",
    emails: [
      { id: "enrolment_received", name: "We've received your enrolment", when: "Straight away", status: "live" },
      { name: "Staff alert + 24-hour countdown", when: "Straight away (to the centre and head office)", status: "planned" },
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
    key: "first_session",
    title: "5. First sessions",
    description: "Timed from the start date the family chose on the form.",
    emails: [
      { id: "session_reminder", templateKey: "session_reminder", name: "Tomorrow's the big day!", when: "Day before the start date", status: "live" },
      { id: "day1_checkin", templateKey: "day1_checkin", overrideKey: "nurture.day1Checkin", name: "How did day one go? (+ SMS)", when: "Day after the start date", status: "live" },
      { id: "day3_checkin", templateKey: "day3_checkin", overrideKey: "nurture.day3Checkin", name: "Getting into the groove", when: "3 days after", status: "live" },
      { id: "week2_feedback", templateKey: "week2_feedback", overrideKey: "nurture.week2Feedback", name: "Two weeks in — feedback", when: "2 weeks after", status: "live" },
      { name: "Haven't started yet? What's stopping you?", when: "14 days after approval with no sessions attended", status: "planned", note: "Needs attendance matched to each child from OWNA." },
      { name: "Add an extra day", when: "Week 3, families who are attending", status: "planned" },
    ],
  },
  {
    key: "settled",
    title: "6. Settled in",
    description: "The longer-term touches.",
    emails: [
      { id: "month1_referral", templateKey: "month1_referral", overrideKey: "nurture.month1Referral", name: "Know another family? A free day each", when: "About 6 weeks after starting", status: "live" },
      { id: "nps_survey", templateKey: "nps_survey", overrideKey: "nurture.npsSurvey", name: "Would you recommend us?", when: "About 2 months after starting", status: "live" },
    ],
  },
  {
    key: "leaving",
    title: "7. Leaving",
    description: "Sent by staff when a family withdraws.",
    emails: [
      { id: "exit_survey", name: "We'll miss your family (exit survey)", when: "When staff record a withdrawal", status: "manual" },
    ],
  },
];

export const PREVIEWABLE_EMAIL_IDS = PARENT_JOURNEY.flatMap((s) => s.emails.map((e) => e.id).filter(Boolean)) as string[];
