/**
 * Parent nurture sequence email templates.
 *
 * These emails guide parents from initial enquiry through to settled,
 * happy families. Each template uses parentEmailLayout() for clean
 * parent-facing branding (no internal "EOS Dashboard" references).
 *
 * Template flow:
 *   new       → welcome
 *   info_sent → ccs_assist (24h) → how_to_enrol (48h) → nudge_1 (3d)
 *   nurturing → nudge_2 (5d) → final_nudge (12d)
 *   form_started → form_support (4h)
 *   first_session → session_reminder (-1d) → what_to_bring (0d)
 *                 → day1_checkin (+1d) → day3_checkin (+3d)
 *                 → app_setup (+5d) → first_week (+7d)
 *                 → week2_feedback (+14d) → nps_survey (+30d)
 *                 → month1_referral (+45d)
 */

import { parentEmailLayout, buttonHtml, escapeHtml } from "./base";
import { applyEmailTemplateOverride } from "@/lib/email-template-overrides";

/**
 * Amana's own enrolment wizard — the form we push in every nurture email
 * (NOT the OWNA portal). Callers that know the enquiry pass the prefilled
 * per-enquiry link (`/enrol/<enquiryId>`) so the parent's details carry over
 * and submission auto-advances their pipeline card to enrolled.
 */
function fallbackEnrolUrl(): string {
  return process.env.NEXTAUTH_URL
    ? `${process.env.NEXTAUTH_URL}/enrol`
    : "https://amanaoshc.company/enrol";
}

/**
 * Generic quick-feedback form (smiley rating → QuickFeedback → Feedback Hub
 * + Monday sentiment-analysis AI report). Callers that know the service pass
 * the per-service prefilled link via the `feedbackUrl` template argument.
 */
function fallbackFeedbackUrl(): string {
  return process.env.NEXTAUTH_URL
    ? `${process.env.NEXTAUTH_URL}/survey/feedback`
    : "https://amanaoshc.company/survey/feedback";
}

// ─── Parent Nurture: Welcome ────────────────────────────────

export async function nurtureWelcomeEmail(firstName: string, centreName: string, enrolUrl?: string) {
  const url = enrolUrl || fallbackEnrolUrl();
  return applyEmailTemplateOverride({
    key: "nurture.welcome",
    defaultSubject: "Assalamu Alaikum {{firstName}} — your {{centreName}} enquiry is in ✅",
    defaultBody: `
    <h2 style="margin:0 0 8px;color:#004E64;font-size:20px;font-weight:700;">
      Assalamu Alaikum {{firstName}} — we're so glad you found us!
    </h2>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Thanks for enquiring about {{centreName}}. <strong>A real person from our team will
      call you within one business day</strong> — no bots, no call centres.
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      While you wait, here's what your child's afternoons could look like: homework
      <strong>done before pickup</strong> with Homework Heroes, Qur'an and Islamic values
      woven into every session through Iqra Circle, and a proper feed from our rotating
      Fuel Up with Amana menu — all right on the school grounds.
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      You're in good company — <strong>more than 1,000 children</strong> go Beyond The Bell
      with us every week.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border-radius:12px;overflow:hidden;background-color:#004E64;">
      <tr>
        <td style="padding:24px;text-align:center;">
          <p style="margin:0 0 8px;color:#FECE00;font-size:16px;font-weight:700;">
            Want to skip the queue?
          </p>
          <p style="margin:0;color:#ffffff;font-size:14px;line-height:1.7;">
            Your enrolment form takes about 10 minutes, saves as you go, and locks in
            your child's spot. Days fill fastest at the start of term.
          </p>
        </td>
      </tr>
    </table>
    {{enrolButton}}
    <p style="margin:16px 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Not ready yet? <strong>Just reply to this email</strong> with the days you're after
      and your child's year — we'll check availability at {{centreName}} and get straight
      back to you.
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Warmly,<br/>
      <strong>The {{centreName}} Team</strong>
    </p>
    <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.7;">
      PS — keep an eye out tomorrow: we'll show you exactly how the Child Care Subsidy
      gets most families to around <strong>$5 a day</strong>.
    </p>
  `,
    vars: {
      firstName: escapeHtml(firstName),
      centreName: escapeHtml(centreName),
      enrolUrl: escapeHtml(url),
      enrolButton: buttonHtml("Secure Your Child's Spot", url),
    },
    wrap: (content: string) =>
      parentEmailLayout(content, {
        preheader:
          "A real person will call you within one business day — here's what happens next.",
      }),
  });
}

// ─── Parent Nurture: CCS Assist (info_sent +24h) ───────────

export async function nurtureCcsAssistEmail(firstName: string, centreName: string, enrolUrl?: string) {
  const url = enrolUrl || fallbackEnrolUrl();
  const calculatorUrl = "https://amanaoshc.com.au/fees#calculator";
  return applyEmailTemplateOverride({
    key: "nurture.ccsAssist",
    defaultSubject: "$5 a day OSHC? Here's how the subsidy works, {{firstName}}",
    defaultBody: `
    <h2 style="margin:0 0 8px;color:#004E64;font-size:20px;font-weight:700;">
      The fee you see isn't the fee you pay
    </h2>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Hi {{firstName}},
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      One of the best-kept secrets about OSHC: the Australian Government's
      <strong>Child Care Subsidy (CCS)</strong> covers <strong>50&#8211;90%</strong> of fees
      for most families. An after school session is $36 before CCS at most of our centres —
      at the maximum subsidy that's about <strong>$3.60</strong>.
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      And no — <strong>you do NOT need to be on Centrelink benefits.</strong> CCS is for
      all working families; it's simply claimed through myGov.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="padding:20px;background-color:#FFF2BF;">
          <p style="margin:0 0 8px;color:#004E64;font-size:15px;font-weight:700;">
            How it works (in plain English):
          </p>
          <p style="margin:0;color:#004E64;font-size:14px;line-height:1.8;">
            <strong>Step 1:</strong> Check your eligibility on myGov<br/>
            <strong>Step 2:</strong> Have your CRN (Customer Reference Number) handy<br/>
            <strong>Step 3:</strong> Pop it in when you enrol — <strong>we handle all the
            paperwork with the government from there.</strong>
          </p>
        </td>
      </tr>
    </table>
    {{calculatorButton}}
    <p style="margin:16px 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Prefer a human? Reply with your situation or call
      <a href="tel:1300200262" style="color:#004E64;font-weight:700;">1300 200 262</a> and
      we'll crunch your numbers with you — no obligation.
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Already convinced? <a href="{{enrolUrl}}" style="color:#004E64;font-weight:700;">Your
      enrolment form is right here</a> — about 10 minutes, and it saves as you go.
    </p>
    <p style="margin:0;color:#374151;font-size:14px;line-height:1.7;">
      Here to help,<br/>
      <strong>The {{centreName}} Team</strong>
    </p>
  `,
    vars: {
      firstName: escapeHtml(firstName),
      centreName: escapeHtml(centreName),
      enrolUrl: escapeHtml(url),
      calculatorButton: buttonHtml("See What You'd Pay — 30-Second Calculator", calculatorUrl),
    },
    wrap: (content: string) =>
      parentEmailLayout(content, {
        preheader:
          "CCS covers 50–90% for most families — and no, you don't need to be on Centrelink.",
      }),
  });
}

// ─── Parent Nurture: How to Enrol (info_sent +48h) ──────────

export async function nurtureHowToEnrolEmail(firstName: string, centreName: string, prefilledEnrolUrl?: string) {
  const enrolUrl = prefilledEnrolUrl || fallbackEnrolUrl();
  return applyEmailTemplateOverride({
    key: "nurture.howToEnrol",
    defaultSubject: "3 steps, 10 minutes — here's how to secure your child's spot",
    defaultBody: `
    <h2 style="margin:0 0 8px;color:#004E64;font-size:20px;font-weight:700;">
      Enrolling is easier than you think
    </h2>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Hi {{firstName}},
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      We've designed our enrolment form to be as painless as possible — most families
      finish in about 10 minutes. Here's what you'll need:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border:1px solid #FFF2BF;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="padding:20px;background-color:#FFFAE6;border-bottom:1px solid #FFF2BF;">
          <p style="margin:0 0 4px;color:#004E64;font-size:14px;font-weight:700;">
            <span style="color:#B78F00;">Step 1</span> — Your child's details
          </p>
          <p style="margin:0;color:#374151;font-size:13px;line-height:1.6;">
            Name, date of birth, medical info, and allergies. Tip: have your Medicare card and
            both CRNs (yours and your child's) handy. Birth certificate and immunisation
            history can be uploaded later. Enrolling siblings? Add all your children in the
            one form.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:20px;background-color:#ffffff;border-bottom:1px solid #FFF2BF;">
          <p style="margin:0 0 4px;color:#004E64;font-size:14px;font-weight:700;">
            <span style="color:#B78F00;">Step 2</span> — Emergency contacts &amp; authorised pickups
          </p>
          <p style="margin:0;color:#374151;font-size:13px;line-height:1.6;">
            Who can we call in an emergency? Who's allowed to collect your child? (You'll need
            their names and phone numbers.)
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:20px;background-color:#FFFAE6;">
          <p style="margin:0 0 4px;color:#004E64;font-size:14px;font-weight:700;">
            <span style="color:#B78F00;">Step 3</span> — Days &amp; payment
          </p>
          <p style="margin:0;color:#374151;font-size:13px;line-height:1.6;">
            Pick Before School Care, After School Care, or both — and set up your direct
            debit so everything's ready for day one. <strong style="color:#004E64;">And no,
            we won't charge you anything now</strong> — nothing is debited until after your
            child attends, and only if they love their first days. That's our guarantee.
          </p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 8px;color:#374151;font-size:14px;line-height:1.7;text-align:center;">
      <em>Spots are confirmed in enrolment order — the earlier you're in, the better your
      pick of days.</em>
    </p>
    {{startButton}}
    <p style="margin:16px 0 0;color:#6b7280;font-size:13px;line-height:1.6;">
      Don't worry if you can't finish in one go — your progress is automatically saved
      and you can come back anytime.
    </p>
    <p style="margin:16px 0 0;color:#374151;font-size:14px;line-height:1.7;">
      Need a hand? Reply to this email or call
      <a href="tel:1300200262" style="color:#004E64;font-weight:700;">1300 200 262</a> —
      we can even fill it in together over the phone.
    </p>
    <p style="margin:16px 0 0;color:#374151;font-size:14px;line-height:1.7;">
      Cheers,<br/>
      <strong>The {{centreName}} Team</strong>
    </p>
  `,
    vars: {
      firstName: escapeHtml(firstName),
      centreName: escapeHtml(centreName),
      enrolUrl: escapeHtml(enrolUrl),
      startButton: buttonHtml("Start Now — Takes 10 Minutes", enrolUrl),
    },
    wrap: (content: string) =>
      parentEmailLayout(content, {
        preheader:
          "Medicare card and CRNs handy? You're 10 minutes from locking in your child's spot.",
      }),
  });
}

// ─── Parent Nurture: Nudge 1 (info_sent +3d) ───────────────

export async function nurtureNudge1Email(firstName: string, centreName: string, enrolUrl?: string) {
  const url = enrolUrl || fallbackEnrolUrl();
  return applyEmailTemplateOverride({
    key: "nurture.nudge1",
    defaultSubject: "Quick question, {{firstName}} — anything we can help with?",
    defaultBody: `
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Just checking in
    </h2>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Hi {{firstName}},
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      We've sent a bit of info through this week and wanted to make sure it all made
      sense. Here are the four questions we hear most — with the short answers:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-radius:12px;overflow:hidden;background-color:#FFF2BF;">
      <tr>
        <td style="padding:20px 24px;">
          <p style="margin:0 0 14px;color:#004E64;font-size:14px;line-height:1.7;">
            <strong>"What does a typical afternoon look like?"</strong><br/>
            Afternoon tea together, then your child chooses — sport, art &amp; STEM,
            Qur'an time with Iqra Circle, or knocking over homework with our educators.
          </p>
          <p style="margin:0 0 14px;color:#004E64;font-size:14px;line-height:1.7;">
            <strong>"How much will I actually pay after CCS?"</strong><br/>
            Most families land between <strong>$3 and $10 a session</strong>.
            <a href="https://amanaoshc.com.au/fees#calculator" style="color:#004E64;font-weight:700;">Your
            exact number in 30 seconds &#8594;</a>
          </p>
          <p style="margin:0 0 14px;color:#004E64;font-size:14px;line-height:1.7;">
            <strong>"Can I change my days later?"</strong><br/>
            Yes — days can be adjusted with our team as your routine changes
            (with 7 days' notice for recurring bookings).
          </p>
          <p style="margin:0;color:#004E64;font-size:14px;line-height:1.7;">
            <strong>"What if my child is nervous about starting?"</strong><br/>
            Completely normal — and they're welcome to visit with you before their first
            session. On day one, our educators personally collect your child from their
            classroom, you'll get a notification the moment they're signed in, and we'll
            send you photos of how they're settling in.
          </p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Something else on your mind? <strong>Just hit reply</strong> — we're real people
      and we read every email.
    </p>
    <p style="margin:0 0 8px;color:#374151;font-size:14px;line-height:1.7;">
      Or if you're ready to lock in a spot, your enrolment form is waiting — it takes
      about 10 minutes and saves your progress as you go:
    </p>
    {{enrolButton}}
    <p style="margin:16px 0 0;color:#374151;font-size:14px;line-height:1.7;">
      Talk soon,<br/>
      <strong>The {{centreName}} Team</strong>
    </p>
  `,
    vars: {
      firstName: escapeHtml(firstName),
      centreName: escapeHtml(centreName),
      enrolUrl: escapeHtml(url),
      enrolButton: buttonHtml("Start Your Enrolment", url),
    },
    wrap: (content: string) =>
      parentEmailLayout(content, {
        preheader:
          "The four things parents usually ask before enrolling — answered in one minute.",
      }),
  });
}

// ─── Parent Nurture: Nudge 2 (nurturing +5d) ───────────────

export async function nurtureNudge2Email(firstName: string, centreName: string, enrolUrl?: string) {
  const url = enrolUrl || fallbackEnrolUrl();
  return applyEmailTemplateOverride({
    key: "nurture.nudge2",
    defaultSubject: "A peek inside a day at {{centreName}}",
    defaultBody: `
    <h2 style="margin:0 0 8px;color:#004E64;font-size:20px;font-weight:700;">
      What actually happens at OSHC?
    </h2>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Hi {{firstName}},
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      We know that "Out of School Hours Care" can sound a bit abstract. So here's what a
      typical afternoon actually looks like at {{centreName}}:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border:1px solid #FFF2BF;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="padding:16px 20px;background-color:#FFFAE6;border-bottom:1px solid #FFF2BF;">
          <p style="margin:0;color:#374151;font-size:14px;line-height:1.7;">
            <strong style="color:#B78F00;">3:00 PM</strong> — Our educators collect children straight
            from their classrooms (no stressful pickup queues for you!)
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 20px;background-color:#ffffff;border-bottom:1px solid #FFF2BF;">
          <p style="margin:0;color:#374151;font-size:14px;line-height:1.7;">
            <strong style="color:#B78F00;">3:15 PM</strong> — Fuel Up with Amana: afternoon tea from
            our rotating menu, catching up about the day
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 20px;background-color:#FFFAE6;border-bottom:1px solid #FFF2BF;">
          <p style="margin:0;color:#374151;font-size:14px;line-height:1.7;">
            <strong style="color:#B78F00;">3:45 PM</strong> — Homework Heroes or Iqra Circle Qur'an
            time — homework handled and hearts full, before you even arrive
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 20px;background-color:#ffffff;border-bottom:1px solid #FFF2BF;">
          <p style="margin:0;color:#374151;font-size:14px;line-height:1.7;">
            <strong style="color:#B78F00;">4:30 PM</strong> — Structured group fun or free play —
            Little Champions sport, Imagination Station art &amp; STEM, or simply running around
            with friends
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 20px;background-color:#FFFAE6;">
          <p style="margin:0;color:#374151;font-size:14px;line-height:1.7;">
            <strong style="color:#B78F00;">Until 6:30 PM</strong> — Pick up whenever suits you —
            swing by any time; latest pickup is 6:30 PM
          </p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      And mornings? <strong>Rise &amp; Shine Club</strong> gives them a calm, positive start
      before the bell.
    </p>
    <p style="margin:0 0 16px;color:#004E64;font-size:14px;line-height:1.7;font-weight:600;">
      Fair warning: our most common complaint from parents is that the kids don't want
      to go home.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border-radius:12px;overflow:hidden;background-color:#004E64;">
      <tr>
        <td style="padding:22px 24px;text-align:center;">
          <p style="margin:0 0 8px;color:#FFFAE6;font-size:15px;line-height:1.7;font-style:italic;">
            "My daughter loves the variety of programs, from arts and crafts to outdoor play.
            She asks to go every day."
          </p>
          <p style="margin:0;color:#FECE00;font-size:13px;font-weight:700;">
            — Mariam S, parent at Al-Taqwa College
          </p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Want to see it in person? We'd love to show you around. Just reply and we'll set up
      a quick visit at a time that works for you.
    </p>
    <p style="margin:0 0 8px;color:#374151;font-size:14px;line-height:1.7;">
      Or skip straight to securing your child's spot:
    </p>
    {{enrolButton}}
    <p style="margin:16px 0 0;color:#374151;font-size:14px;line-height:1.7;">
      Warmly,<br/>
      <strong>The {{centreName}} Team</strong>
    </p>
  `,
    vars: {
      firstName: escapeHtml(firstName),
      centreName: escapeHtml(centreName),
      enrolUrl: escapeHtml(url),
      enrolButton: buttonHtml("Give Them Afternoons Like This", url),
    },
    wrap: (content: string) =>
      parentEmailLayout(content, {
        preheader:
          "3:00pm — collected from class. 6:30pm — fed, homework done, happy. Here's the middle.",
      }),
  });
}

// ─── Parent Nurture: Final Nudge (nurturing +12d) ──────────

export async function nurtureFinalNudgeEmail(firstName: string, centreName: string, enrolUrl?: string) {
  const url = enrolUrl || fallbackEnrolUrl();
  return applyEmailTemplateOverride({
    key: "nurture.finalNudge",
    defaultSubject: "Our last email, {{firstName}} — your child's spot is still here",
    defaultBody: `
    <h2 style="margin:0 0 8px;color:#004E64;font-size:20px;font-weight:700;">
      Just a quick note from us
    </h2>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Hi {{firstName}},
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      We know life gets busy — and choosing care for your child is something you want to
      get right, not rushed. So this is <strong>our last email</strong>; we don't want to
      clog your inbox.
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Before we go quiet, one thing worth knowing: as educator numbers and daily ratios
      are set, places at {{centreName}} do become limited — enrolling sooner is the surest
      way to lock in the days you want.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-radius:12px;overflow:hidden;background-color:#FFF2BF;">
      <tr>
        <td style="padding:20px 24px;">
          <p style="margin:0 0 12px;color:#004E64;font-size:15px;font-weight:700;">
            Three ways to go from here:
          </p>
          <p style="margin:0 0 12px;color:#004E64;font-size:14px;line-height:1.7;">
            <strong>1. Ready?</strong> Your form is prefilled and takes about 10 minutes —
            and nothing is charged until after your child attends.
          </p>
          <p style="margin:0 0 12px;color:#004E64;font-size:14px;line-height:1.7;">
            <strong>2. Right idea, wrong timing?</strong> Reply <strong>"next term"</strong>
            and we'll check in closer to the date — no emails in between, promise.
          </p>
          <p style="margin:0;color:#004E64;font-size:14px;line-height:1.7;">
            <strong>3. Still deciding?</strong> Reply with any question, call
            <a href="tel:1300200262" style="color:#004E64;font-weight:700;">1300 200 262</a>,
            or pop in for a visit — no appointment needed.
          </p>
        </td>
      </tr>
    </table>
    {{enrolButton}}
    <p style="margin:16px 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Whatever you choose, we genuinely hope to welcome your family one day.
    </p>
    <p style="margin:0;color:#374151;font-size:14px;line-height:1.7;">
      Take care,<br/>
      <strong>The {{centreName}} Team</strong>
    </p>
  `,
    vars: {
      firstName: escapeHtml(firstName),
      centreName: escapeHtml(centreName),
      enrolUrl: escapeHtml(url),
      enrolButton: buttonHtml("Secure Your Child's Spot", url),
    },
    wrap: (content: string) =>
      parentEmailLayout(content, {
        preheader:
          "We'll stop emailing after today. Here are your three doors (one takes two words).",
      }),
  });
}

// ─── Parent Nurture: Form Support (form_started +4h) ────────

export async function nurtureFormSupportEmail(firstName: string, centreName: string, enrolUrl?: string) {
  const url = enrolUrl || fallbackEnrolUrl();
  return applyEmailTemplateOverride({
    key: "nurture.formSupport",
    defaultSubject: "Stuck on the form? We can finish it together in 5 minutes",
    defaultBody: `
    <h2 style="margin:0 0 8px;color:#004E64;font-size:20px;font-weight:700;">
      You're closer than you think
    </h2>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Hi {{firstName}},
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      You've started the enrolment form for {{centreName}} (great move!). If you got
      interrupted or hit a tricky question — don't worry, <strong>your progress is
      saved</strong> and picks up right where you left off.
    </p>
    <p style="margin:0 0 8px;color:#374151;font-size:14px;line-height:1.7;">
      The three places parents usually get stuck:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-radius:12px;overflow:hidden;background-color:#FFF2BF;">
      <tr>
        <td style="padding:20px 24px;">
          <p style="margin:0 0 14px;color:#004E64;font-size:14px;line-height:1.7;">
            <strong>"What's a CRN?"</strong><br/>
            Your Centrelink Customer Reference Number — you'll need <strong>yours and your
            child's</strong>. Find them in the Centrelink app or myGov under
            <em>My Family</em>, or on any Centrelink letter. Can't track them down? Call us
            and we'll help.
          </p>
          <p style="margin:0 0 14px;color:#004E64;font-size:14px;line-height:1.7;">
            <strong>"Do I need documents right now?"</strong><br/>
            No — birth certificate and immunisation history can be uploaded after enrolment.
          </p>
          <p style="margin:0;color:#004E64;font-size:14px;line-height:1.7;">
            <strong>"Why card details?"</strong><br/>
            Just to have everything ready for day one. <strong>Nothing is debited until
            after your child attends — and only if they love their first days. That's our
            guarantee.</strong>
          </p>
        </td>
      </tr>
    </table>
    {{continueButton}}
    <p style="margin:16px 0 0;color:#374151;font-size:14px;line-height:1.7;">
      Prefer to knock it over together? Reply to this email or call
      <a href="tel:1300200262" style="color:#004E64;font-weight:700;">1300 200 262</a> and
      we'll walk through it with you on the phone.
    </p>
    <p style="margin:16px 0 0;color:#374151;font-size:14px;line-height:1.7;">
      Cheers,<br/>
      <strong>The {{centreName}} Team</strong>
    </p>
  `,
    vars: {
      firstName: escapeHtml(firstName),
      centreName: escapeHtml(centreName),
      enrolUrl: escapeHtml(url),
      continueButton: buttonHtml("Finish Your Enrolment — ~5 Minutes", url),
    },
    wrap: (content: string) =>
      parentEmailLayout(content, {
        preheader: "Your progress is saved — you're about 5 minutes from done.",
      }),
  });
}

// ─── Form Abandonment Follow-up (form_started +3d) ──────────
// Second nudge for families who started but haven't completed after 3 days

export async function nurtureFormAbandonmentEmail(firstName: string, centreName: string, prefilledEnrolUrl?: string) {
  const enrolUrl = prefilledEnrolUrl || fallbackEnrolUrl();
  return applyEmailTemplateOverride({
    key: "nurture.formAbandonment",
    defaultSubject: "Still saving that spot for you, {{firstName}} — 5 minutes to finish?",
    defaultBody: `
    <h2 style="margin:0 0 8px;color:#004E64;font-size:20px;font-weight:700;">
      You're so close!
    </h2>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Hi {{firstName}},
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      A few days ago you started enrolling at {{centreName}} — your progress is still
      saved, right where you left it.
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      <strong>Here's the easiest way from here: reply with a time that suits you, and
      we'll call and finish it together.</strong> Most families are done in under 5
      minutes with us on the line.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-radius:12px;overflow:hidden;background-color:#FFF2BF;">
      <tr>
        <td style="padding:20px 24px;">
          <p style="margin:0 0 12px;color:#004E64;font-size:15px;font-weight:700;">
            Or if something specific held you up:
          </p>
          <p style="margin:0 0 12px;color:#004E64;font-size:14px;line-height:1.7;">
            <strong>"I couldn't find the CRNs"</strong> — They're in the Centrelink app or
            myGov under <em>My Family</em> (you need yours and your child's). Call us if
            you're stuck.
          </p>
          <p style="margin:0 0 12px;color:#004E64;font-size:14px;line-height:1.7;">
            <strong>"I need to dig out immunisation records"</strong> — Upload them after
            enrolment; don't let that stop you.
          </p>
          <p style="margin:0 0 12px;color:#004E64;font-size:14px;line-height:1.7;">
            <strong>"I wasn't sure which days to pick"</strong> — You don't have to decide
            now. Leave the days empty and book casually through our app, then set up a
            recurring schedule whenever you're ready (recurring days can be adjusted with
            7 days' notice).
          </p>
          <p style="margin:0;color:#004E64;font-size:14px;line-height:1.7;">
            <strong>"The card details made me pause"</strong> — Nothing is debited until
            after your child attends, and only if they love their first days.
          </p>
        </td>
      </tr>
    </table>
    {{continueButton}}
    <p style="margin:16px 0 0;color:#374151;font-size:14px;line-height:1.7;">
      Cheers,<br/>
      <strong>The {{centreName}} Team</strong>
    </p>
  `,
    vars: {
      firstName: escapeHtml(firstName),
      centreName: escapeHtml(centreName),
      enrolUrl: escapeHtml(enrolUrl),
      continueButton: buttonHtml("Pick Up Where You Left Off", enrolUrl),
    },
    wrap: (content: string) =>
      parentEmailLayout(content, {
        preheader: "Reply with a time and we'll finish the form together on the phone.",
      }),
  });
}

// ═══════════════════════════════════════════════════════════════
// RETENTION TEMPLATES — Keeping existing families engaged
// ═══════════════════════════════════════════════════════════════

// ─── Casual Booking Re-engagement ────────────────────────────
// Triggered when a casual family hasn't booked in 14+ days

export async function retentionCasualReengageEmail(firstName: string, centreName: string) {
  return applyEmailTemplateOverride({
    key: "retention.casualReengage",
    defaultSubject: "We've missed seeing your family at {{centreName}}!",
    defaultBody: `
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      It's been a while!
    </h2>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Hi {{firstName}},
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      We noticed it's been a couple of weeks since your child visited {{centreName}},
      and we just wanted to say — we miss them! Our educators have been asking about
      your little one.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border-radius:12px;overflow:hidden;background-color:#f0fdf4;">
      <tr>
        <td style="padding:20px;">
          <p style="margin:0 0 12px;color:#065f46;font-size:15px;font-weight:700;">
            Here's what's been happening at the centre:
          </p>
          <p style="margin:0;color:#047857;font-size:14px;line-height:2;">
            &#127912; New art and craft projects every week<br/>
            &#9917; Updated sports and outdoor activities<br/>
            &#127859; Fresh menu items the kids have been loving<br/>
            &#129302; New STEM challenges and building projects
          </p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Remember, casual bookings are totally flexible — drop in whenever it suits your
      family. No commitment, no minimum days. Your child's spot is always ready.
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      <strong>Quick tip:</strong> If you'd like to switch to regular days, you might
      save money with CCS. We're happy to run the numbers for you — just reply.
    </p>
    <p style="margin:0;color:#374151;font-size:14px;line-height:1.7;">
      Hope to see you soon,<br/>
      <strong>The {{centreName}} Team</strong>
    </p>
  `,
    vars: { firstName: escapeHtml(firstName), centreName: escapeHtml(centreName) },
    wrap: parentEmailLayout,
  });
}

// ─── Term Transition / New Term Welcome ──────────────────────
// Sent at the start of each new school term

export function retentionTermTransitionEmail(
  firstName: string,
  centreName: string,
  termNumber: string,
  termYear: string,
) {
  const subject = `Term ${termNumber} is here — what's new at ${centreName}`;
  const html = parentEmailLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Welcome to Term ${termNumber}, ${termYear}!
    </h2>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      A new term means new adventures at ${centreName}! We've been planning some
      exciting activities and we can't wait for your child to experience them.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="padding:20px;background-color:#eff6ff;border-bottom:1px solid #dbeafe;">
          <p style="margin:0 0 4px;color:#1e40af;font-size:14px;font-weight:700;">
            A few things to check this term:
          </p>
          <p style="margin:0;color:#1e3a5f;font-size:14px;line-height:2;">
            &#9745; Are your booking days still right? Need to add or change anything?<br/>
            &#9745; Any new medical info, allergies, or dietary needs to update?<br/>
            &#9745; Emergency contacts still current?<br/>
            &#9745; Has your CCS changed? (Common after tax time!)
          </p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      <strong>Need to change your days?</strong> Just reply to this email with what you
      need and we'll update everything for you. If you'd like to add extra days, let us
      know — we'll check availability.
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Here's to another great term together!
    </p>
    <p style="margin:0;color:#374151;font-size:14px;line-height:1.7;">
      The ${centreName} Team
    </p>
  `);
  return { subject, html };
}

// ─── Withdrawal Intercept ────────────────────────────────────
// Sent when a family begins the withdrawal/cancellation process

export async function retentionWithdrawalInterceptEmail(firstName: string, centreName: string) {
  return applyEmailTemplateOverride({
    key: "retention.withdrawalIntercept",
    defaultSubject: "Before you go — can we chat, {{firstName}}?",
    defaultBody: `
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      We heard you might be leaving
    </h2>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Hi {{firstName}},
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      We noticed you've started the process of leaving {{centreName}}, and we wanted
      to reach out personally. We completely understand that circumstances change, but
      before things are finalised, we'd love a chance to chat.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border-radius:12px;overflow:hidden;background-color:#fefce8;">
      <tr>
        <td style="padding:20px;">
          <p style="margin:0 0 12px;color:#854d0e;font-size:15px;font-weight:700;">
            Some things we might be able to help with:
          </p>
          <p style="margin:0;color:#92400e;font-size:14px;line-height:2;">
            &#8226; <strong>Cost concerns?</strong> Let's review your CCS — many families
            don't realise they're eligible for more subsidy<br/>
            &#8226; <strong>Schedule doesn't work?</strong> We can look at different days
            or switch to casual bookings<br/>
            &#8226; <strong>Your child isn't settling?</strong> Our educators can work with
            you on a personalised transition plan<br/>
            &#8226; <strong>Moving schools?</strong> We operate at multiple locations and
            might have a centre near you
          </p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      We're not here to pressure you. If leaving is the right call, we respect that
      completely. But if there's something we can do differently, we'd genuinely like
      to know.
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Reply to this email or call the centre — we'd love 5 minutes of your time.
    </p>
    <p style="margin:0;color:#374151;font-size:14px;line-height:1.7;">
      With care,<br/>
      <strong>The {{centreName}} Team</strong>
    </p>
  `,
    vars: { firstName: escapeHtml(firstName), centreName: escapeHtml(centreName) },
    wrap: parentEmailLayout,
  });
}

// ─── Booking Day Change Reminder ─────────────────────────────
// Sent when recurring days are approaching and families may want to adjust

export async function retentionDayChangeReminderEmail(firstName: string, centreName: string) {
  return applyEmailTemplateOverride({
    key: "retention.dayChangeReminder",
    defaultSubject: "Quick check — are your booking days still right?",
    defaultBody: `
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Time for a booking check-up
    </h2>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Hi {{firstName}},
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Life changes, and so do schedules! We just wanted to check whether your current
      booking days at {{centreName}} are still working for your family.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border-radius:12px;overflow:hidden;background-color:#f9fafb;">
      <tr>
        <td style="padding:20px;">
          <p style="margin:0 0 12px;color:#111827;font-size:14px;font-weight:600;">
            Things you can change anytime:
          </p>
          <p style="margin:0;color:#374151;font-size:14px;line-height:2;">
            &#8226; Add or remove regular days<br/>
            &#8226; Switch between BSC, ASC, or both<br/>
            &#8226; Move to casual bookings if you need more flexibility<br/>
            &#8226; Add a sibling (ask about our family discount!)
          </p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      If everything's still good, you don't need to do anything. But if you'd like to
      make changes, just reply to this email and we'll sort it out.
    </p>
    <p style="margin:0;color:#374151;font-size:14px;line-height:1.7;">
      Cheers,<br/>
      <strong>The {{centreName}} Team</strong>
    </p>
  `,
    vars: { firstName: escapeHtml(firstName), centreName: escapeHtml(centreName) },
    wrap: parentEmailLayout,
  });
}
