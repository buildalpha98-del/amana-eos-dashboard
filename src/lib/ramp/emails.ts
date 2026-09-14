/**
 * 90-day ramp emails. All swallow-and-log: the cron/route that calls them
 * has already committed state, and a mail hiccup must not throw it back.
 */
import { baseLayout, buttonHtml } from "@/lib/email-templates/base";
import { sendEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import { siteUrl } from "@/lib/site-url";
import { RAMP_MOOD_LABELS, RAMP_RECOMMENDATION_LABELS } from "./constants";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

async function safeSend(to: string, subject: string, html: string, ctx: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await sendEmail({ to, subject, html });
    return res.sent.length > 0;
  } catch (err) {
    logger.error("ramp email failed", { err, to, subject, ...ctx });
    return false;
  }
}

/** Friday pulse to the starter. */
export async function sendRampCheckInEmail(opts: {
  email: string;
  name: string;
  weekNumber: number;
  token: string;
}): Promise<boolean> {
  const url = `${siteUrl()}/ramp-checkin/${opts.token}`;
  const heading = opts.weekNumber === 1 ? "How was your first week?" : `How was week ${opts.weekNumber}?`;
  const html = baseLayout(
    `
      <h2 style="margin:0 0 16px;">${heading}</h2>
      <p>Hi ${escapeHtml(firstName(opts.name))}, it's your weekly check-in. Three quick questions — what went well, what's been hard, and whether you need anything from us.</p>
      <p>It takes about a minute and there's no need to log in. Your answers go to your service manager and the State Manager team.</p>
      ${buttonHtml("Share how your week went", url)}
    `,
    "staff",
  );
  return safeSend(opts.email, `Week ${opts.weekNumber} check-in — how's it going at Amana OSHC?`, html, {
    weekNumber: opts.weekNumber,
  });
}

/** Low mood / needs-help alert to the ramp watchers. */
export async function sendRampFlagEmail(opts: {
  to: { email: string; name: string };
  starterName: string;
  starterUserId: string;
  weekNumber: number;
  mood: number | null;
  needsHelp: boolean;
  helpDetail: string | null;
  struggling: string | null;
}): Promise<boolean> {
  const url = `${siteUrl()}/staff/${opts.starterUserId}#section-ramp`;
  const moodLine = opts.mood != null ? `${opts.mood}/5 — ${RAMP_MOOD_LABELS[opts.mood] ?? ""}` : "not given";
  const html = baseLayout(
    `
      <h2 style="margin:0 0 16px;">${escapeHtml(opts.starterName)} needs a check-in</h2>
      <p>Hi ${escapeHtml(firstName(opts.to.name))}, ${escapeHtml(opts.starterName)}'s week ${opts.weekNumber} ramp check-in was flagged.</p>
      <ul style="padding-left:20px;margin:16px 0;">
        <li style="margin-bottom:8px;"><strong>Mood:</strong> ${escapeHtml(moodLine)}</li>
        <li style="margin-bottom:8px;"><strong>Needs help:</strong> ${opts.needsHelp ? "Yes" : "No"}</li>
        ${opts.helpDetail ? `<li style="margin-bottom:8px;"><strong>What they need:</strong> ${escapeHtml(opts.helpDetail)}</li>` : ""}
        ${opts.struggling ? `<li style="margin-bottom:8px;"><strong>What's been hard:</strong> ${escapeHtml(opts.struggling)}</li>` : ""}
      </ul>
      <p>Please reach out to them today.</p>
      ${buttonHtml("Open their ramp", url)}
    `,
    "staff",
  );
  return safeSend(opts.to.email, `⚠️ ${opts.starterName} flagged their week ${opts.weekNumber} check-in`, html, {
    starterUserId: opts.starterUserId,
  });
}

/** Day 30/60/90 checkpoint request (and reminder) to a watcher. */
export async function sendRampCheckpointEmail(opts: {
  to: { email: string; name: string };
  starterName: string;
  starterUserId: string;
  day: number;
  reminder: boolean;
}): Promise<boolean> {
  const url = `${siteUrl()}/staff/${opts.starterUserId}#section-ramp`;
  const final = opts.day >= 90;
  const html = baseLayout(
    `
      <h2 style="margin:0 0 16px;">${escapeHtml(opts.starterName)} — day ${opts.day} ${final ? "probation" : "ramp"} checkpoint${opts.reminder ? " (reminder)" : ""}</h2>
      <p>Hi ${escapeHtml(firstName(opts.to.name))}, ${escapeHtml(opts.starterName)} has reached day ${opts.day} of their 90-day ramp. Please rate their six core competencies and ${final ? "make the probation call (pass, extend or end)" : "flag whether they're on track"}.</p>
      <p>It takes a couple of minutes on their staff profile — the scorecard and their weekly check-ins are right there for context.</p>
      ${buttonHtml(`Complete the day ${opts.day} checkpoint`, url)}
    `,
    "staff",
  );
  return safeSend(
    opts.to.email,
    `${opts.reminder ? "Reminder: " : ""}Day ${opts.day} checkpoint due — ${opts.starterName}`,
    html,
    { starterUserId: opts.starterUserId, day: opts.day },
  );
}

/** Close-out to the watchers (not the starter — they get an in-app note). */
export async function sendRampClosedEmail(opts: {
  to: { email: string; name: string };
  starterName: string;
  starterUserId: string;
  recommendation: string;
  reviewerName: string;
}): Promise<boolean> {
  const url = `${siteUrl()}/staff/${opts.starterUserId}#section-ramp`;
  const label = RAMP_RECOMMENDATION_LABELS[opts.recommendation] ?? opts.recommendation;
  const html = baseLayout(
    `
      <h2 style="margin:0 0 16px;">${escapeHtml(opts.starterName)} — 90-day ramp: ${escapeHtml(label)}</h2>
      <p>Hi ${escapeHtml(firstName(opts.to.name))}, ${escapeHtml(opts.reviewerName)} submitted the day-90 checkpoint for ${escapeHtml(opts.starterName)} with the recommendation <strong>${escapeHtml(label)}</strong>.</p>
      ${buttonHtml("View the ramp", url)}
    `,
    "staff",
  );
  return safeSend(opts.to.email, `${opts.starterName} — 90-day ramp: ${label}`, html, {
    starterUserId: opts.starterUserId,
  });
}
