/**
 * Telling a centre's team that a family needs them (Daniel, 16 Oct 2026):
 * new enquiry, new enrolment, the 24-hour reply clock.
 *
 * Who hears:
 *   - the centre's people: its manager + every active `member` (coordinator
 *     / centre account) attached to it — in-app + push via notifyUsers;
 *   - the centre's own mailbox (Service.email) by email, because that inbox
 *     is watched even when nobody has the dashboard open;
 *   - head office (active `head_office` users) when `headOffice` is set.
 * Swallow-and-log: an alert must never fail the parent's request.
 *
 * Enrolment replies are the exception (Daniel, 19 Oct 2026): the enrolments
 * team contacts new families, not the centre — so a new enrolment and its
 * 20/24-hour reminders email ENROLMENTS_INBOX only, and the in-app alert
 * goes to head office only (`enrolmentsTeam: true`).
 */
import { prisma } from "@/lib/prisma";
import { notifyUsers } from "@/lib/notify-user";
import { sendEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import { baseLayout, buttonHtml, escapeHtml } from "@/lib/email-templates/base";

export { FAMILY_BOOKINGS_EMAIL as ENROLMENTS_INBOX } from "@/lib/family-contact";
import { FAMILY_BOOKINGS_EMAIL as ENROLMENTS_INBOX } from "@/lib/family-contact";

const BASE = () => process.env.NEXTAUTH_URL ?? "https://amanaoshc.company";

export async function centreTeamUserIds(serviceId: string, opts: { headOffice?: boolean } = {}): Promise<string[]> {
  const service = await prisma.service.findUnique({ where: { id: serviceId }, select: { managerId: true } });
  const users = await prisma.user.findMany({
    where: {
      active: true,
      OR: [
        ...(service?.managerId ? [{ id: service.managerId }] : []),
        { role: "member", serviceId },
        ...(opts.headOffice ? [{ role: "head_office" as const }] : []),
      ],
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

export interface CentreAlert {
  serviceId: string;
  type: string;
  title: string;
  body: string;
  /** Dashboard path, e.g. "/enrolments?id=…" */
  link: string;
  headOffice?: boolean;
  /**
   * Route to the enrolments team instead of the centre: email goes ONLY to
   * ENROLMENTS_INBOX and the in-app alert only to head office.
   */
  enrolmentsTeam?: boolean;
  /** Also email the centre's mailbox (and head office, when set). */
  email?: {
    subject: string;
    lines: string[];
    button: string;
    /** Files attached to every copy of the email (fetched by URL). */
    attachments?: { filename: string; path: string }[];
  };
}

/** The HTML of a centre alert email — shared by the sender and test sends. */
export function centreAlertHtml(email: { lines: string[]; button: string }, link: string): string {
  return baseLayout(
    `${email.lines.map((l) => `<p style="margin:0 0 14px;color:#1a1a2e;font-size:15px;line-height:1.6;">${l}</p>`).join("")}
     ${buttonHtml(escapeHtml(email.button), `${BASE()}${link}`)}`,
    "staff",
  );
}

export async function alertCentreTeam(alert: CentreAlert): Promise<void> {
  try {
    const ids = alert.enrolmentsTeam
      ? (await prisma.user.findMany({ where: { active: true, role: "head_office" }, select: { id: true } })).map((u) => u.id)
      : await centreTeamUserIds(alert.serviceId, { headOffice: alert.headOffice });
    await notifyUsers(prisma, ids, { type: alert.type, title: alert.title, body: alert.body, link: alert.link });

    if (!alert.email) return;
    const to = new Set<string>();
    if (alert.enrolmentsTeam) {
      to.add(ENROLMENTS_INBOX);
    } else {
      const service = await prisma.service.findUnique({ where: { id: alert.serviceId }, select: { email: true } });
      if (service?.email?.trim()) to.add(service.email.trim().toLowerCase());
    }
    if (alert.headOffice && !alert.enrolmentsTeam) {
      const ho = await prisma.user.findMany({
        where: { active: true, role: "head_office", isCentreAccount: false },
        select: { email: true },
      });
      ho.forEach((u) => u.email && to.add(u.email.toLowerCase()));
    }
    if (to.size === 0) return;
    const html = centreAlertHtml(alert.email, alert.link);
    for (const address of to) {
      await sendEmail({
        to: address,
        subject: alert.email.subject,
        html,
        ...(alert.email.attachments?.length ? { attachments: alert.email.attachments } : {}),
      }).catch((err) =>
        logger.warn("Centre alert email failed", { to: address, err }),
      );
    }
  } catch (err) {
    logger.error("Centre alert failed", { serviceId: alert.serviceId, type: alert.type, err });
  }
}

/** "Yusuf and Maryam" from an enrolment's children JSON. */
export function childNamesFrom(children: unknown): string {
  const list = Array.isArray(children)
    ? children.map((c) => (c && typeof c === "object" ? String((c as { firstName?: unknown }).firstName ?? "").trim() : "")).filter(Boolean)
    : [];
  if (list.length === 0) return "a child";
  return list.length === 1 ? list[0] : `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`;
}

const parentNameFrom = (p: unknown) => {
  const o = (p && typeof p === "object" ? p : {}) as { firstName?: string; surname?: string };
  return [o.firstName, o.surname].filter(Boolean).join(" ").trim() || "A family";
};

/** A family just submitted their enrolment. */
export async function alertNewEnrolment(submissionId: string): Promise<void> {
  const sub = await prisma.enrolmentSubmission.findUnique({
    where: { id: submissionId },
    select: { id: true, serviceId: true, children: true, primaryParent: true },
  });
  if (!sub?.serviceId) return;
  const centreName = (await prisma.service.findUnique({ where: { id: sub.serviceId }, select: { name: true } }))?.name;
  const kids = childNamesFrom(sub.children);
  const parent = parentNameFrom(sub.primaryParent);
  const phone = (sub.primaryParent as { mobile?: string } | null)?.mobile;
  await alertCentreTeam({
    serviceId: sub.serviceId,
    type: "enrolment_submitted",
    title: `New enrolment: ${kids}`,
    body: `${parent} has submitted an enrolment. We promised to get back to them within 24 hours.`,
    link: `/enrolments?id=${sub.id}`,
    enrolmentsTeam: true,
    email: {
      subject: `New enrolment: ${kids} — please contact the family within 24 hours`,
      lines: [
        `<strong>${escapeHtml(parent)}</strong> has just submitted an enrolment for <strong>${escapeHtml(kids)}</strong>${centreName ? ` at <strong>${escapeHtml(centreName)}</strong>` : ""}.`,
        `The family has been told someone will get back to them <strong>within 24 hours</strong>.${phone ? ` Their number: <strong>${escapeHtml(phone)}</strong>.` : ""}`,
        "Please contact them, then open the enrolment in the dashboard and press <strong>Mark contacted</strong>.",
      ],
      button: "Open the enrolment",
    },
  });
}

/**
 * A family just enquired. In-app + push to the centre only (no email — the
 * website already emails enquiries out, so a second email would double up).
 */
export async function alertNewEnquiry(enquiryId: string): Promise<void> {
  const eq = await prisma.parentEnquiry.findUnique({
    where: { id: enquiryId },
    select: { id: true, serviceId: true, parentName: true, parentPhone: true, channel: true },
  });
  if (!eq) return;
  await alertCentreTeam({
    serviceId: eq.serviceId,
    type: "enquiry_new",
    title: `New enquiry: ${eq.parentName}`,
    body: `${eq.parentPhone ? `Call ${eq.parentPhone} ` : "Get in touch "}within the hour — families who hear from us quickly are far more likely to enrol.`,
    link: `/enquiries`,
  });
}
