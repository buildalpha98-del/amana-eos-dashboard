/**
 * One-off: send every parent-facing nurture email to Jayden's inbox for
 * copy review. Subjects are prefixed [TEST n/13] in journey order.
 *
 * Run: npx tsx --env-file=.env.local scripts/send-test-nurture-emails.ts
 */
import { Resend } from "resend";
import {
  nurtureWelcomeEmail,
  nurtureCcsAssistEmail,
  nurtureHowToEnrolEmail,
  nurtureNudge1Email,
  nurtureNudge2Email,
  nurtureFinalNudgeEmail,
  nurtureFormSupportEmail,
  nurtureFormAbandonmentEmail,
  nurtureSessionReminderEmail,
  nurtureDay1CheckinEmail,
  nurtureDay3CheckinEmail,
  nurtureWeek2FeedbackEmail,
  nurtureMonth1ReferralEmail,
  nurtureNpsSurveyEmail,
} from "../src/lib/email-templates/nurture";

const TO = "jayden@amanaoshc.com.au";
const FROM = process.env.EMAIL_FROM || "Amana OSHC <noreply@amanaoshc.com.au>";
const FIRST_NAME = "Jayden";
const CENTRE = "Amana OSHC MFIS Greenacre";
// Real sends use the prefilled per-enquiry link /enrol/<enquiryId>
const ENROL_URL = "https://amanaoshc.company/enrol";
// Real sends build this per contact; tests use MFIS Greenacre with prefill so
// the button lands on the live smiley form.
const FEEDBACK_URL = `https://amanaoshc.company/survey/feedback/cmnk77pua000wobx41hjy2oxi?name=${encodeURIComponent(FIRST_NAME)}&email=${encodeURIComponent(TO)}`;

async function main() {
  const resend = new Resend(process.env.RESEND_API_KEY);
  if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY not set");

  const emails: Array<{ tag: string; t: Promise<{ subject: string; html: string }> | { subject: string; html: string } }> = [
    { tag: "Day 0 · welcome", t: nurtureWelcomeEmail(FIRST_NAME, CENTRE, ENROL_URL) },
    { tag: "Day 1 · ccs_assist", t: nurtureCcsAssistEmail(FIRST_NAME, CENTRE) },
    { tag: "Day 2 · how_to_enrol", t: nurtureHowToEnrolEmail(FIRST_NAME, CENTRE, ENROL_URL) },
    { tag: "Day 5 · nudge_1", t: nurtureNudge1Email(FIRST_NAME, CENTRE, ENROL_URL) },
    { tag: "Day 9 · nudge_2", t: nurtureNudge2Email(FIRST_NAME, CENTRE, ENROL_URL) },
    { tag: "Day 14 · final_nudge", t: nurtureFinalNudgeEmail(FIRST_NAME, CENTRE, ENROL_URL) },
    { tag: "form started +4h · form_support", t: nurtureFormSupportEmail(FIRST_NAME, CENTRE, ENROL_URL) },
    { tag: "form started +3d · form_abandonment", t: nurtureFormAbandonmentEmail(FIRST_NAME, CENTRE, ENROL_URL) },
    {
      tag: "day before 1st session · session_reminder",
      t: nurtureSessionReminderEmail(FIRST_NAME, CENTRE, "405 Waterloo Rd, Greenacre NSW 2190"),
    },
    { tag: "1st session +1d · day1_checkin", t: nurtureDay1CheckinEmail(FIRST_NAME, CENTRE) },
    { tag: "1st session +3d · day3_checkin", t: nurtureDay3CheckinEmail(FIRST_NAME, CENTRE) },
    { tag: "week 2 · week2_feedback", t: nurtureWeek2FeedbackEmail(FIRST_NAME, CENTRE, undefined, FEEDBACK_URL) },
    { tag: "month 1 · month1_referral", t: nurtureMonth1ReferralEmail(FIRST_NAME, CENTRE) },
    { tag: "bonus · nps_survey", t: nurtureNpsSurveyEmail(FIRST_NAME, CENTRE, undefined, FEEDBACK_URL) },
  ];

  let n = 0;
  for (const { tag, t } of emails) {
    n += 1;
    const { subject, html: rawHtml } = await t;
    // Real sends substitute the contact-specific preferences URL; tests get a sample.
    const html = rawHtml
      .split("{{UNSUBSCRIBE_URL}}")
      .join("https://amanaoshc.company/notifications/preferences/sample?token=test");
    const res = await resend.emails.send({
      from: FROM,
      to: [TO],
      subject: `[TEST ${n}/${emails.length} — ${tag}] ${subject}`,
      html,
    });
    if (res.error) {
      console.error(`${n}. FAILED ${tag}:`, res.error);
    } else {
      console.log(`${n}. sent ${tag} (${res.data?.id})`);
    }
    // Resend rate limit headroom
    await new Promise((r) => setTimeout(r, 700));
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
