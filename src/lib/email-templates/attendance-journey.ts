/**
 * Attendance-based family emails (Daniel, 16 Oct 2026; src/lib/attendance-journey.ts):
 *   noShowEmail  — approved 14+ days, not attended: "Is anything stopping you?"
 *                  with one-tap answers (each a signed link)
 *   extraDayEmail— three weeks in: what's on next week + add an extra day
 * Wording editable at Settings → Email Templates (parent.noShow / parent.extraDay).
 */
import { applyEmailTemplateOverride } from "@/lib/email-template-overrides";
import { buttonHtml, escapeHtml, parentEmailLayout } from "./base";
import { BODY, CHIFFON, GREEN, JONQUIL, joinNames, sectionTitle, type EnrolmentWelcomeData, type WelcomeProgramWeek } from "./enrolment-welcome";

type Centre = Omit<EnrolmentWelcomeData, "verifyLink" | "program" | "welcomeNote">;

const plain = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");

const signOff = `<p style="margin:16px 0 0;color:${BODY};font-size:15px;line-height:1.7;">Jazak Allahu Khairan,<br/><strong>The {{centreName}} team</strong></p>`;

const ANSWERS: { key: string; label: string }[] = [
  { key: "not_booked", label: "We haven't booked any days yet" },
  { key: "owna_trouble", label: "We're having trouble with OWNA" },
  { key: "next_term", label: "We're starting next term" },
  { key: "changed_plans", label: "Our plans have changed" },
  { key: "other", label: "Something else — please call me" },
];

export async function noShowEmail(d: Centre & { links: Record<string, string> }) {
  const child = joinNames(d.childNames);
  const buttons = ANSWERS.map(
    (a) => `<tr><td style="padding:0 0 10px;">
      <a href="${escapeHtml(d.links[a.key] ?? "#")}" style="display:block;padding:14px 18px;border:2px solid ${GREEN};border-radius:12px;color:${GREEN};font-size:15px;font-weight:700;text-decoration:none;background-color:#ffffff;">
        ${escapeHtml(a.label)} &rarr;
      </a></td></tr>`,
  ).join("");
  const answers = `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">${buttons}</table>`;
  const contact = d.centrePhone
    ? `Or call us any time on <strong>${escapeHtml(d.centrePhone)}</strong>.`
    : `Or email <a href="mailto:${escapeHtml(d.centreEmail || "enrolments@amanaoshc.com.au")}" style="color:${GREEN};font-weight:700;">${escapeHtml(d.centreEmail || "enrolments@amanaoshc.com.au")}</a>.`;
  return applyEmailTemplateOverride({
    key: "parent.noShow",
    defaultSubject: "Is anything stopping {{childNamesPlain}} starting, {{firstName}}?",
    defaultBody: `
<h1 style="margin:0 0 12px;color:${GREEN};font-size:24px;font-weight:700;line-height:1.25;">We'd love to see {{childNames}} soon</h1>
<p style="margin:0 0 16px;color:${BODY};font-size:15px;line-height:1.7;">
  Assalamu alaikum {{firstName}}! {{childNames}}'s place at <strong>{{centreName}}</strong> is all ready, and we noticed
  they haven't started with us yet. Is anything getting in the way? Tap the one that fits and we'll take it from there:
</p>
{{answers}}
<p style="margin:0 0 16px;color:${BODY};font-size:14px;line-height:1.7;">{{contact}}</p>
${signOff}`,
    vars: {
      firstName: escapeHtml(d.parentFirstName || "there"),
      childNames: escapeHtml(child),
      childNamesPlain: child,
      centreName: escapeHtml(d.centreName),
      answers,
      contact,
    },
    wrap: (b) => parentEmailLayout(b, { transactional: true, preheader: "One tap tells us how we can help." }),
  }).then((r) => ({ ...r, subject: plain(r.subject) }));
}

export async function extraDayEmail(d: Centre & { nextWeek: WelcomeProgramWeek | null }) {
  const child = joinNames(d.childNames);
  const email = d.centreEmail || "enrolments@amanaoshc.com.au";
  const week = d.nextWeek?.activities.length
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background-color:${CHIFFON};border-radius:14px;">
        <tr><td style="padding:20px;">
          ${sectionTitle(escapeHtml(`Coming up — ${d.nextWeek.label.replace(/^Week of /, "week of ")}`))}
          ${d.nextWeek.activities
            .map((a) => `<p style="margin:0 0 6px;color:${BODY};font-size:15px;line-height:1.5;"><span style="color:${JONQUIL};">&#9679;</span>&nbsp; ${escapeHtml(a)}</p>`)
            .join("")}
        </td></tr>
      </table>`
    : "";
  return applyEmailTemplateOverride({
    key: "parent.extraDay",
    defaultSubject: "{{childNamesPlain}} is settling in beautifully — fancy an extra day?",
    defaultBody: `
<h1 style="margin:0 0 12px;color:${GREEN};font-size:24px;font-weight:700;line-height:1.25;">Three weeks in!</h1>
<p style="margin:0 0 16px;color:${BODY};font-size:15px;line-height:1.7;">
  Assalamu alaikum {{firstName}}! {{childNames}} has been with us at <strong>{{centreName}}</strong> for three weeks now, and
  it's been lovely getting to know them. If they'd like a bit more time with their friends, adding a day is easy.
</p>
{{week}}
{{button}}
<p style="margin:0 0 16px;color:${BODY};font-size:14px;line-height:1.7;text-align:center;">
  Book it in the <strong>OWNA app</strong>, or reply to this email and we'll add it for you.
</p>
${signOff}`,
    vars: {
      firstName: escapeHtml(d.parentFirstName || "there"),
      childNames: escapeHtml(child),
      childNamesPlain: child,
      centreName: escapeHtml(d.centreName),
      week,
      button: buttonHtml("Ask us to add a day", `mailto:${escapeHtml(email)}?subject=${encodeURIComponent(`Extra day for ${child}`)}`),
    },
    wrap: (b) => parentEmailLayout(b, { transactional: false, preheader: "What's on next week, and how to add a day." }),
  }).then((r) => ({ ...r, subject: plain(r.subject) }));
}
