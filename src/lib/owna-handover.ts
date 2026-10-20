/**
 * What the OWNA checklist does for the family (Daniel, 16 Oct 2026).
 *
 *   invitation ✓ (sent)     → "Your OWNA invitation is on its way" guide
 *   invitation ✓ (existing) → "You're all set in OWNA"
 *   sessions ✓ + first day  → "You're booked in! First day is …", and the
 *                              first-session emails are re-timed to that day
 *   sessions ✓ casual only  → "You're ready to book" (how to book casually),
 *                              welcome pack attached (20 Oct 2026)
 *   sessions ✓ + first day  → ALSO the centre: "Booked in — first day is …"
 *                              with the Amana Proven Process attached, whether
 *                              or not the family is emailed (20 Oct 2026)
 *   invitation sent 3+ days, access not ticked → family nudge + centre alert
 *                              (cron owna-handover-nudge, once per invitation)
 *
 * Swallow-and-log throughout — a mail problem must never undo a checklist save.
 */
import { recordMarketingSends } from "@/lib/frequency-cap";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import { centreWelcomeData } from "@/lib/enrolment-welcome";
import { syncParentJourney } from "@/lib/parent-journey";
import { alertCentreTeam, childNamesFrom } from "@/lib/centre-team-alerts";
import { OWNA_CHECKLIST_START, predatesOwnaChecklist, readHandoff, type HandoffStep } from "@/lib/owna-handoff";
import { escapeHtml } from "@/lib/email-templates/base";
import {
  casualBookingsEmail,
  firstDayConfirmedEmail,
  formatFirstDay,
  ownaExistingEmail,
  ownaInvitationEmail,
  ownaNudgeEmail,
  type HandoverEmailData,
} from "@/lib/email-templates/owna-handover";

const DAY = 24 * 3_600_000;
export const NUDGE_AFTER_DAYS = 3;

/** Family + centre details for a handover email, or null if there's no one to email. */
export async function handoverData(enrolmentId: string, firstDay?: string): Promise<HandoverEmailData | null> {
  const sub = await prisma.enrolmentSubmission.findUnique({
    where: { id: enrolmentId },
    select: { serviceId: true, primaryParent: true, childRecords: { select: { firstName: true } } },
  });
  const parent = sub?.primaryParent as { email?: string; firstName?: string; surname?: string } | null;
  const email = parent?.email?.trim();
  if (!sub?.serviceId || !email) return null;
  const centre = await centreWelcomeData(sub.serviceId);
  if (!centre) return null;
  return {
    ...centre,
    parentFirstName: parent?.firstName?.trim() || "there",
    parentEmail: email,
    childNames: sub.childRecords.map((c) => c.firstName).filter(Boolean),
    firstDay,
  };
}

/** The Amana Proven Process one-pager (public/Amana_PP.png). */
const PROVEN_PROCESS_PATH = "/Amana_PP.png";
const BASE = () => process.env.NEXTAUTH_URL ?? "https://amanaoshc.company";

/**
 * The Amana Proven Process (public/Amana_PP.png), written out for staff so
 * the email says what to DO with this child, not just "see attached"
 * (Daniel, 20 Oct 2026). Stages 1–2 are already done by the time a first
 * day is confirmed; 3–7 are the centre's.
 */
export const PROVEN_PROCESS_STAGES: { n: number; name: string; done?: boolean; points: (child: string) => string[] }[] = [
  { n: 1, name: "Enrol", done: true, points: () => ["Enrolment form completed, booking confirmed, record created"] },
  { n: 2, name: "Inform — welcome email", done: true, points: () => ["Welcome email sent: drop-off & pick-up, what to pack, who they'll meet"] },
  {
    n: 3,
    name: "First Day Guarantee — our promise",
    points: () => ["Kids love it or it's free", "No lock-in bookings", "Guaranteed for every child at Amana"],
  },
  {
    n: 4,
    name: "Welcome — personal connection",
    points: (c) => [`Personally collect ${c}`, `Hi-five and greet ${c} by name`, `Introduce ${c} to another child`],
  },
  {
    n: 5,
    name: "Reassurance — parent peace of mind",
    points: (c) => [`Give ${c} their Amana bag tag`, "Complete the All About Me sheet", "Send a photo direct to the parent by SMS"],
  },
  {
    n: 6,
    name: "Comfort — at pick-up",
    points: (c) => ["Hand over the Family Welcome Pack", `Tell the parent how ${c}'s day was`, "WhatsApp community invite + hi-five farewell"],
  },
  {
    n: 7,
    name: "Nurture — feedback loop",
    points: () => ["Automated SMS the morning after", "Check in and follow up", "Review and action all feedback"],
  },
];

function provenProcessHtml(child: string): string {
  const GREEN = "#004E64";
  const JONQUIL = "#FECE00";
  const rows = PROVEN_PROCESS_STAGES.map((s) => {
    const badge = s.done
      ? `<div style="width:28px;height:28px;border-radius:50%;background-color:#e5e7eb;color:#6b7280;font-size:13px;font-weight:700;line-height:28px;text-align:center;">&#10003;</div>`
      : `<div style="width:28px;height:28px;border-radius:50%;background-color:${s.n % 2 ? GREEN : JONQUIL};color:${s.n % 2 ? "#ffffff" : GREEN};font-size:14px;font-weight:700;line-height:28px;text-align:center;">${s.n}</div>`;
    const points = s
      .points(escapeHtml(child))
      .map((t) => `<p style="margin:0 0 3px;color:${s.done ? "#6b7280" : "#1a1a2e"};font-size:14px;line-height:1.5;">&#8226; ${t}</p>`)
      .join("");
    return `<tr>
      <td width="40" valign="top" style="padding:0 0 14px;">${badge}</td>
      <td valign="top" style="padding:3px 0 14px;">
        <p style="margin:0 0 4px;color:${s.done ? "#6b7280" : GREEN};font-size:15px;font-weight:700;">${escapeHtml(s.name)}${s.done ? " <span style=\"font-weight:400;\">(done)</span>" : ""}</p>
        ${points}
      </td>
    </tr>`;
  }).join("");
  return `
  <table width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;background-color:#FFFAE6;border-radius:14px;">
    <tr><td style="padding:20px;">
      <p style="margin:0 0 4px;color:${GREEN};font-size:17px;font-weight:700;">The Amana Proven Process</p>
      <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">Our 7-stage journey, from the moment a family enrols to a lifelong relationship built on trust, warmth and consistency. Here's what to do with ${escapeHtml(child)}:</p>
      <table width="100%" cellpadding="0" cellspacing="0">${rows}</table>
      <p style="margin:4px 0 0;color:#374151;font-size:14px;line-height:1.6;"><strong style="color:${GREEN};">Then ongoing care:</strong> daily updates, the WhatsApp community, family community and the feedback loop.</p>
    </td></tr>
  </table>`;
}

/** The centre's "booked in" message — shared by the real alert and test sends. */
export function firstDayCentreMessage(x: { kids: string; firstDay: string; family: string }) {
  const day = formatFirstDay(x.firstDay);
  const kids = escapeHtml(x.kids);
  return {
    title: `Booked in: ${x.kids} starts ${day}`,
    body: `First day confirmed. Please follow the Amana Proven Process with ${x.kids}.`,
    email: {
      subject: `Booked in: ${x.kids}'s first day is ${day}`,
      lines: [
        `Just letting you know <strong>${kids}</strong> has been booked in, and their first day is <strong>${escapeHtml(day)}</strong>.`,
        ...(x.family ? [`Family: ${escapeHtml(x.family)}.`] : []),
        `Please make sure you follow the <strong>Amana Proven Process</strong> with ${kids}. Here it is, step by step — it's also attached, and always in the Handbook under Proven Process.`,
      ],
      html: provenProcessHtml(x.kids),
      button: "Open the enrolment",
      attachments: [{ filename: "Amana Proven Process.png", path: `${BASE()}${PROVEN_PROCESS_PATH}` }],
    },
  };
}

/**
 * Daniel, 20 Oct 2026: when a first day is confirmed, tell the centre — the
 * child is booked in, this is their first day — and send the Proven Process
 * so staff follow it with this child. Centre mailbox by email, centre team
 * in-app. Swallow-and-log (alertCentreTeam).
 */
export async function alertCentreFirstDay(enrolmentId: string, firstDay: string): Promise<void> {
  try {
    const sub = await prisma.enrolmentSubmission.findUnique({
      where: { id: enrolmentId },
      select: { serviceId: true, children: true, primaryParent: true, childRecords: { select: { firstName: true } } },
    });
    if (!sub?.serviceId) return;
    const names = sub.childRecords.map((c) => c.firstName).filter(Boolean);
    const kids = names.length
      ? names.length === 1
        ? names[0]
        : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
      : childNamesFrom(sub.children);
    const p = (sub.primaryParent ?? {}) as { firstName?: string; surname?: string; mobile?: string };
    const parent = [p.firstName, p.surname].map((s) => s?.trim()).filter(Boolean).join(" ");
    const family = [parent, p.mobile?.trim()].filter(Boolean).join(", ");
    const m = firstDayCentreMessage({ kids, firstDay, family });
    await alertCentreTeam({
      serviceId: sub.serviceId,
      type: "enrolment_first_day",
      title: m.title,
      body: m.body,
      link: `/enrolments?id=${enrolmentId}`,
      email: m.email,
    });
  } catch (err) {
    logger.error("First-day centre alert failed", { enrolmentId, err });
  }
}

/**
 * Daniel, 21 Oct 2026: the OWNA checklist can be ticked BEFORE Confirm.
 * The family emails those ticks would send are held, and go out here —
 * called when the enrolment is confirmed, right after the welcome email —
 * in step order, honouring each step's "Email the family" choice. The
 * centre's "Booked in" email goes too. Idempotency keys match the direct
 * sends, so nothing is sent twice. Swallow-and-log.
 */
export async function sendHeldHandoverEmails(enrolmentId: string): Promise<void> {
  try {
    const row = await prisma.enrolmentOwnaHandoff.findUnique({
      where: { enrolmentId },
      select: { state: true, enrolment: { select: { createdAt: true } } },
    });
    if (!row || predatesOwnaChecklist(row.enrolment.createdAt)) return;
    const steps = readHandoff(row.state)?.steps;
    if (!steps) return;
    if (steps.invitation && steps.invitation.notify !== false)
      await onHandoffStepCompleted(enrolmentId, "invitation", steps.invitation);
    if (steps.sessions && steps.sessions.notify !== false)
      await onHandoffStepCompleted(enrolmentId, "sessions", steps.sessions);
    if (steps.sessions?.firstDay) await alertCentreFirstDay(enrolmentId, steps.sessions.firstDay);
  } catch (err) {
    logger.error("Held OWNA handover emails failed", { enrolmentId, err });
  }
}

/** The first-session details staff confirmed on the checklist, if any. */
export async function confirmedSessions(
  enrolmentId: string,
): Promise<{ firstDay?: string; casual?: boolean; notify?: boolean } | null> {
  const row = await prisma.enrolmentOwnaHandoff.findUnique({ where: { enrolmentId }, select: { state: true } });
  return readHandoff(row?.state)?.steps.sessions ?? null;
}

/** Called after a checklist step is saved as complete. */
export async function onHandoffStepCompleted(
  enrolmentId: string,
  step: HandoffStep,
  completion: { at: string; mode?: "sent" | "existing"; firstDay?: string; casual?: boolean },
): Promise<void> {
  try {
    if (step !== "invitation" && step !== "sessions") return;
    const d = await handoverData(enrolmentId, completion.firstDay);
    if (!d) return;

    if (step === "invitation") {
      const { subject, html } = completion.mode === "existing" ? await ownaExistingEmail(d) : await ownaInvitationEmail(d);
      await sendEmail({ to: d.parentEmail, subject, html }, { idempotencyKey: `owna-invitation-${enrolmentId}-${completion.at}` });
      await recordMarketingSends(prisma, [{ email: d.parentEmail }], { source: "lifecycle" });
      return;
    }

    // The centre's welcome pack PDF, attached to both sessions emails —
    // every new family gets it, first day booked or casual (20 Oct 2026).
    const welcomePack = d.welcomePackUrl
      ? { attachments: [{ filename: `Amana OSHC welcome pack - ${d.centreName}.pdf`, path: d.welcomePackUrl }] }
      : {};

    // Casual bookings only: no first day to confirm or re-time around.
    if (completion.casual) {
      const { subject, html } = await casualBookingsEmail(d);
      await sendEmail(
        { to: d.parentEmail, subject, html, ...welcomePack },
        { idempotencyKey: `casual-bookings-${enrolmentId}-${completion.at}` },
      );
      await recordMarketingSends(prisma, [{ email: d.parentEmail }], { source: "lifecycle" });
      return;
    }

    // sessions: confirm the day, then re-time the first-session series.
    if (!completion.firstDay) return;
    const { subject, html } = await firstDayConfirmedEmail(d);
    await sendEmail(
      { to: d.parentEmail, subject, html, ...welcomePack },
      { idempotencyKey: `first-day-${enrolmentId}-${completion.at}` },
    );
    await recordMarketingSends(prisma, [{ email: d.parentEmail }], { source: "lifecycle" });
    const sub = await prisma.enrolmentSubmission.findUnique({ where: { id: enrolmentId }, select: { serviceId: true } });
    await syncParentJourney({
      email: d.parentEmail,
      serviceId: sub?.serviceId,
      stage: "first_session",
      parentName: d.parentFirstName,
      childName: d.childNames[0] ?? null,
      // Same anchor convention as approval (UTC midnight of the date).
      firstSessionDate: new Date(`${completion.firstDay}T00:00:00Z`),
    });
  } catch (err) {
    logger.error("OWNA handover email failed", { enrolmentId, step, err });
  }
}

/**
 * Daily: invitations sent 3+ days ago where staff haven't ticked "Parent can
 * access the OWNA app". Each invitation is nudged once (inviteNudgedAt is
 * claimed first and compared with the invitation's own time).
 */
export async function runOwnaNudges(now = new Date()): Promise<{ nudged: number }> {
  const rows = await prisma.enrolmentOwnaHandoff.findMany({
    where: {
      enrolment: {
        status: "processed",
        processedAt: { gte: new Date(now.getTime() - 90 * DAY) },
        // Families from before the checklist started are never nudged.
        createdAt: { gte: OWNA_CHECKLIST_START },
      },
    },
    select: { enrolmentId: true, state: true, inviteNudgedAt: true, enrolment: { select: { serviceId: true, children: true } } },
  });
  let nudged = 0;
  for (const r of rows) {
    const state = readHandoff(r.state);
    const inv = state?.steps.invitation;
    if (!inv || inv.mode !== "sent" || state?.steps.access) continue;
    const sentAt = new Date(inv.at);
    if (now.getTime() - sentAt.getTime() < NUDGE_AFTER_DAYS * DAY) continue;
    if (r.inviteNudgedAt && r.inviteNudgedAt >= sentAt) continue;
    const claim = await prisma.enrolmentOwnaHandoff.updateMany({
      where: { enrolmentId: r.enrolmentId, OR: [{ inviteNudgedAt: null }, { inviteNudgedAt: { lt: sentAt } }] },
      data: { inviteNudgedAt: now },
    });
    if (claim.count === 0) continue;
    try {
      const d = await handoverData(r.enrolmentId);
      if (d) {
        const { subject, html } = await ownaNudgeEmail(d);
        await sendEmail({ to: d.parentEmail, subject, html }, { idempotencyKey: `owna-nudge-${r.enrolmentId}-${inv.at}` });
        await recordMarketingSends(prisma, [{ email: d.parentEmail }], { source: "lifecycle" });
      }
      if (r.enrolment.serviceId) {
        const kids = childNamesFrom(r.enrolment.children);
        await alertCentreTeam({
          serviceId: r.enrolment.serviceId,
          type: "owna_not_accepted",
          title: `${kids}'s family hasn't got into OWNA yet`,
          body: `Their invitation went ${Math.floor((now.getTime() - sentAt.getTime()) / DAY)} days ago. We've emailed them tips; a quick call usually sorts it.`,
          link: `/enrolments?id=${r.enrolmentId}`,
        });
      }
      nudged++;
    } catch (err) {
      logger.error("OWNA nudge failed", { enrolmentId: r.enrolmentId, err });
    }
  }
  return { nudged };
}
