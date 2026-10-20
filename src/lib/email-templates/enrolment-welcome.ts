/**
 * The welcome email a family gets when staff approve their enrolment
 * (Daniel, 15 Oct 2026). It REPLACES the plain "enrolment is confirmed"
 * email — one email at approval, never two.
 *
 * School-specific: the centre's coordinator (name + photo), session times,
 * where to find us, first-session tips, the school's welcome pack, the next
 * few weeks of planned activities (from the centre's Program, synced from
 * SharePoint), an extra-days offer, and the OWNA / CCS next steps. Every
 * section disappears when its data is missing — never rendered empty.
 *
 * Pure: the data comes from src/lib/enrolment-welcome.ts. The wording around
 * the sections is editable at Settings → Email Templates ("parent.enrolmentWelcome").
 */
import { applyEmailTemplateOverride } from "@/lib/email-template-overrides";
import { buttonHtml, escapeHtml, parentEmailLayout } from "./base";
import { FAMILY_BOOKINGS_EMAIL, FAMILY_BOOKINGS_PHONE, bookingsContactHtml } from "@/lib/family-contact";
import { croppedCoordinatorPhoto } from "@/lib/coordinator-photo";
import { DEFAULT_FIRST_SESSION_TIPS } from "@/lib/centre-welcome-defaults";

export { DEFAULT_FIRST_SESSION_TIPS };

export const GREEN = "#004E64";
export const JONQUIL = "#FECE00";
export const CHIFFON = "#FFF2BF";
const LATTE = "#FFFAE6";
export const BODY = "#374151";

export interface WelcomeProgramWeek {
  /** "Week of 20 October" */
  label: string;
  /** Up to four activity names. */
  activities: string[];
}

export interface EnrolmentWelcomeData {
  parentFirstName: string;
  childNames: string[];
  centreName: string;
  coordinatorName: string | null;
  coordinatorPhoto: string | null;
  centrePhone: string | null;
  centreEmail: string | null;
  /** "Before school 6:30am – 8:30am", "After school 3:00pm – 6:30pm" */
  sessionTimes: string[];
  locationWithinSchool: string | null;
  /** Google Maps link to the school, from the centre's address. */
  directionsUrl?: string | null;
  /** The centre's map from the website (where we are within the school). */
  mapImageUrl?: string | null;
  meetingPoints: string | null;
  firstSessionTips: string[];
  welcomeNote: string | null;
  welcomePackUrl: string | null;
  centrePageUrl: string | null;
  program: WelcomeProgramWeek[];
  /** Email-verification link, when the address isn't verified yet. */
  verifyLink: string | null;
}


export const p = (html: string, extra = "") =>
  `<p style="margin:0 0 16px;color:${BODY};font-size:15px;line-height:1.7;${extra}">${html}</p>`;

export function sectionTitle(text: string) {
  return `<p style="margin:0 0 10px;color:${GREEN};font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">${text}</p>`;
}

export function joinNames(names: string[], fallback = "your child"): string {
  const n = names.filter(Boolean);
  if (n.length === 0) return fallback;
  if (n.length === 1) return n[0];
  return `${n.slice(0, -1).join(", ")} and ${n.at(-1)}`;
}

export function coordinatorCard(d: EnrolmentWelcomeData) {
  // Always shown now: it carries the bookings contact too (20 Oct 2026).
  const photo = d.coordinatorPhoto
    ? `<td width="76" valign="top" style="padding-right:14px;">
         <img src="${escapeHtml(croppedCoordinatorPhoto(d.coordinatorPhoto))}" alt="${escapeHtml(d.coordinatorName ?? "Your coordinator")}" width="70" height="70"
              style="display:block;width:70px;height:70px;border-radius:50%;border:3px solid ${JONQUIL};object-fit:cover;" />
       </td>`
    : "";
  // The centre's own phone is the contact (Daniel, 20 Oct 2026 — no inbox
  // address here; replies to the email still reach us).
  const contact = [
    d.centrePhone ? `<a href="tel:${escapeHtml(d.centrePhone.replace(/\s+/g, ""))}" style="color:${GREEN};font-weight:700;text-decoration:none;">${escapeHtml(d.centrePhone)}</a>` : "",
  ]
    .filter(Boolean)
    .join("<br/>");
  return `
  <table width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;background-color:${CHIFFON};border-radius:14px;">
    <tr><td style="padding:20px;">
      <table cellpadding="0" cellspacing="0" width="100%"><tr>
        ${photo}
        <td valign="middle">
          <p style="margin:0 0 2px;color:${GREEN};font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Your coordinator</p>
          ${d.coordinatorName ? `<p style="margin:0 0 6px;color:${GREEN};font-size:20px;font-weight:700;">${escapeHtml(d.coordinatorName)}</p>` : ""}
          <p style="margin:0 0 6px;color:${BODY};font-size:14px;line-height:1.6;">
            ${d.coordinatorName ? `${escapeHtml(d.coordinatorName.split(" ")[0])} and the team will` : "Our team will"} be there to welcome you.${contact ? " On the day — drop-off, pick-up or checking on your child — call the centre:" : ""}
          </p>
          ${contact ? `<p style="margin:0 0 8px;font-size:14px;line-height:1.7;">${contact}</p>` : ""}
          <p style="margin:0;color:${BODY};font-size:13px;line-height:1.6;">Bookings, changes or fees: ${bookingsContactHtml(GREEN)}.</p>
        </td>
      </tr></table>
    </td></tr>
  </table>`;
}

export function firstSessionBlock(
  d: EnrolmentWelcomeData,
  opts: { title?: string; defaultTips?: string[] } = {},
) {
  const facts: string[] = [];
  if (d.sessionTimes.length) facts.push(`<strong>Session times:</strong> ${d.sessionTimes.map(escapeHtml).join(" · ")}`);
  const directions = d.directionsUrl
    ? `<a href="${escapeHtml(d.directionsUrl)}" style="color:${GREEN};font-weight:700;text-decoration:underline;">Get directions</a>`
    : "";
  if (d.locationWithinSchool || directions)
    facts.push(
      `<strong>Where to find us:</strong> ${[d.locationWithinSchool ? escapeHtml(d.locationWithinSchool) : "", directions].filter(Boolean).join(" · ")}`,
    );
  if (d.meetingPoints) facts.push(`<strong>Drop-off &amp; pick-up:</strong> ${escapeHtml(d.meetingPoints)}`);
  const map = d.mapImageUrl
    ? `<img src="${escapeHtml(d.mapImageUrl)}" alt="Map showing where to find us at ${escapeHtml(d.centreName)}" width="100%"
            style="display:block;width:100%;max-width:360px;height:auto;margin:4px auto 12px;border-radius:10px;border:1px solid ${CHIFFON};" />`
    : "";
  const tips = d.firstSessionTips.length ? d.firstSessionTips : (opts.defaultTips ?? DEFAULT_FIRST_SESSION_TIPS);
  const rows = tips
    .map(
      (t) => `<tr>
        <td width="28" valign="top" style="padding:4px 0;color:${GREEN};font-size:16px;font-weight:700;">&#10003;</td>
        <td style="padding:4px 0;color:${BODY};font-size:14px;line-height:1.6;">${escapeHtml(t)}</td>
      </tr>`,
    )
    .join("");
  return `
  <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border:1px solid ${CHIFFON};border-radius:14px;">
    <tr><td style="padding:20px;">
      ${sectionTitle(opts.title ?? "Good to know before your first session")}
      ${facts.map((f) => `<p style="margin:0 0 8px;color:${BODY};font-size:14px;line-height:1.6;">${f}</p>`).join("")}
      ${map}
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-top:${facts.length ? "8px" : "0"};">${rows}</table>
    </td></tr>
  </table>`;
}

export function welcomePackBlock(d: EnrolmentWelcomeData) {
  if (!d.welcomePackUrl) return "";
  return `
  <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background-color:${GREEN};border-radius:14px;">
    <tr><td style="padding:24px;text-align:center;">
      <p style="margin:0 0 6px;color:${JONQUIL};font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Your welcome pack</p>
      <p style="margin:0;color:#ffffff;font-size:15px;line-height:1.6;">
        Everything you need to know about ${escapeHtml(d.centreName)}: our day, food, policies and who to call.
      </p>
      ${buttonHtml("Read the welcome pack", escapeHtml(d.welcomePackUrl))}
    </td></tr>
  </table>`;
}

function programBlock(d: EnrolmentWelcomeData) {
  const weeks = d.program.filter((w) => w.activities.length);
  if (!weeks.length) return "";
  const cells = weeks
    .map(
      (w) => `<tr><td style="padding:12px 16px;border-top:1px solid ${CHIFFON};">
        <p style="margin:0 0 4px;color:${GREEN};font-size:14px;font-weight:700;">${escapeHtml(w.label)}</p>
        <p style="margin:0;color:${BODY};font-size:14px;line-height:1.6;">${w.activities.map(escapeHtml).join(" &#8226; ")}</p>
      </td></tr>`,
    )
    .join("");
  return `
  <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background-color:${LATTE};border-radius:14px;">
    <tr><td style="padding:20px 16px 4px;">${sectionTitle("Coming up at " + escapeHtml(d.centreName))}</td></tr>
    ${cells}
    <tr><td style="padding:4px 16px 16px;"></td></tr>
  </table>`;
}

function extraDaysBlock(d: EnrolmentWelcomeData) {
  const email = FAMILY_BOOKINGS_EMAIL;
  return `
  <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border-left:4px solid ${JONQUIL};">
    <tr><td style="padding:4px 0 4px 16px;">
      <p style="margin:0 0 4px;color:${GREEN};font-size:16px;font-weight:700;">Like the look of something? Add an extra day.</p>
      <p style="margin:0;color:${BODY};font-size:14px;line-height:1.6;">
        Book it in the <strong>OWNA app</strong>, email
        <a href="mailto:${escapeHtml(email)}" style="color:${GREEN};font-weight:700;word-break:break-all;">${escapeHtml(email)}</a>
        or call <strong>${FAMILY_BOOKINGS_PHONE}</strong>, and we'll add it for you.
      </p>
    </td></tr>
  </table>`;
}

function nextStepsBlock(child: string) {
  const li = (t: string) => `<li style="margin:0 0 8px;color:${BODY};font-size:14px;line-height:1.6;">${t}</li>`;
  return `
  ${sectionTitle("What happens next")}
  <ol style="margin:0 0 16px;padding-left:20px;">
    ${li("We set your family up in <strong>OWNA</strong>, where you book sessions and pay fees. Watch for your OWNA invitation (check junk too). Your Amana password doesn't sign you into OWNA.")}
    ${li("Claiming Child Care Subsidy? When Services Australia asks, confirm the enrolment in your <strong>myGov / Centrelink</strong> account so your fees can be subsidised.")}
    ${li(`We'll confirm ${child}'s first booked day with you before they start.`)}
  </ol>`;
}

function verifyBlock(d: EnrolmentWelcomeData, child: string) {
  if (!d.verifyLink) return "";
  return `
  ${p(`One quick thing: please confirm your email address so important updates about ${child} reach you.`)}
  ${buttonHtml("Confirm my email address", escapeHtml(d.verifyLink))}
  <p style="margin:-8px 0 20px;color:#6b7280;font-size:13px;text-align:center;">This link expires in 24 hours. If it does, just ask us for a new one.</p>`;
}

const DEFAULT_SUBJECT = "Welcome to Amana OSHC, {{firstName}}! We can't wait to see {{childNamesPlain}}";

const DEFAULT_BODY = `
<h1 style="margin:0 0 12px;color:${GREEN};font-size:26px;font-weight:700;line-height:1.25;">
  Welcome to the Amana family, {{firstName}}!
</h1>
<p style="margin:0 0 16px;color:${BODY};font-size:15px;line-height:1.7;">
  Assalamu alaikum! {{childNames}}'s enrolment at <strong>{{centreName}}</strong> is confirmed,
  and we can't wait to have them with us. Here's everything you need for a great start.
</p>
{{welcomeNote}}
{{verifyBlock}}
{{coordinatorCard}}
{{firstSessionBlock}}
{{welcomePackBlock}}
{{programBlock}}
{{extraDaysBlock}}
{{nextStepsBlock}}
<p style="margin:16px 0 0;color:${BODY};font-size:15px;line-height:1.7;">
  Jazak Allahu Khairan,<br/><strong>The {{centreName}} team</strong>
</p>`;

export async function enrolmentWelcomeEmail(d: EnrolmentWelcomeData): Promise<{ subject: string; html: string }> {
  const childPlain = joinNames(d.childNames);
  const child = escapeHtml(childPlain);
  return applyEmailTemplateOverride({
    key: "parent.enrolmentWelcome",
    defaultSubject: DEFAULT_SUBJECT,
    defaultBody: DEFAULT_BODY,
    vars: {
      // Subject is plain text; body vars are escaped HTML.
      firstName: escapeHtml(d.parentFirstName || "there"),
      childNamesPlain: childPlain,
      childNames: child,
      centreName: escapeHtml(d.centreName),
      welcomeNote: d.welcomeNote ? p(escapeHtml(d.welcomeNote).replace(/\n/g, "<br/>"), "font-style:italic;") : "",
      verifyBlock: verifyBlock(d, child),
      coordinatorCard: coordinatorCard(d),
      firstSessionBlock: firstSessionBlock(d),
      welcomePackBlock: welcomePackBlock(d),
      programBlock: programBlock(d),
      extraDaysBlock: extraDaysBlock(d),
      nextStepsBlock: nextStepsBlock(child),
    },
    wrap: (body) =>
      parentEmailLayout(body, {
        transactional: true,
        preheader: `Meet your coordinator, what to know before day one, and what's coming up at ${escapeHtml(d.centreName)}.`,
      }),
  }).then((r) => ({
    // The subject template interpolates firstName escaped — undo for the plain-text subject line.
    ...r,
    subject: r.subject.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">"),
  }));
}
