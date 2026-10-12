/**
 * Staff emails (Daniel, 12 Oct 2026): policy updates, reminders, things to
 * read, professional development and wellbeing — by email to staff, plus a
 * notification in the dashboard.
 *
 * Flow:
 *   draft (every Cowork message starts here unless auto-approve is on)
 *     → approved → in the MONDAY ROUND-UP (one email per person with every
 *       update meant for them that week; cron staff-updates-roundup)
 *     → approved + urgent → sent ON ITS OWN straight away
 *   → sent | cancelled
 *
 * A DESIGNED email (`blocks` set — built from the shared template library)
 * always goes out as its own email: urgent ones at approval, the rest at the
 * Monday round-up time, never squeezed inside the round-up itself.
 *
 * Recipients: active people with an email, filtered by role and centre.
 * Shared centre mailboxes (isCentreAccount) aren't people and never get it.
 * Each person gets their own email (no shared To: line).
 */
import type { Prisma, Role, StaffUpdate, StaffUpdateType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { baseLayout, buttonHtml, escapeHtml } from "@/lib/email-templates/base";
import { notifyUsers } from "@/lib/notify-user";
import { logger } from "@/lib/logger";
import { serviceDateOnly } from "@/lib/timezone";
import type { EmailBlock } from "@/lib/email-marketing-layout";
import { isDesigned, staffDesignedHtml } from "@/lib/staff-email-design";

const ORIGIN = () => process.env.NEXTAUTH_URL ?? "https://amanaoshc.company";

export const STAFF_UPDATE_TYPES: Record<StaffUpdateType, { label: string; colour: string }> = {
  policy_update: { label: "Policy update", colour: "#004E64" },
  reminder: { label: "Reminder", colour: "#B45309" },
  please_read: { label: "Please read", colour: "#0E7490" },
  professional_development: { label: "Professional development", colour: "#6D28D9" },
  wellbeing: { label: "Wellbeing", colour: "#15803D" },
};

/** Round-up order: what needs action first. */
const TYPE_ORDER: StaffUpdateType[] = ["policy_update", "reminder", "please_read", "professional_development", "wellbeing"];

export interface Audience {
  audienceRoles: Role[];
  audienceServiceIds: string[];
}

export interface StaffRecipient {
  id: string;
  email: string;
  name: string;
  role: Role;
  serviceIds: string[];
}

/** Everyone who could receive a staff email, with the centres they belong to. */
export async function staffRecipients(): Promise<StaffRecipient[]> {
  const users = await prisma.user.findMany({
    where: { active: true, isCentreAccount: false, email: { not: "" } },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      serviceId: true,
      serviceMemberships: { select: { serviceId: true } },
    },
  });
  return users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    serviceIds: [...new Set([u.serviceId, ...u.serviceMemberships.map((m) => m.serviceId)].filter(Boolean) as string[])],
  }));
}

/** Does this person fall inside the update's audience? Empty lists mean "everyone". */
export function inAudience(person: StaffRecipient, a: Audience): boolean {
  if (a.audienceRoles.length && !a.audienceRoles.includes(person.role)) return false;
  if (a.audienceServiceIds.length && !person.serviceIds.some((s) => a.audienceServiceIds.includes(s))) return false;
  return true;
}

function paragraphs(text: string) {
  return text
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px;color:#1a1a2e;font-size:15px;line-height:1.6;">${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

function safeLink(url: string | null) {
  if (!url) return null;
  try {
    const u = new URL(url, ORIGIN());
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** One update as an email block. */
export function updateBlockHtml(u: Pick<StaffUpdate, "type" | "title" | "body" | "linkUrl" | "linkLabel" | "urgent">) {
  const meta = STAFF_UPDATE_TYPES[u.type];
  const link = safeLink(u.linkUrl);
  return `
    <div style="margin:0 0 24px;padding:0 0 20px;border-bottom:1px solid #eee5c8;">
      <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${meta.colour};">
        ${meta.label}${u.urgent ? " · Important" : ""}
      </p>
      <h2 style="margin:0 0 10px;color:#004E64;font-size:18px;font-weight:700;">${escapeHtml(u.title)}</h2>
      ${paragraphs(u.body)}
      ${link ? buttonHtml(escapeHtml(u.linkLabel?.trim() || "Open"), link) : ""}
    </div>`;
}

const first = (name: string) => escapeHtml(name.split(" ")[0] || "there");

export function roundupHtml(person: { name: string }, updates: StaffUpdate[], weekOf: Date) {
  const week = weekOf.toLocaleDateString("en-AU", { day: "numeric", month: "long", timeZone: "UTC" });
  const sorted = [...updates].sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type));
  return baseLayout(
    `
    <p style="margin:0 0 6px;color:#1a1a2e;font-size:15px;">Assalamu Alaikum ${first(person.name)},</p>
    <p style="margin:0 0 24px;color:#4b5563;font-size:15px;line-height:1.6;">
      Here's what you need to know for the week of ${week}.
    </p>
    ${sorted.map(updateBlockHtml).join("")}
    <p style="margin:8px 0 0;color:#1a1a2e;font-size:15px;">Jazak Allahu Khairan,<br/>The Amana OSHC team</p>`,
    "staff",
  );
}

export function urgentHtml(person: { name: string }, u: StaffUpdate) {
  if (isDesigned(u)) return designedHtml(person, u);
  return baseLayout(
    `
    <p style="margin:0 0 18px;color:#1a1a2e;font-size:15px;">Assalamu Alaikum ${first(person.name)},</p>
    ${updateBlockHtml(u)}
    <p style="margin:8px 0 0;color:#1a1a2e;font-size:15px;">Jazak Allahu Khairan,<br/>The Amana OSHC team</p>`,
    "staff",
  );
}

/** The HTML a designed update sends — the same renderer the composer previews. */
export function designedHtml(person: { name: string }, u: Pick<StaffUpdate, "blocks">) {
  return staffDesignedHtml(u.blocks as unknown as EmailBlock[], person, ORIGIN());
}

/**
 * Subject line for an update sent on its own (urgent, or designed). Template
 * subjects can carry {{firstName}} / {{name}} — filled per person (plain
 * text: subjects aren't HTML).
 */
export function soloSubject(u: Pick<StaffUpdate, "title" | "urgent">, person?: { name: string }) {
  const name = person?.name.trim() ?? "";
  const first = name.split(/\s+/)[0] || "there";
  const title = u.title.replace(/\{\{\s*firstName\s*\}\}/g, first).replace(/\{\{\s*name\s*\}\}/g, name || first);
  return u.urgent ? `Important: ${title}` : title;
}

async function deliver(
  people: StaffRecipient[],
  build: (p: StaffRecipient) => { subject: string; html: string; key: string },
): Promise<number> {
  let sent = 0;
  for (const p of people) {
    const { subject, html, key } = build(p);
    try {
      const res = await sendEmail({ to: p.email, subject, html }, { idempotencyKey: key });
      if (res.sent.length) sent++;
    } catch (err) {
      logger.error("Staff email failed", { userId: p.id, err });
    }
  }
  return sent;
}

/**
 * Send one urgent update now. Claims it first (approved → sent) so a double
 * click or two instances can never email staff twice.
 */
export async function sendUrgentUpdate(id: string): Promise<{ recipients: number; sent: number }> {
  const claim = await prisma.staffUpdate.updateMany({
    where: { id, status: "approved", urgent: true, sentAt: null },
    data: { status: "sent", sentAt: new Date() },
  });
  if (claim.count === 0) return { recipients: 0, sent: 0 };
  const u = await prisma.staffUpdate.findUniqueOrThrow({ where: { id } });
  const people = (await staffRecipients()).filter((p) => inAudience(p, u));
  const sent = await deliver(people, (p) => ({
    subject: soloSubject(u, p),
    html: urgentHtml(p, u),
    key: `staff-update-${u.id}-${p.id}`,
  }));
  await notifyUsers(prisma, people.map((p) => p.id), {
    type: "staff_update",
    title: u.title,
    body: STAFF_UPDATE_TYPES[u.type].label,
    link: safeLink(u.linkUrl),
  }).catch((err) => logger.warn("Staff update notification failed", { err }));
  await prisma.staffUpdate.update({ where: { id }, data: { recipientCount: sent } });
  return { recipients: people.length, sent };
}

/**
 * The Monday round-up: every approved, not-urgent, unsent update goes to the
 * people in its audience — one email per person with all of theirs.
 */
export async function sendWeeklyRoundup(now = new Date()): Promise<{ updates: number; people: number; sent: number }> {
  const due = await prisma.staffUpdate.findMany({
    where: { status: "approved", urgent: false, sentAt: null },
    orderBy: { approvedAt: "asc" },
  });
  if (due.length === 0) return { updates: 0, people: 0, sent: 0 };
  // Claim exactly these rows, so a re-run can't send them again.
  const claimed = await prisma.staffUpdate.updateMany({
    where: { id: { in: due.map((u) => u.id) }, status: "approved", sentAt: null },
    data: { status: "sent", sentAt: now },
  });
  if (claimed.count === 0) return { updates: 0, people: 0, sent: 0 };
  const weekOf = serviceDateOnly(now);
  const everyone = await staffRecipients();
  const perUpdate = new Map<string, number>();
  let sentTotal = 0;

  // Designed emails go out on their own, each to its own audience.
  const designed = due.filter(isDesigned);
  for (const u of designed) {
    const people = everyone.filter((p) => inAudience(p, u));
    const n = await deliver(people, (p) => ({
      subject: soloSubject(u, p),
      html: designedHtml(p, u),
      key: `staff-update-${u.id}-${p.id}`,
    }));
    sentTotal += n;
    perUpdate.set(u.id, n);
    await notifyUsers(prisma, people.map((p) => p.id), {
      type: "staff_update",
      title: u.title,
      body: STAFF_UPDATE_TYPES[u.type].label,
      link: null,
    }).catch(() => undefined);
  }

  const plain = due.filter((u) => !isDesigned(u));
  const perPerson = new Map<string, StaffUpdate[]>();
  for (const p of everyone) {
    const mine = plain.filter((u) => inAudience(p, u));
    if (mine.length) perPerson.set(p.id, mine);
    for (const u of mine) perUpdate.set(u.id, (perUpdate.get(u.id) ?? 0) + 1);
  }
  const people = everyone.filter((p) => perPerson.has(p.id));
  const stamp = weekOf.toISOString().slice(0, 10);
  sentTotal += await deliver(people, (p) => ({
    subject: `Your Amana staff update — week of ${weekOf.toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "UTC" })}`,
    html: roundupHtml(p, perPerson.get(p.id)!, weekOf),
    key: `staff-roundup-${stamp}-${p.id}`,
  }));
  for (const p of people) {
    const mine = perPerson.get(p.id)!;
    await notifyUsers(prisma, [p.id], {
      type: "staff_update",
      title: "Your staff update for this week",
      body: mine.map((u) => u.title).join(" · ").slice(0, 300),
      link: null,
    }).catch(() => undefined);
  }
  await Promise.all(
    due.map((u) => prisma.staffUpdate.update({ where: { id: u.id }, data: { recipientCount: perUpdate.get(u.id) ?? 0 } })),
  );
  return { updates: due.length, people: people.length, sent: sentTotal };
}

/** How many people an audience reaches — shown while composing. */
export async function countAudience(a: Audience) {
  return (await staffRecipients()).filter((p) => inAudience(p, a)).length;
}

export type StaffUpdateInput = Pick<
  Prisma.StaffUpdateUncheckedCreateInput,
  "type" | "title" | "body" | "linkUrl" | "linkLabel" | "audienceRoles" | "audienceServiceIds" | "urgent"
>;
