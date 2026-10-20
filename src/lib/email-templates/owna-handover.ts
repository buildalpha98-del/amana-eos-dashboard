/**
 * The OWNA handover emails (Daniel, 16 Oct 2026) — sent when staff tick the
 * OWNA checklist on an enrolment, so the family always knows the next step:
 *
 *   ownaInvitationEmail   — "Invitation sent": how to get into OWNA, step by step
 *   ownaExistingEmail     — "Existing access": you're all set, use your login
 *   firstDayConfirmedEmail— "First sessions confirmed": the real first day
 *   casualBookingsEmail   — "Casual bookings only": OWNA's ready, how to book
 *   ownaNudgeEmail        — invitation sent 3+ days ago, still no access
 *
 * Same look and centre details as the welcome email. Wording editable at
 * Settings → Email Templates (keys parent.owna*, parent.firstDayConfirmed).
 */
import { DEFAULT_FIRST_DAY_EXPECT } from "@/lib/centre-welcome-defaults";
import { applyEmailTemplateOverride } from "@/lib/email-template-overrides";
import { escapeHtml, parentEmailLayout } from "./base";
import {
  BODY,
  CHIFFON,
  GREEN,
  JONQUIL,
  coordinatorCard,
  firstSessionBlock,
  joinNames,
  p,
  sectionTitle,
  type EnrolmentWelcomeData,
} from "./enrolment-welcome";

export type HandoverEmailData = Omit<EnrolmentWelcomeData, "verifyLink" | "program" | "welcomeNote"> & {
  /** The parent's email — the address their OWNA invitation goes to. */
  parentEmail: string;
  /** First booked day, "2026-10-21" (firstDayConfirmedEmail only). */
  firstDay?: string;
};

function plain(subject: string) {
  return subject.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

/** "Tuesday 21 October" */
export function formatFirstDay(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

function numberedSteps(steps: { title: string; body: string }[]) {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
  ${steps
    .map(
      (s, i) => `<tr>
      <td width="44" valign="top" style="padding:0 0 16px;">
        <div style="width:32px;height:32px;border-radius:50%;background-color:${JONQUIL};color:${GREEN};font-size:16px;font-weight:700;line-height:32px;text-align:center;">${i + 1}</div>
      </td>
      <td valign="top" style="padding:4px 0 16px;">
        <p style="margin:0 0 4px;color:${GREEN};font-size:15px;font-weight:700;">${s.title}</p>
        <p style="margin:0;color:${BODY};font-size:14px;line-height:1.6;">${s.body}</p>
      </td>
    </tr>`,
    )
    .join("")}
  </table>`;
}

function helpLine(d: HandoverEmailData) {
  const bits = [
    d.centrePhone ? `call us on <strong>${escapeHtml(d.centrePhone)}</strong>` : "",
    `email <a href="mailto:${escapeHtml(d.centreEmail || "enrolments@amanaoshc.com.au")}" style="color:${GREEN};font-weight:700;word-break:break-all;">${escapeHtml(d.centreEmail || "enrolments@amanaoshc.com.au")}</a>`,
  ].filter(Boolean);
  return p(`Stuck at any step? ${bits.join(" or ")} and we'll sort it out with you.`);
}

const signOff = `<p style="margin:16px 0 0;color:${BODY};font-size:15px;line-height:1.7;">Jazak Allahu Khairan,<br/><strong>The {{centreName}} team</strong></p>`;

function baseVars(d: HandoverEmailData) {
  const child = joinNames(d.childNames);
  return {
    firstName: escapeHtml(d.parentFirstName || "there"),
    childNames: escapeHtml(child),
    childNamesPlain: child,
    /** "is" for one child, "are" for siblings — "Aysha and Yarah are booked in". */
    isAre: d.childNames.filter(Boolean).length > 1 ? "are" : "is",
    centreName: escapeHtml(d.centreName),
    parentEmail: escapeHtml(d.parentEmail),
    helpLine: helpLine(d),
  };
}

// ── Invitation sent ──────────────────────────────────────────

export async function ownaInvitationEmail(d: HandoverEmailData) {
  // Values are filled in here: template variables are substituted in ONE
  // pass, so a {{placeholder}} inside another variable would stay literal.
  const v = baseVars(d);
  const steps = numberedSteps([
    {
      title: "Find your invitation",
      body: `Look for an email from <strong>OWNA</strong> sent to <strong>${v.parentEmail}</strong>. If it's not there, check your junk or promotions folder.`,
    },
    {
      title: "Get the OWNA app",
      body: `Search <strong>“OWNA”</strong> in the App Store or Google Play and download it.`,
    },
    {
      title: "Set your password and sign in",
      body: `Use the link in the invitation, then sign in with the same email. Your OWNA login is separate from your Amana enrolment login.`,
    },
    {
      title: `Check ${v.childNames}'s days`,
      body: `Your booked sessions show in OWNA. That's also where you add extra days, mark absences and pay fees.`,
    },
  ]);
  return applyEmailTemplateOverride({
    key: "parent.ownaInvitation",
    defaultSubject: "Your OWNA invitation is on its way, {{firstName}}",
    defaultBody: `
<h1 style="margin:0 0 12px;color:${GREEN};font-size:24px;font-weight:700;line-height:1.25;">Let's get you into OWNA</h1>
<p style="margin:0 0 16px;color:${BODY};font-size:15px;line-height:1.7;">
  Assalamu alaikum {{firstName}}! We've set {{childNames}} up at <strong>{{centreName}}</strong> and sent you an
  invitation to <strong>OWNA</strong> — the app where you book sessions, see sign-ins and daily updates, and pay fees.
  It takes about five minutes:
</p>
{{steps}}
{{helpLine}}
${signOff}`,
    vars: { ...v, steps },
    wrap: (b) => parentEmailLayout(b, { transactional: true, preheader: "Four quick steps to get into OWNA and see your booked days." }),
  }).then((r) => ({ ...r, subject: plain(r.subject) }));
}

// ── Existing access ──────────────────────────────────────────

export async function ownaExistingEmail(d: HandoverEmailData) {
  return applyEmailTemplateOverride({
    key: "parent.ownaExisting",
    defaultSubject: "{{childNamesPlain}} is now in your OWNA account",
    defaultBody: `
<h1 style="margin:0 0 12px;color:${GREEN};font-size:24px;font-weight:700;line-height:1.25;">You're all set in OWNA</h1>
<p style="margin:0 0 16px;color:${BODY};font-size:15px;line-height:1.7;">
  Assalamu alaikum {{firstName}}! We've added {{childNames}} at <strong>{{centreName}}</strong> to the OWNA account
  you already use. Just sign in as usual: your booked days, sign-ins, daily updates and fees are all there.
</p>
{{helpLine}}
${signOff}`,
    vars: baseVars(d),
    wrap: (b) => parentEmailLayout(b, { transactional: true, preheader: "Sign in to OWNA as usual — everything's there." }),
  }).then((r) => ({ ...r, subject: plain(r.subject) }));
}

// ── First day confirmed ──────────────────────────────────────

export async function firstDayConfirmedEmail(d: HandoverEmailData) {
  const day = d.firstDay ? formatFirstDay(d.firstDay) : "your first booked day";
  const dateCard = `
  <table width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;background-color:${GREEN};border-radius:14px;">
    <tr><td style="padding:22px;text-align:center;">
      <p style="margin:0 0 4px;color:${JONQUIL};font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">First day</p>
      <p style="margin:0;color:#ffffff;font-size:26px;font-weight:700;">${escapeHtml(day)}</p>
    </td></tr>
  </table>`;
  return applyEmailTemplateOverride({
    key: "parent.firstDayConfirmed",
    defaultSubject: "You're booked in! {{childNamesPlain}}'s first day is {{firstDayPlain}}",
    defaultBody: `
<h1 style="margin:0 0 12px;color:${GREEN};font-size:24px;font-weight:700;line-height:1.25;">See you soon, {{childNames}}!</h1>
<p style="margin:0 0 8px;color:${BODY};font-size:15px;line-height:1.7;">
  Assalamu alaikum {{firstName}}! It's official — {{childNames}} {{isAre}} booked in at <strong>{{centreName}}</strong>.
</p>
{{dateCard}}
{{coordinatorCard}}
{{firstSessionBlock}}
{{welcomePack}}
<p style="margin:0 0 16px;color:${BODY};font-size:15px;line-height:1.7;">
  We'll send a quick reminder the day before. Need to change the date? Let us know and we'll sort it out in OWNA.
</p>
${signOff}`,
    vars: {
      ...baseVars(d),
      firstDay: escapeHtml(day),
      firstDayPlain: day,
      dateCard,
      coordinatorCard: coordinatorCard({ ...d, program: [], welcomeNote: null, verifyLink: null }),
      firstSessionBlock: firstSessionBlock(
        { ...d, program: [], welcomeNote: null, verifyLink: null },
        { title: "What to expect", defaultTips: DEFAULT_FIRST_DAY_EXPECT },
      ),
      // The PDF itself is attached by the sender (onHandoffStepCompleted).
      welcomePack: d.welcomePackUrl
        ? `<p style="margin:0 0 16px;color:${BODY};font-size:15px;line-height:1.7;">&#128206; <strong>Your welcome pack is attached</strong> — our day, food, policies and who to call at ${escapeHtml(d.centreName)}.</p>`
        : "",
    },
    wrap: (b) => parentEmailLayout(b, { transactional: true, preheader: `${day} — session times, where to find us and what to expect.` }),
  }).then((r) => ({ ...r, subject: plain(r.subject) }));
}

// ── Casual bookings only ─────────────────────────────────────

/**
 * Daniel, 20 Oct 2026: a casual-only family has no first day, but still
 * hears from us — their OWNA account is ready, here's how to book, and
 * the welcome pack, same as everyone else.
 */
export async function casualBookingsEmail(d: HandoverEmailData) {
  const v = baseVars(d);
  const centreEmail = escapeHtml(d.centreEmail || "enrolments@amanaoshc.com.au");
  const steps = numberedSteps([
    {
      title: "Book in the OWNA app",
      body: `Open <strong>OWNA</strong>, choose the day and session you need for ${v.childNames}, and send the booking. You'll see it confirmed in the app.`,
    },
    {
      title: "Or email us",
      body: `Send <a href="mailto:${centreEmail}" style="color:${GREEN};font-weight:700;word-break:break-all;">${centreEmail}</a> your child's name, the date and the session, and we'll book it in OWNA for you.`,
    },
  ]);
  return applyEmailTemplateOverride({
    key: "parent.casualBookings",
    defaultSubject: "You're ready to book, {{firstName}} — {{childNamesPlain}} is set up in OWNA",
    defaultBody: `
<h1 style="margin:0 0 12px;color:${GREEN};font-size:24px;font-weight:700;line-height:1.25;">You're all set to book</h1>
<p style="margin:0 0 16px;color:${BODY};font-size:15px;line-height:1.7;">
  Assalamu alaikum {{firstName}}! Just letting you know we've successfully set {{childNames}} up in your
  <strong>OWNA</strong> account at <strong>{{centreName}}</strong>. We can see you're looking for casual bookings,
  so there's no set first day — book whenever you need us. Here's how:
</p>
{{steps}}
{{coordinatorCard}}
{{welcomePack}}
{{helpLine}}
${signOff}`,
    vars: {
      ...v,
      steps,
      coordinatorCard: coordinatorCard({ ...d, program: [], welcomeNote: null, verifyLink: null }),
      // The PDF itself is attached by the sender (onHandoffStepCompleted).
      welcomePack: d.welcomePackUrl
        ? `<p style="margin:0 0 16px;color:${BODY};font-size:15px;line-height:1.7;">&#128206; <strong>Your welcome pack is attached</strong> — our day, food, policies and who to call at ${escapeHtml(d.centreName)}.</p>`
        : "",
    },
    wrap: (b) => parentEmailLayout(b, { transactional: true, preheader: "Book a casual session in the OWNA app, or just email us." }),
  }).then((r) => ({ ...r, subject: plain(r.subject) }));
}

// ── Invitation not accepted yet ──────────────────────────────

export async function ownaNudgeEmail(d: HandoverEmailData) {
  const v = baseVars(d);
  const tips = `
  <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background-color:${CHIFFON};border-radius:14px;">
    <tr><td style="padding:20px;">
      ${sectionTitle("Can't find it?")}
      <p style="margin:0 0 8px;color:${BODY};font-size:14px;line-height:1.6;">&#8226; Search your inbox for <strong>“OWNA”</strong> — including junk, spam and promotions.</p>
      <p style="margin:0 0 8px;color:${BODY};font-size:14px;line-height:1.6;">&#8226; It went to <strong>${v.parentEmail}</strong>. Use a different email? Tell us and we'll resend it.</p>
      <p style="margin:0;color:${BODY};font-size:14px;line-height:1.6;">&#8226; Link expired? Just reply and we'll send a fresh one.</p>
    </td></tr>
  </table>`;
  return applyEmailTemplateOverride({
    key: "parent.ownaNudge",
    defaultSubject: "Did your OWNA invitation arrive, {{firstName}}?",
    defaultBody: `
<h1 style="margin:0 0 12px;color:${GREEN};font-size:24px;font-weight:700;line-height:1.25;">Quick check on OWNA</h1>
<p style="margin:0 0 16px;color:${BODY};font-size:15px;line-height:1.7;">
  Assalamu alaikum {{firstName}}! We sent your OWNA invitation a few days ago and it looks like it hasn't been
  used yet. OWNA is where you'll see {{childNames}}'s booked days and pay fees, so let's get you in.
</p>
{{tips}}
{{helpLine}}
${signOff}`,
    vars: { ...v, tips },
    wrap: (b) => parentEmailLayout(b, { transactional: true, preheader: "Can't find the invitation? Here's how to track it down." }),
  }).then((r) => ({ ...r, subject: plain(r.subject) }));
}

