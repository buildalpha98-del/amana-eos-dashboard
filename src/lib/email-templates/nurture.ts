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

import { parentEmailLayout, buttonHtml } from "./base";

// ─── Parent Nurture: Welcome ────────────────────────────────

export function nurtureWelcomeEmail(firstName: string, centreName: string) {
  const subject = `You've taken the first step! Welcome to ${centreName}`;
  const html = parentEmailLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Hello ${firstName}! We're glad you found us.
    </h2>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Thank you for enquiring about ${centreName}. Finding the right before and after school
      care is a big decision, and we want to make it as easy as possible for you.
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      At Amana OSHC, your child won't just be supervised — they'll build friendships, discover
      new interests, and have a place that feels like a second home. Our educators are passionate
      about creating an environment where every child feels safe, valued, and excited to be here.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border-radius:12px;overflow:hidden;background:linear-gradient(135deg, #004E64 0%, #006B87 100%);">
      <tr>
        <td style="padding:24px;">
          <p style="margin:0 0 12px;color:#FECE00;font-size:15px;font-weight:700;">
            Here's what happens next:
          </p>
          <p style="margin:0;color:#ffffff;font-size:14px;line-height:2;">
            1. We'll send you everything you need to know about fees and subsidies<br/>
            2. When you're ready, you'll complete a quick online enrolment form<br/>
            3. Our team will confirm your child's spot and booking days<br/>
            4. We'll help you get set up for a smooth first day
          </p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      No pressure, no rush. We're here whenever you're ready to chat — just hit reply
      or give the centre a call. We'd love to answer any questions you have.
    </p>
    <p style="margin:0;color:#374151;font-size:14px;line-height:1.7;">
      Looking forward to meeting your family,<br/>
      <strong>The ${centreName} Team</strong>
    </p>
  `);
  return { subject, html };
}

// ─── Parent Nurture: CCS Assist (info_sent +24h) ───────────

export function nurtureCcsAssistEmail(firstName: string, centreName: string) {
  const subject = `Most families pay less than you'd think — here's how`;
  const html = parentEmailLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      The fee you see isn't the fee you pay
    </h2>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      One of the best-kept secrets about OSHC? The Australian Government's
      <strong>Child Care Subsidy (CCS)</strong> can cover up to <strong>90%</strong> of your
      session fees. That means a $30 session could cost you as little as $3.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="padding:20px;background-color:#f0fdf4;border-left:4px solid #10b981;">
          <p style="margin:0 0 8px;color:#065f46;font-size:15px;font-weight:700;">
            How it works (in plain English):
          </p>
          <p style="margin:0;color:#047857;font-size:14px;line-height:1.8;">
            <strong>Step 1:</strong> Check your eligibility on myGov or Centrelink<br/>
            <strong>Step 2:</strong> Get your CRN (Customer Reference Number) ready<br/>
            <strong>Step 3:</strong> Include it when you enrol — we handle the rest
          </p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Not sure where to start? Our team at ${centreName} helps families navigate CCS every week.
      We can even give you a quick estimate of what you'd actually pay out of pocket.
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Just reply to this email with your situation and we'll crunch the numbers for you — no
      obligation, no paperwork.
    </p>
    <p style="margin:0;color:#374151;font-size:14px;line-height:1.7;">
      Here to help,<br/>
      <strong>The ${centreName} Team</strong>
    </p>
  `);
  return { subject, html };
}

// ─── Parent Nurture: How to Enrol (info_sent +48h) ──────────

export function nurtureHowToEnrolEmail(firstName: string, centreName: string) {
  const enrolUrl = process.env.NEXTAUTH_URL
    ? `${process.env.NEXTAUTH_URL}/enrol`
    : "https://amanaoshc.company/enrol";
  const subject = `3 steps, 10 minutes — here's how to secure your child's spot`;
  const html = parentEmailLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Enrolling is easier than you think
    </h2>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      We've designed our enrolment form to be as painless as possible. Most families
      finish it in about 10 minutes (yes, really). Here's a quick preview of what you'll need:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="padding:20px;background-color:#eff6ff;border-bottom:1px solid #dbeafe;">
          <p style="margin:0 0 4px;color:#1e40af;font-size:14px;font-weight:700;">
            Step 1: Your child's details
          </p>
          <p style="margin:0;color:#3b82f6;font-size:13px;line-height:1.6;">
            Name, date of birth, medical info, and allergies. Tip: have your Medicare card handy.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:20px;background-color:#f0fdf4;border-bottom:1px solid #dcfce7;">
          <p style="margin:0 0 4px;color:#065f46;font-size:14px;font-weight:700;">
            Step 2: Emergency contacts &amp; authorised pickups
          </p>
          <p style="margin:0;color:#047857;font-size:13px;line-height:1.6;">
            Who can we call in an emergency? Who's allowed to collect your child? (You'll need
            their names and phone numbers.)
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:20px;background-color:#fefce8;">
          <p style="margin:0 0 4px;color:#854d0e;font-size:14px;font-weight:700;">
            Step 3: Choose your days
          </p>
          <p style="margin:0;color:#a16207;font-size:13px;line-height:1.6;">
            Before School Care, After School Care, or both — pick the days that work for your family.
          </p>
        </td>
      </tr>
    </table>
    ${buttonHtml("Start Your Enrolment", enrolUrl)}
    <p style="margin:16px 0 0;color:#6b7280;font-size:13px;line-height:1.6;">
      Don't worry if you can't finish in one go — your progress is automatically saved
      and you can come back anytime.
    </p>
    <p style="margin:16px 0 0;color:#374151;font-size:14px;line-height:1.7;">
      Need a hand? Reply to this email or call the centre. We can even fill it in together
      over the phone.
    </p>
    <p style="margin:16px 0 0;color:#374151;font-size:14px;line-height:1.7;">
      Cheers,<br/>
      <strong>The ${centreName} Team</strong>
    </p>
  `);
  return { subject, html };
}

// ─── Parent Nurture: Nudge 1 (info_sent +3d) ───────────────

export function nurtureNudge1Email(firstName: string, centreName: string) {
  const subject = `Quick question, ${firstName} — anything we can help with?`;
  const html = parentEmailLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Just checking in
    </h2>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      We sent through some info about ${centreName} a few days ago and wanted to make
      sure it all made sense. Choosing OSHC can throw up a lot of questions — here are
      the ones we hear most:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-radius:12px;overflow:hidden;background-color:#f9fafb;">
      <tr>
        <td style="padding:20px;">
          <p style="margin:0;color:#374151;font-size:14px;line-height:2.2;">
            <strong>"What does a typical day look like?"</strong><br/>
            <strong>"How much will I actually pay after CCS?"</strong><br/>
            <strong>"Can I change my days later?"</strong><br/>
            <strong>"What if my child is nervous about starting?"</strong>
          </p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      If any of these are on your mind (or something else entirely), just hit reply.
      We're real people and we read every email.
    </p>
    <p style="margin:0;color:#374151;font-size:14px;line-height:1.7;">
      Talk soon,<br/>
      <strong>The ${centreName} Team</strong>
    </p>
  `);
  return { subject, html };
}

// ─── Parent Nurture: Nudge 2 (nurturing +5d) ───────────────

export function nurtureNudge2Email(firstName: string, centreName: string) {
  const subject = `A peek inside a day at ${centreName}`;
  const html = parentEmailLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      What actually happens at OSHC?
    </h2>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      We know that "Out of School Hours Care" can sound a bit abstract. So here's what a
      typical afternoon actually looks like at ${centreName}:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="padding:16px;background-color:#fefce8;border-bottom:1px solid #fde68a;">
          <p style="margin:0;color:#92400e;font-size:14px;line-height:1.7;">
            <strong>3:00 PM</strong> — Our educators collect children from their classrooms (no stressful
            pickup queues for you!)
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:16px;background-color:#f0fdf4;border-bottom:1px solid #bbf7d0;">
          <p style="margin:0;color:#065f46;font-size:14px;line-height:1.7;">
            <strong>3:15 PM</strong> — Afternoon tea together, catching up about the day
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:16px;background-color:#eff6ff;border-bottom:1px solid #bfdbfe;">
          <p style="margin:0;color:#1e40af;font-size:14px;line-height:1.7;">
            <strong>3:45 PM</strong> — Choice time: art, sport, cooking, STEM challenges, outdoor play,
            or quiet reading. Your child picks what excites them.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:16px;background-color:#fdf4ff;">
          <p style="margin:0;color:#86198f;font-size:14px;line-height:1.7;">
            <strong>5:00–6:00 PM</strong> — Wind-down activities and pick-up time. You'll get a
            quick rundown of what your child got up to.
          </p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Want to see it in person? We'd love to show you around. Just reply and we'll set up
      a quick visit at a time that works for you.
    </p>
    <p style="margin:0;color:#374151;font-size:14px;line-height:1.7;">
      Warmly,<br/>
      <strong>The ${centreName} Team</strong>
    </p>
  `);
  return { subject, html };
}

// ─── Parent Nurture: Final Nudge (nurturing +12d) ──────────

export function nurtureFinalNudgeEmail(firstName: string, centreName: string) {
  const subject = `No pressure — we'll be here when you're ready`;
  const html = parentEmailLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Just a quick note from us
    </h2>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      We know life gets busy, and choosing care for your child is something you want to
      get right. This will be our last email for now — we don't want to clog your inbox.
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      But if you ever want to revisit things — whether it's next week, next term, or next
      year — our door at ${centreName} is always open. You can:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-radius:12px;overflow:hidden;background-color:#f9fafb;">
      <tr>
        <td style="padding:20px;">
          <p style="margin:0;color:#374151;font-size:14px;line-height:2;">
            &#8226; Reply to this email anytime<br/>
            &#8226; Call the centre during business hours<br/>
            &#8226; Pop in for a visit — no appointment needed
          </p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      We genuinely hope to welcome your family one day. Until then, we wish you all the best.
    </p>
    <p style="margin:0;color:#374151;font-size:14px;line-height:1.7;">
      Take care,<br/>
      <strong>The ${centreName} Team</strong>
    </p>
  `);
  return { subject, html };
}

// ─── Parent Nurture: Form Support (form_started +4h) ────────

export function nurtureFormSupportEmail(firstName: string, centreName: string) {
  const subject = `Stuck on the form? We can finish it together in 5 minutes`;
  const html = parentEmailLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      We noticed you started enrolling — nice!
    </h2>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      You've started the enrolment form for ${centreName} (great move!). If you got
      interrupted or hit a tricky question, don't worry — your progress has been saved.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border-radius:12px;overflow:hidden;background:linear-gradient(135deg, #004E64 0%, #006B87 100%);">
      <tr>
        <td style="padding:24px;">
          <p style="margin:0 0 8px;color:#FECE00;font-size:15px;font-weight:700;">
            Three ways we can help:
          </p>
          <p style="margin:0;color:#ffffff;font-size:14px;line-height:2;">
            1. <strong>Reply to this email</strong> — tell us where you got stuck<br/>
            2. <strong>Call the centre</strong> — we'll walk through it together on the phone<br/>
            3. <strong>Message us on WhatsApp</strong> — send photos of documents if that's easier
          </p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      The most common questions we get: <em>"What's a CRN?"</em> (it's your Centrelink
      Customer Reference Number), <em>"Do I need immunisation records right now?"</em>
      (not immediately — we can sort that out later).
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      You're almost there. Let's get your child's spot secured!
    </p>
    <p style="margin:0;color:#374151;font-size:14px;line-height:1.7;">
      Cheers,<br/>
      <strong>The ${centreName} Team</strong>
    </p>
  `);
  return { subject, html };
}

// ─── Form Abandonment Follow-up (form_started +3d) ──────────
// Second nudge for families who started but haven't completed after 3 days

export function nurtureFormAbandonmentEmail(firstName: string, centreName: string) {
  const enrolUrl = process.env.NEXTAUTH_URL
    ? `${process.env.NEXTAUTH_URL}/enrol`
    : "https://amanaoshc.company/enrol";
  const subject = `Your enrolment is 80% done — let's finish it together`;
  const html = parentEmailLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      You're so close!
    </h2>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      A few days ago you started enrolling your child at ${centreName}, and your
      progress has been saved. We know forms aren't anyone's idea of fun, so we wanted
      to make sure nothing is holding you up.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border-radius:12px;overflow:hidden;background-color:#fefce8;">
      <tr>
        <td style="padding:20px;">
          <p style="margin:0 0 12px;color:#854d0e;font-size:15px;font-weight:700;">
            Common things that slow people down:
          </p>
          <p style="margin:0;color:#92400e;font-size:14px;line-height:2;">
            <strong>"I don't have my CRN handy"</strong> — No worries, you can skip that
            section and add it later<br/>
            <strong>"I need to check immunisation records"</strong> — We can accept
            these after enrolment<br/>
            <strong>"I'm not sure which days to pick"</strong> — Start with your best
            guess, changes are easy
          </p>
        </td>
      </tr>
    </table>
    ${buttonHtml("Continue Your Enrolment", enrolUrl)}
    <p style="margin:16px 0 0;color:#374151;font-size:14px;line-height:1.7;">
      Or if you'd rather do it together, reply with a time that suits you and we'll
      call to walk through it. Most families finish in under 5 minutes with us on the line.
    </p>
    <p style="margin:16px 0 0;color:#374151;font-size:14px;line-height:1.7;">
      Cheers,<br/>
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
  orientationVideoUrl?: string,
) {
  const subject = `Tomorrow's the big day! Everything you need to know`;
  const addressBlock = serviceAddress
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-radius:12px;overflow:hidden;background-color:#eff6ff;">
        <tr>
          <td style="padding:16px;">
            <p style="margin:0 0 4px;color:#1e40af;font-size:13px;font-weight:600;">WHERE TO GO</p>
            <p style="margin:0;color:#1e3a5f;font-size:15px;font-weight:700;">${serviceAddress}</p>
          </td>
        </tr>
      </table>`
    : "";
  const videoBlock = orientationVideoUrl
    ? `<p style="margin:16px 0 8px;color:#374151;font-size:14px;line-height:1.7;">
        One more thing — our 2-minute orientation video covers everything your child needs
        to know. Worth a watch tonight!
      </p>
      ${buttonHtml("Watch Orientation Video", orientationVideoUrl)}`
    : "";
  const html = parentEmailLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      See you tomorrow, ${firstName}!
    </h2>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Your child's first day at ${centreName} is tomorrow and we couldn't be more excited!
      Here's your quick-reference cheat sheet:
    </p>
    ${addressBlock}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="padding:16px;background-color:#f0fdf4;border-bottom:1px solid #dcfce7;">
          <p style="margin:0 0 4px;color:#065f46;font-size:13px;font-weight:600;">PACK THE BAG</p>
          <p style="margin:0;color:#047857;font-size:14px;line-height:1.8;">
            Water bottle (labelled) &#8226; Hat &#8226; Comfy clothes &#8226; Spare outfit &#8226;
            Sunscreen (applied before drop-off)
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:16px;background-color:#fefce8;border-bottom:1px solid #fde68a;">
          <p style="margin:0 0 4px;color:#854d0e;font-size:13px;font-weight:600;">KNOW THE TIMES</p>
          <p style="margin:0;color:#92400e;font-size:14px;line-height:1.8;">
            <strong>BSC:</strong> Drop off from 6:30 AM &nbsp;|&nbsp;
            <strong>ASC:</strong> Pick up by 6:00 PM
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:16px;background-color:#eff6ff;">
          <p style="margin:0 0 4px;color:#1e40af;font-size:13px;font-weight:600;">DON'T FORGET</p>
          <p style="margin:0;color:#1e3a5f;font-size:14px;line-height:1.8;">
            Sign in/out at the front desk &#8226; Only authorised people can collect your child &#8226;
            Any medication needs a signed form
          </p>
        </td>
      </tr>
    </table>
    ${videoBlock}
    <p style="margin:16px 0 0;color:#374151;font-size:14px;line-height:1.7;">
      Last-minute nerves (yours or theirs) are totally normal! Our educators are pros at
      helping children settle in. If you have any questions tonight, reply and we'll get
      back to you first thing.
    </p>
    <p style="margin:16px 0 0;color:#374151;font-size:14px;line-height:1.7;">
      See you soon!<br/>
      <strong>The ${centreName} Team</strong>
    </p>
  `);
  return { subject, html };
}

// ─── What to Bring (first_session day 0) ─────────────────────

export function nurtureWhatToBringEmail(firstName: string, centreName: string) {
  const subject = `The ultimate OSHC bag checklist (save this one!)`;
  const html = parentEmailLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Your OSHC packing list
    </h2>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Here's a handy checklist you can stick on the fridge or save to your phone.
      These are the things that make your child's day at ${centreName} run smoothly:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="padding:20px;background-color:#f0fdf4;">
          <p style="margin:0 0 12px;color:#065f46;font-size:15px;font-weight:700;">
            The Must-Haves:
          </p>
          <p style="margin:0;color:#047857;font-size:14px;line-height:2.2;">
            &#9745; Labelled water bottle (hydration = happy kids)<br/>
            &#9745; Labelled hat — broad-brimmed or legionnaire (we're a SunSmart centre)<br/>
            &#9745; Comfy clothes and closed-toe shoes for running around<br/>
            &#9745; Sunscreen applied before drop-off<br/>
            &#9745; A spare change of clothes (trust us on this one)
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:20px;border-top:1px solid #dcfce7;background-color:#fefce8;">
          <p style="margin:0 0 12px;color:#854d0e;font-size:15px;font-weight:700;">
            Good to Know:
          </p>
          <p style="margin:0;color:#92400e;font-size:14px;line-height:2.2;">
            &#9755; We serve breakfast during BSC and afternoon tea during ASC<br/>
            &#9755; Label everything with your child's name (socks included — they're escape artists)<br/>
            &#9755; Leave electronics and valuables at home unless needed for homework<br/>
            &#9755; Medication? Bring it with a signed medication form from the front desk
          </p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Pro tip from our experienced parents: pack the bag the night before and make it part
      of the routine. It saves a surprising amount of morning chaos!
    </p>
    <p style="margin:0;color:#374151;font-size:14px;line-height:1.7;">
      Happy packing,<br/>
      <strong>The ${centreName} Team</strong>
    </p>
  `);
  return { subject, html };
}

// ─── Day 1 Check-in (first_session +1d) ──────────────────────

export function nurtureDay1CheckinEmail(firstName: string, centreName: string) {
  const subject = `How did it go? We want to hear all about day one!`;
  const html = parentEmailLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Day one is done!
    </h2>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Your child just had their first day at ${centreName} — that's a big milestone for
      the whole family! We hope it went smoothly (and that you got a moment to breathe too).
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border-radius:12px;overflow:hidden;background-color:#f9fafb;">
      <tr>
        <td style="padding:20px;">
          <p style="margin:0 0 8px;color:#111827;font-size:14px;font-weight:600;">
            A few things that are totally normal:
          </p>
          <p style="margin:0;color:#374151;font-size:14px;line-height:2;">
            &#8226; Some children take a few sessions to fully settle in<br/>
            &#8226; They might be extra tired — new environments are exciting but draining<br/>
            &#8226; They might not remember everything they did (but we promise they were busy!)
          </p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      If anything felt off or you have questions, please tell us. We want to make sure your
      child looks forward to coming back. Just hit reply — we read every message.
    </p>
    <p style="margin:0;color:#374151;font-size:14px;line-height:1.7;">
      Proud of your little one,<br/>
      <strong>The ${centreName} Team</strong>
    </p>
  `);
  return { subject, html };
}

// ─── Day 3 Check-in (first_session +3d) ──────────────────────

export function nurtureDay3CheckinEmail(firstName: string, centreName: string) {
  const subject = `Getting into the groove at ${centreName}`;
  const html = parentEmailLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Quick check-in from us
    </h2>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      A few days in and your child is starting to find their rhythm at ${centreName}.
      By now they're probably beginning to recognise faces, find their favourite activities,
      and settle into the routine.
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      We just wanted to check: <strong>is everything going well from your end?</strong>
      Whether it's a small concern or a big question, we want to hear it now rather than later.
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Things like pickup logistics, dietary needs, or how your child is going socially —
      nothing is too small to bring up. Reply anytime.
    </p>
    <p style="margin:0;color:#374151;font-size:14px;line-height:1.7;">
      Here for you,<br/>
      <strong>The ${centreName} Team</strong>
    </p>
  `);
  return { subject, html };
}

// ─── App Setup (first_session +5d) ───────────────────────────

export function nurtureAppSetupEmail(firstName: string, centreName: string) {
  const subject = `Your secret weapon for staying in the loop`;
  const html = parentEmailLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Have you set up the parent app yet?
    </h2>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Now that your child is settling into ${centreName}, there's one more thing that'll
      make your life easier: the <strong>OWNA parent app</strong>. Think of it as your
      direct line to the centre, right in your pocket.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="padding:16px;background-color:#eff6ff;">
          <p style="margin:0 0 12px;color:#1e40af;font-size:15px;font-weight:700;">
            What you can do:
          </p>
          <p style="margin:0;color:#1e3a5f;font-size:14px;line-height:2;">
            &#128247; See daily activity updates and photos<br/>
            &#128197; View and manage bookings<br/>
            &#128276; Get instant notifications from the centre<br/>
            &#128221; Update family details and emergency contacts<br/>
            &#128176; Check statements and payment history
          </p>
        </td>
      </tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-radius:12px;overflow:hidden;background:linear-gradient(135deg, #004E64 0%, #006B87 100%);">
      <tr>
        <td style="padding:24px;">
          <p style="margin:0 0 12px;color:#FECE00;font-size:15px;font-weight:700;">
            Set up in 60 seconds:
          </p>
          <p style="margin:0;color:#ffffff;font-size:14px;line-height:2;">
            1. Download <strong>OWNA</strong> from the App Store or Google Play<br/>
            2. Sign up with the same email you enrolled with<br/>
            3. Follow the prompts to link your child's profile
          </p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Having trouble? Pop into the centre and our team will get you set up on the spot.
    </p>
    <p style="margin:0;color:#374151;font-size:14px;line-height:1.7;">
      Stay connected,<br/>
      <strong>The ${centreName} Team</strong>
    </p>
  `);
  return { subject, html };
}

// ─── First Week Guide (first_session +7d) ────────────────────

export function nurtureFirstWeekEmail(firstName: string, centreName: string) {
  const subject = `One week down! Here's what's coming up`;
  const html = parentEmailLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      You survived week one!
    </h2>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      A whole week at ${centreName} — congratulations to you AND your child! By now the
      morning routine is probably starting to feel a little more natural. Here's what to
      expect as you settle into the groove:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="padding:16px;background-color:#fefce8;border-bottom:1px solid #fde68a;">
          <p style="margin:0 0 4px;color:#854d0e;font-size:14px;font-weight:700;">Before School Care (BSC)</p>
          <p style="margin:0;color:#92400e;font-size:13px;line-height:1.7;">
            Drop-off from 6:30 AM. We serve breakfast, help with last-minute homework, then
            walk everyone to their classrooms before the bell. Your mornings just got easier.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:16px;background-color:#f0fdf4;border-bottom:1px solid #dcfce7;">
          <p style="margin:0 0 4px;color:#065f46;font-size:14px;font-weight:700;">After School Care (ASC)</p>
          <p style="margin:0;color:#047857;font-size:13px;line-height:1.7;">
            We collect children from classrooms. Afternoon tea, then a mix of planned activities
            and free play until pickup (by 6:00 PM). Art, sport, cooking, STEM — there's
            always something going on.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:16px;background-color:#eff6ff;">
          <p style="margin:0 0 4px;color:#1e40af;font-size:14px;font-weight:700;">What parents tell us helps</p>
          <p style="margin:0;color:#1e3a5f;font-size:13px;line-height:1.8;">
            &#8226; Keep drop-off goodbyes short and sweet — confidence is contagious<br/>
            &#8226; Ask your child specific questions: "What did you make today?" works
            better than "How was your day?"<br/>
            &#8226; Check the parent app for daily updates and photos<br/>
            &#8226; Let us know about any changes to routine, mood, or needs
          </p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      You're officially part of the ${centreName} family now. We're so glad you're here.
    </p>
    <p style="margin:0;color:#374151;font-size:14px;line-height:1.7;">
      Warm regards,<br/>
      <strong>The ${centreName} Team</strong>
    </p>
  `);
  return { subject, html };
}

// ─── Week 2 Feedback (first_session +14d) ────────────────────

export function nurtureWeek2FeedbackEmail(firstName: string, centreName: string) {
  const subject = `Two weeks in — we'd love a quick word from you`;
  const html = parentEmailLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      How's everything going?
    </h2>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      It's been two weeks since your child joined ${centreName}, and we'd genuinely love
      to know how you're finding things. Your feedback — good or bad — helps us get better
      for every family.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border-radius:12px;overflow:hidden;background-color:#f9fafb;">
      <tr>
        <td style="padding:20px;">
          <p style="margin:0 0 12px;color:#111827;font-size:14px;font-weight:600;">
            A few things we'd love to hear about:
          </p>
          <p style="margin:0;color:#374151;font-size:14px;line-height:2;">
            &#8226; Is your child enjoying their time here?<br/>
            &#8226; Has the drop-off/pickup process been smooth?<br/>
            &#8226; Is there anything we could be doing differently?<br/>
            &#8226; Any educators your child has particularly connected with?
          </p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Just hit reply — even a one-liner is incredibly helpful. We read and respond to every
      message personally.
    </p>
    <p style="margin:0;color:#374151;font-size:14px;line-height:1.7;">
      Thank you for trusting us with your family,<br/>
      <strong>The ${centreName} Team</strong>
    </p>
  `);
  return { subject, html };
}

// ─── NPS Survey (first_session +30d) ─────────────────────────

export function nurtureNpsSurveyEmail(firstName: string, centreName: string) {
  const surveyUrl = process.env.NPS_SURVEY_URL || "https://amanaoshc.company/survey/nps";
  const subject = `One question, 10 seconds — would you recommend us?`;
  const html = parentEmailLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      A month already!
    </h2>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      It's been a month since your child started at ${centreName}. Time flies when kids
      are having fun (and parents get their afternoons back!).
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      We have just one question for you. It's the single most important thing we track
      as a team, and it takes literally 10 seconds:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border-radius:12px;overflow:hidden;background:linear-gradient(135deg, #004E64 0%, #006B87 100%);">
      <tr>
        <td style="padding:24px;text-align:center;">
          <p style="margin:0 0 8px;color:#FECE00;font-size:18px;font-weight:700;">
            How likely are you to recommend us to a friend?
          </p>
          <p style="margin:0;color:rgba(255,255,255,0.8);font-size:13px;">
            Rate from 0 (not likely) to 10 (absolutely!)
          </p>
        </td>
      </tr>
    </table>
    ${buttonHtml("Share Your Rating", surveyUrl)}
    <p style="margin:16px 0 0;color:#6b7280;font-size:13px;line-height:1.6;">
      Anonymous. 10 seconds. Helps us improve for every family at ${centreName}.
    </p>
    <p style="margin:16px 0 0;color:#374151;font-size:14px;line-height:1.7;">
      Thank you for being part of our community,<br/>
      <strong>The ${centreName} Team</strong>
    </p>
  `);
  return { subject, html };
}

// ─── Referral (first_session +45d) ───────────────────────────

export function nurtureMonth1ReferralEmail(firstName: string, centreName: string) {
  const subject = `Know another family? We'll thank you with $50`;
  const html = parentEmailLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Share the love (and earn a reward)
    </h2>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Your child has been part of the ${centreName} family for over a month now, and
      we hope you've been happy with the experience. If so, we'd love your help
      spreading the word!
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border-radius:12px;overflow:hidden;background:linear-gradient(135deg, #004E64 0%, #006B87 100%);">
      <tr>
        <td style="padding:24px;text-align:center;">
          <p style="margin:0 0 8px;color:#FECE00;font-size:22px;font-weight:800;">
            $50 Referral Reward
          </p>
          <p style="margin:0;color:#ffffff;font-size:14px;line-height:1.6;">
            For every family you refer who enrols at ${centreName},<br/>
            you'll receive a <strong>$50 credit</strong> on your account.
          </p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      It's simple: just reply to this email with your friend's name and email (or phone
      number), and we'll reach out to them personally. No hard sell — just a friendly hello
      and an offer to answer any questions.
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Word of mouth from families like yours is the best way new families find us.
      Thank you for being part of our community!
    </p>
    <p style="margin:0;color:#374151;font-size:14px;line-height:1.7;">
      With gratitude,<br/>
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
  const subject = `We'll miss your family, ${firstName}`;
  const html = parentEmailLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Thank you for being part of our story
    </h2>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      We've heard that your family will be moving on from ${centreName}. While we're
      sad to see you go, we're grateful for the time your child spent with us and the
      memories they've made here.
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Before you go, we'd love to learn from your experience. Your honest feedback —
      whether it's praise, criticism, or somewhere in between — directly shapes how we
      improve for the families who come next.
    </p>
    ${buttonHtml("Share Your Experience (2 mins)", surveyUrl)}
    <p style="margin:16px 0 0;color:#6b7280;font-size:13px;">
      Your responses are confidential. This link expires in 30 days.
    </p>
    <p style="margin:16px 0 0;color:#374151;font-size:14px;line-height:1.7;">
      If your circumstances ever change, our door is always open. We'd love to
      welcome your family back.
    </p>
    <p style="margin:16px 0 0;color:#374151;font-size:14px;line-height:1.7;">
      Wishing your family all the best,<br/>
      <strong>The ${centreName} Team</strong>
    </p>
  `);
  return { subject, html };
}

// ═══════════════════════════════════════════════════════════════
// RETENTION TEMPLATES — Keeping existing families engaged
// ═══════════════════════════════════════════════════════════════

// ─── Casual Booking Re-engagement ────────────────────────────
// Triggered when a casual family hasn't booked in 14+ days

export function retentionCasualReengageEmail(firstName: string, centreName: string) {
  const subject = `We've missed seeing your family at ${centreName}!`;
  const html = parentEmailLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      It's been a while!
    </h2>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      We noticed it's been a couple of weeks since your child visited ${centreName},
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
      <strong>The ${centreName} Team</strong>
    </p>
  `);
  return { subject, html };
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

export function retentionWithdrawalInterceptEmail(firstName: string, centreName: string) {
  const subject = `Before you go — can we chat, ${firstName}?`;
  const html = parentEmailLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      We heard you might be leaving
    </h2>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      We noticed you've started the process of leaving ${centreName}, and we wanted
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
      <strong>The ${centreName} Team</strong>
    </p>
  `);
  return { subject, html };
}

// ─── Booking Day Change Reminder ─────────────────────────────
// Sent when recurring days are approaching and families may want to adjust

export function retentionDayChangeReminderEmail(firstName: string, centreName: string) {
  const subject = `Quick check — are your booking days still right?`;
  const html = parentEmailLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Time for a booking check-up
    </h2>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      Life changes, and so do schedules! We just wanted to check whether your current
      booking days at ${centreName} are still working for your family.
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
      <strong>The ${centreName} Team</strong>
    </p>
  `);
  return { subject, html };
}
