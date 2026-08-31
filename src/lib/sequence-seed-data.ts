/**
 * Canonical definitions for the default email sequences (parent nurture +
 * CRM outreach). Shared by:
 *   - `prisma/seed.ts` — seeds these idempotently on every deploy so the
 *     sequence-based nurture system is guaranteed populated in production.
 *   - `POST /api/sequences/seed` — admin-triggered re-seed.
 *
 * Keep this as the single source of truth — the legacy ParentNurtureStep
 * template keys mirror these `templateKey`s, but the sequence system is now
 * the authoritative sender (see `src/lib/nurture-scheduler.ts`).
 */

export interface SeedStep {
  name: string;
  /** Hours after the enrolment anchor date. Negative = before (e.g. a day-before reminder). */
  delayHours: number;
  templateKey: string;
}

export interface SeedSequence {
  name: string;
  type: "parent_nurture" | "crm_outreach";
  triggerStage: string;
  steps: SeedStep[];
}

export const SEED_SEQUENCES: SeedSequence[] = [
  // ── Parent nurture sequences ──────────────────────────────
  {
    // The full enquiry→enrolment chain, triggered the moment an enquiry is
    // created — no manual stage move required. Website-channel enquiries skip
    // the 0h welcome (the website already sends an instant auto-response);
    // see WEBSITE_SKIP_TEMPLATE_KEYS in nurture-scheduler.ts. Later stage
    // moves (info_sent/nurturing) dedupe against these steps by templateKey.
    name: "New Enquiry Journey",
    type: "parent_nurture",
    triggerStage: "new_enquiry",
    steps: [
      { name: "Welcome", delayHours: 0, templateKey: "welcome" },
      { name: "CCS Assist", delayHours: 24, templateKey: "ccs_assist" },
      { name: "How to Enrol", delayHours: 48, templateKey: "how_to_enrol" },
      { name: "Nudge 1", delayHours: 120, templateKey: "nudge_1" },
      { name: "Nudge 2", delayHours: 216, templateKey: "nudge_2" },
      { name: "Final Nudge", delayHours: 336, templateKey: "final_nudge" },
    ],
  },
  {
    name: "Info Sent Follow-up",
    type: "parent_nurture",
    triggerStage: "info_sent",
    steps: [
      { name: "CCS Assist", delayHours: 24, templateKey: "ccs_assist" },
      { name: "Nudge 1", delayHours: 72, templateKey: "nudge_1" },
    ],
  },
  {
    name: "Nurturing Follow-up",
    type: "parent_nurture",
    triggerStage: "nurturing",
    steps: [
      { name: "Nudge 2", delayHours: 120, templateKey: "nudge_2" },
      { name: "Final Nudge", delayHours: 288, templateKey: "final_nudge" },
    ],
  },
  {
    name: "Form Support",
    type: "parent_nurture",
    triggerStage: "form_started",
    steps: [
      { name: "Form Support", delayHours: 4, templateKey: "form_support" },
    ],
  },
  {
    name: "First Session Onboarding",
    type: "parent_nurture",
    triggerStage: "first_session",
    steps: [
      { name: "Session Reminder", delayHours: -24, templateKey: "session_reminder" },
      { name: "Day 1 Check-in", delayHours: 24, templateKey: "day1_checkin" },
      { name: "Day 3 Check-in", delayHours: 72, templateKey: "day3_checkin" },
      { name: "Week 2 Feedback", delayHours: 336, templateKey: "week2_feedback" },
      { name: "Referral Invite", delayHours: 1080, templateKey: "month1_referral" },
      { name: "NPS Pulse", delayHours: 1440, templateKey: "nps_survey" },
    ],
  },
  // ── CRM outreach sequences ────────────────────────────────
  {
    name: "New School Introduction",
    type: "crm_outreach",
    triggerStage: "new_lead",
    steps: [
      { name: "Intro Email", delayHours: 0, templateKey: "school_intro" },
      { name: "Info Pack Follow-up", delayHours: 168, templateKey: "school_info_pack" },
      { name: "Check-in", delayHours: 336, templateKey: "school_checkin" },
    ],
  },
  {
    name: "Post-Meeting Follow-up",
    type: "crm_outreach",
    triggerStage: "meeting_booked",
    steps: [
      { name: "Thank You", delayHours: 24, templateKey: "meeting_thanks" },
      { name: "Proposal Check-in", delayHours: 168, templateKey: "proposal_checkin" },
      { name: "Decision Nudge", delayHours: 336, templateKey: "decision_nudge" },
    ],
  },
  {
    name: "Tender Follow-up",
    type: "crm_outreach",
    triggerStage: "submitted",
    steps: [
      { name: "Confirmation", delayHours: 0, templateKey: "tender_confirm" },
      { name: "Status Check-in", delayHours: 336, templateKey: "tender_checkin" },
      { name: "Final Follow-up", delayHours: 672, templateKey: "tender_final" },
    ],
  },
];
