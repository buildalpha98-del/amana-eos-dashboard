/**
 * Parent nurture sequence email templates.
 */

import { baseLayout, buttonHtml } from "./base";

// ─── Parent Nurture: Welcome ────────────────────────────────

export function nurtureWelcomeEmail(firstName: string, centreName: string) {
  const subject = `Welcome to ${centreName} — Amana OSHC`;
  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Welcome to ${centreName}!
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 8px;color:#6b7280;font-size:14px;line-height:1.6;">
      We're so excited to have your family join us at ${centreName}. Our team is here to make sure your child
      has a safe, fun, and enriching experience in Before and After School Care.
    </p>
    <p style="margin:0 0 8px;color:#6b7280;font-size:14px;line-height:1.6;">
      Over the next couple of weeks, we'll send you a few helpful emails to get you settled in — from
      enrolment tips to what to pack and how to set up the parent app.
    </p>
    <p style="margin:0 0 8px;color:#6b7280;font-size:14px;line-height:1.6;">
      If you have any questions in the meantime, don't hesitate to reach out to our centre team. We're
      always happy to help!
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;background-color:#f0fdf4;">
      <tr>
        <td style="padding:16px;">
          <p style="margin:0;color:#065f46;font-size:14px;font-weight:600;">
            What's coming up:
          </p>
          <p style="margin:8px 0 0;color:#047857;font-size:13px;line-height:1.8;">
            1. How to complete your enrolment<br/>
            2. What to bring on your first day<br/>
            3. Setting up the parent app<br/>
            4. Your first week guide
          </p>
        </td>
      </tr>
    </table>
    <p style="margin:0;color:#6b7280;font-size:14px;line-height:1.6;">
      Warm regards,<br/>
      <strong>The ${centreName} Team</strong>
    </p>
  `);
  return { subject, html };
}

// ─── Parent Nurture: How to Enrol ───────────────────────────

export function nurtureHowToEnrolEmail(firstName: string, centreName: string) {
  const subject = `How to complete your enrolment — ${centreName}`;
  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Completing Your Enrolment
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 8px;color:#6b7280;font-size:14px;line-height:1.6;">
      Ready to lock in your child's spot? Here's how to complete the enrolment process:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <tr>
        <td style="padding:16px;background-color:#f9fafb;">
          <p style="margin:0 0 12px;color:#111827;font-size:14px;font-weight:600;">Step 1: Complete the enrolment form</p>
          <p style="margin:0 0 4px;color:#6b7280;font-size:13px;line-height:1.6;">
            Fill in your child's details, emergency contacts, medical information, and authorised pick-up people.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:16px;border-top:1px solid #e5e7eb;">
          <p style="margin:0 0 12px;color:#111827;font-size:14px;font-weight:600;">Step 2: Submit your CCS details</p>
          <p style="margin:0 0 4px;color:#6b7280;font-size:13px;line-height:1.6;">
            If you're eligible for the Child Care Subsidy, make sure your CRN (Customer Reference Number)
            and date of birth are included so we can process your subsidy.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:16px;border-top:1px solid #e5e7eb;">
          <p style="margin:0 0 12px;color:#111827;font-size:14px;font-weight:600;">Step 3: Choose your booking days</p>
          <p style="margin:0 0 4px;color:#6b7280;font-size:13px;line-height:1.6;">
            Select the days and sessions (Before School Care, After School Care, or both) that suit your family.
          </p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 8px;color:#6b7280;font-size:14px;line-height:1.6;">
      If you need help at any stage, just reply to this email or call the centre — we're here for you.
    </p>
    <p style="margin:16px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
      Warm regards,<br/>
      <strong>The ${centreName} Team</strong>
    </p>
  `);
  return { subject, html };
}

// ─── Parent Nurture: What to Bring ──────────────────────────

export function nurtureWhatToBringEmail(firstName: string, centreName: string) {
  const subject = `What to bring to ${centreName} — Amana OSHC`;
  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      What to Bring
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 8px;color:#6b7280;font-size:14px;line-height:1.6;">
      Getting ready for your child's first day? Here's a handy checklist of what to pack:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;background-color:#f9fafb;">
      <tr>
        <td style="padding:16px;">
          <p style="margin:0 0 8px;color:#111827;font-size:14px;font-weight:600;">Daily essentials:</p>
          <p style="margin:0;color:#6b7280;font-size:13px;line-height:2;">
            &#10003; Labelled water bottle<br/>
            &#10003; Labelled hat (broad-brimmed or legionnaire)<br/>
            &#10003; A healthy snack or afternoon tea<br/>
            &#10003; Comfortable clothes suitable for active play<br/>
            &#10003; A change of clothes (especially for younger children)<br/>
            &#10003; Sunscreen applied before arrival
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:16px;border-top:1px solid #e5e7eb;">
          <p style="margin:0 0 8px;color:#111827;font-size:14px;font-weight:600;">Good to know:</p>
          <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.8;">
            &#8226; We provide breakfast during BSC and a light snack during ASC<br/>
            &#8226; Please label all belongings with your child's name<br/>
            &#8226; Leave valuables and electronics at home unless needed for homework
          </p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 8px;color:#6b7280;font-size:14px;line-height:1.6;">
      We can't wait to see your child at the centre!
    </p>
    <p style="margin:16px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
      Warm regards,<br/>
      <strong>The ${centreName} Team</strong>
    </p>
  `);
  return { subject, html };
}

// ─── Parent Nurture: App Setup ──────────────────────────────

export function nurtureAppSetupEmail(firstName: string, centreName: string) {
  const subject = `Set up the parent app — ${centreName}`;
  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Setting Up the Parent App
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 8px;color:#6b7280;font-size:14px;line-height:1.6;">
      Stay connected with ${centreName} through our parent app. You'll be able to:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <tr>
        <td style="padding:16px;background-color:#eff6ff;">
          <p style="margin:0;color:#1e40af;font-size:13px;line-height:2;">
            &#10003; View your child's daily activities and updates<br/>
            &#10003; Manage bookings and view your schedule<br/>
            &#10003; Receive important notifications from the centre<br/>
            &#10003; Update your family details and contacts<br/>
            &#10003; View statements and payment history
          </p>
        </td>
      </tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;background-color:#f9fafb;">
      <tr>
        <td style="padding:16px;">
          <p style="margin:0 0 8px;color:#111827;font-size:14px;font-weight:600;">How to get started:</p>
          <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.8;">
            1. Download the OWNA app from the App Store or Google Play<br/>
            2. Create your account using the email you enrolled with<br/>
            3. Follow the prompts to link your child's profile
          </p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 8px;color:#6b7280;font-size:14px;line-height:1.6;">
      If you run into any issues, our team at the centre can help you get set up.
    </p>
    <p style="margin:16px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
      Warm regards,<br/>
      <strong>The ${centreName} Team</strong>
    </p>
  `);
  return { subject, html };
}

// ─── Parent Nurture: First Week Guide ───────────────────────

export function nurtureFirstWeekEmail(firstName: string, centreName: string) {
  const subject = `Your first week guide — ${centreName}`;
  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Your First Week Guide
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 8px;color:#6b7280;font-size:14px;line-height:1.6;">
      Your child's first week is an exciting time! Here are some tips to help everything go smoothly:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <tr>
        <td style="padding:16px;background-color:#fefce8;border-bottom:1px solid #e5e7eb;">
          <p style="margin:0 0 4px;color:#854d0e;font-size:14px;font-weight:600;">Before School Care (BSC)</p>
          <p style="margin:0;color:#713f12;font-size:13px;line-height:1.6;">
            Drop-off is from 6:30am. We provide a light breakfast, then walk children to their classrooms
            before the school bell.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:16px;background-color:#f0fdf4;border-bottom:1px solid #e5e7eb;">
          <p style="margin:0 0 4px;color:#065f46;font-size:14px;font-weight:600;">After School Care (ASC)</p>
          <p style="margin:0;color:#047857;font-size:13px;line-height:1.6;">
            We collect children from their classrooms. Pick-up is available until 6:00pm. We provide
            afternoon tea and a mix of structured activities and free play.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:16px;background-color:#eff6ff;">
          <p style="margin:0 0 4px;color:#1e40af;font-size:14px;font-weight:600;">Tips for a great start</p>
          <p style="margin:0;color:#1e3a5f;font-size:13px;line-height:1.8;">
            &#8226; Talk to your child about what to expect — it helps them feel prepared<br/>
            &#8226; Arrive a few minutes early on the first day so they can settle in<br/>
            &#8226; Let our educators know about any special needs, allergies, or routines<br/>
            &#8226; Don't worry if there are a few tears — our team is experienced and caring
          </p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 8px;color:#6b7280;font-size:14px;line-height:1.6;">
      We're here to support your family every step of the way. Welcome to the Amana OSHC community!
    </p>
    <p style="margin:16px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
      Warm regards,<br/>
      <strong>The ${centreName} Team</strong>
    </p>
  `);
  return { subject, html };
}

// ─── Parent Nurture: NPS Survey (Day 30) ─────────────────────

export function nurtureNpsSurveyEmail(firstName: string, centreName: string) {
  const surveyUrl = process.env.NPS_SURVEY_URL || "https://eos.amanaoshc.com.au/survey/nps";
  const subject = `How are things going? — ${centreName}`;
  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      We'd Love Your Feedback
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      It's been about a month since your child started at Amana OSHC ${centreName}.
      We'd love to hear how things are going! Please take 30 seconds to share your feedback
      — it helps us improve the experience for every family.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;background-color:#f0fdf4;">
      <tr>
        <td style="padding:20px;text-align:center;">
          <p style="margin:0 0 4px;color:#065f46;font-size:16px;font-weight:700;">
            One quick question
          </p>
          <p style="margin:0;color:#047857;font-size:13px;">
            How likely are you to recommend Amana OSHC to a friend? (0–10)
          </p>
        </td>
      </tr>
    </table>
    ${buttonHtml("Share Your Feedback", surveyUrl)}
    <p style="margin:16px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
      Your response is anonymous and takes less than a minute. Thank you for being part of the
      Amana OSHC community!
    </p>
    <p style="margin:16px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
      Warm regards,<br/>
      <strong>The ${centreName} Team</strong>
    </p>
  `);
  return { subject, html };
}

// ─── Enquiry Nurture Templates ─────────────────────────────────

export function nurtureCcsAssistEmail(firstName: string, centreName: string) {
  const subject = `Understanding Child Care Subsidy — ${centreName}`;
  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Did You Know About the Child Care Subsidy?
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Many families at ${centreName} pay significantly less than the listed fee thanks to the
      Child Care Subsidy (CCS). Depending on your household income, the government may cover
      up to 90% of session fees.
    </p>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Our team can help you understand your estimated out-of-pocket costs.
      Feel free to reply to this email or call the centre — we're happy to walk you through it.
    </p>
    <p style="margin:16px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
      Warm regards,<br/>
      <strong>The ${centreName} Team</strong>
    </p>
  `);
  return { subject, html };
}

export function nurtureNudge1Email(firstName: string, centreName: string) {
  const subject = `Just checking in — ${centreName}`;
  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      We're Here to Help
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      We sent through some information about our programmes at ${centreName} a few days ago
      and wanted to check if you had any questions. Whether it's about daily routines or costs
      — we're happy to chat. Simply reply to this email or give us a call.
    </p>
    <p style="margin:16px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
      Warm regards,<br/>
      <strong>The ${centreName} Team</strong>
    </p>
  `);
  return { subject, html };
}

export function nurtureFormSupportEmail(firstName: string, centreName: string) {
  const subject = `Need help with the enrolment form? — ${centreName}`;
  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      We Can Help You Complete the Form
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      We noticed you've started the enrolment form for ${centreName} — great to see! If you need
      any help completing it, our team is here. We can walk you through it over the phone or via
      WhatsApp. Just reply and we'll arrange a time.
    </p>
    <p style="margin:16px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
      Warm regards,<br/>
      <strong>The ${centreName} Team</strong>
    </p>
  `);
  return { subject, html };
}

export function nurtureNudge2Email(firstName: string, centreName: string) {
  const subject = `Still thinking it over? — ${centreName}`;
  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      We'd Love to Welcome Your Family
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      We understand choosing the right OSHC programme is an important decision. If there's anything
      holding you back, please don't hesitate to reach out. We're happy to arrange a visit so you
      can see ${centreName} in action.
    </p>
    <p style="margin:16px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
      Warm regards,<br/>
      <strong>The ${centreName} Team</strong>
    </p>
  `);
  return { subject, html };
}

export function nurtureFinalNudgeEmail(firstName: string, centreName: string) {
  const subject = `One last note from ${centreName}`;
  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      We're Here When You're Ready
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      We won't keep sending messages, but please know our door is always open at ${centreName}.
      If your plans change, you can reach us anytime by replying to this email or calling the centre.
    </p>
    <p style="margin:16px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
      Warm regards,<br/>
      <strong>The ${centreName} Team</strong>
    </p>
  `);
  return { subject, html };
}

export function nurtureDay1CheckinEmail(firstName: string, centreName: string) {
  const subject = `How was the first day? — ${centreName}`;
  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Hope Day One Went Well!
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      We hope your child had a wonderful first day at ${centreName}! If you have any questions
      or feedback, please don't hesitate to reach out.
    </p>
    <p style="margin:16px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
      Warm regards,<br/>
      <strong>The ${centreName} Team</strong>
    </p>
  `);
  return { subject, html };
}

export function nurtureDay3CheckinEmail(firstName: string, centreName: string) {
  const subject = `Settling in well? — ${centreName}`;
  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Quick Check-In
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      It's been a few days since your child started at ${centreName}, and we wanted to check in.
      Is everything going well? Let us know if there's anything we can do to make the transition smoother.
    </p>
    <p style="margin:16px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
      Warm regards,<br/>
      <strong>The ${centreName} Team</strong>
    </p>
  `);
  return { subject, html };
}

export function nurtureWeek2FeedbackEmail(firstName: string, centreName: string) {
  const subject = `Two weeks in — how's it going? — ${centreName}`;
  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      We'd Love Your Feedback
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      It's been two weeks since your child started at ${centreName}! Your feedback helps us improve
      the experience for every family. Simply reply to this email with your thoughts.
    </p>
    <p style="margin:16px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
      Warm regards,<br/>
      <strong>The ${centreName} Team</strong>
    </p>
  `);
  return { subject, html };
}

export function nurtureMonth1ReferralEmail(firstName: string, centreName: string) {
  const subject = `Know a family who'd love ${centreName}?`;
  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Refer a Friend, Earn a Reward
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      If you know another family who might benefit from our OSHC programmes at ${centreName},
      we offer a <strong>$50 referral reward</strong> for every family you refer who enrols.
      Just reply with your friend's name and we'll take care of the rest.
    </p>
    <p style="margin:16px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
      Warm regards,<br/>
      <strong>The ${centreName} Team</strong>
    </p>
  `);
  return { subject, html };
}

// ─── Exit Survey Email ──────────────────────────────────────────

export function nurtureExitSurveyEmail(
  firstName: string,
  centreName: string,
  surveyUrl: string,
) {
  const subject = `We'd love your feedback — ${centreName}`;
  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      We're sorry to see you go
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      We understand that your family will be leaving ${centreName}. We truly value the time
      your child spent with us, and we'd love to hear about your experience.
    </p>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Your feedback helps us improve our service for all families. The survey takes
      less than 2 minutes to complete.
    </p>

    ${buttonHtml("Share Your Feedback", surveyUrl)}

    <p style="margin:16px 0 0;color:#9ca3af;font-size:12px;">
      This link will expire in 30 days. Your responses are confidential.
    </p>
    <p style="margin:16px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
      Warm regards,<br/>
      <strong>The ${centreName} Team</strong>
    </p>
  `);

  return { subject, html };
}

// ─── First Session Reminder (day before) ─────────────────────

export function nurtureSessionReminderEmail(
  firstName: string,
  centreName: string,
  serviceAddress?: string,
  orientationVideoUrl?: string
) {
  const subject = `See you tomorrow! — ${centreName}`;
  const addressBlock = serviceAddress
    ? `<p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
        <strong>Where to go:</strong> ${serviceAddress}
      </p>`
    : "";
  const videoBlock = orientationVideoUrl
    ? `<p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
        Before your child's first day, we recommend watching our short orientation video:
      </p>
      ${buttonHtml("Watch Orientation Video", orientationVideoUrl)}`
    : "";
  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      See You Tomorrow!
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      We're excited to welcome your child to ${centreName} tomorrow! Here's everything
      you need to know for a smooth first day.
    </p>
    ${addressBlock}
    <div style="background-color:#f9fafb;border-radius:8px;padding:16px;margin:0 0 16px;">
      <p style="margin:0 0 8px;color:#111827;font-size:14px;font-weight:600;">What to Bring:</p>
      <ul style="margin:0;padding:0 0 0 20px;color:#6b7280;font-size:14px;line-height:1.8;">
        <li>A labelled water bottle</li>
        <li>A hat (we are a SunSmart centre)</li>
        <li>Comfortable clothes and shoes for active play</li>
        <li>A change of clothes (just in case)</li>
        <li>Any medication with a signed medication form</li>
      </ul>
    </div>
    <div style="background-color:#f9fafb;border-radius:8px;padding:16px;margin:0 0 16px;">
      <p style="margin:0 0 8px;color:#111827;font-size:14px;font-weight:600;">Drop-off & Pickup:</p>
      <ul style="margin:0;padding:0 0 0 20px;color:#6b7280;font-size:14px;line-height:1.8;">
        <li><strong>Before School Care:</strong> Drop off from 6:30 AM</li>
        <li><strong>After School Care:</strong> Pick up by 6:00 PM</li>
        <li>Please sign your child in and out at the front desk</li>
        <li>Only authorised persons can collect your child</li>
      </ul>
    </div>
    ${videoBlock}
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      If you have any last-minute questions, feel free to call or message us.
    </p>
    <p style="margin:16px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
      See you soon!<br/>
      <strong>The ${centreName} Team</strong>
    </p>
  `);
  return { subject, html };
}
