/**
 * Renders any email on the Parent journey page with sample family details
 * and a real centre's details — the same template functions the senders
 * use, so the preview IS the email.
 */
import { prisma } from "@/lib/prisma";
import { NURTURE_TEMPLATE_MAP } from "@/lib/nurture-template-map";
import { centreWebsiteUrl, nurtureExitSurveyEmail, nurtureSessionReminderEmail } from "@/lib/email-templates";
import { enrolmentReceivedEmail } from "@/lib/email-templates/parent-account";
import { UNSUBSCRIBE_URL_TOKEN } from "@/lib/email-templates/base";
import { enrolmentWelcomeEmail } from "@/lib/email-templates/enrolment-welcome";
import { centreWelcomeData } from "@/lib/enrolment-welcome";
import {
  casualBookingsEmail,
  firstDayConfirmedEmail,
  ownaExistingEmail,
  ownaInvitationEmail,
  ownaNudgeEmail,
} from "@/lib/email-templates/owna-handover";
import { extraDayEmail, missedSessionsEmail, noShowEmail } from "@/lib/email-templates/attendance-journey";
import { upcomingProgram } from "@/lib/enrolment-welcome";
import { firstDayCentreMessage } from "@/lib/owna-handover";
import { centreAlertHtml } from "@/lib/centre-team-alerts";

const HANDOVER: Record<string, typeof ownaInvitationEmail> = {
  owna_invitation: ownaInvitationEmail,
  owna_existing: ownaExistingEmail,
  first_day_confirmed: firstDayConfirmedEmail,
  casual_bookings: casualBookingsEmail,
  owna_nudge: ownaNudgeEmail,
};

export const SAMPLE_FAMILY = { parentFirstName: "Sarah", childNames: ["Yusuf"] };
const BASE = () => process.env.NEXTAUTH_URL ?? "https://amanaoshc.company";

export async function renderJourneyEmail(
  id: string,
  serviceId: string | null,
): Promise<{ subject: string; html: string; attachments?: { filename: string; path: string }[] } | null> {
  const service = serviceId
    ? await prisma.service.findUnique({
        where: { id: serviceId },
        select: { id: true, name: true, code: true, address: true, suburb: true, state: true, orientationVideoUrl: true },
      })
    : null;
  const centreName = service?.name ?? "Amana OSHC";
  const { parentFirstName: first, childNames } = SAMPLE_FAMILY;

  let out: { subject: string; html: string } | null = null;
  let attachments: { filename: string; path: string }[] | undefined;
  if (id === "enrolment_welcome") {
    if (!service) return null;
    const centre = await centreWelcomeData(service.id);
    if (!centre) return null;
    out = await enrolmentWelcomeEmail({ ...centre, ...SAMPLE_FAMILY, verifyLink: null });
  } else if (HANDOVER[id]) {
    if (!service) return null;
    const centre = await centreWelcomeData(service.id);
    if (!centre) return null;
    // A sample first day: next Tuesday.
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + ((9 - d.getUTCDay()) % 7 || 7));
    // "You're booked in!" goes out with the welcome pack attached.
    if ((id === "first_day_confirmed" || id === "casual_bookings") && centre.welcomePackUrl)
      attachments = [{ filename: `Amana OSHC welcome pack - ${centre.centreName}.pdf`, path: centre.welcomePackUrl }];
    out = await HANDOVER[id]({
      ...centre,
      ...SAMPLE_FAMILY,
      parentEmail: "sarah@example.com",
      firstDay: d.toISOString().slice(0, 10),
    });
  } else if (id === "centre_first_day") {
    // To the CENTRE, not the family: booked in + the Proven Process.
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + ((9 - d.getUTCDay()) % 7 || 7));
    const m = firstDayCentreMessage({ kids: childNames[0], firstDay: d.toISOString().slice(0, 10), family: `${first} Khan, 0400 000 000` });
    return {
      subject: m.email.subject,
      html: centreAlertHtml(m.email, "/enrolments"),
      attachments: m.email.attachments,
    };
  } else if (id === "missed_sessions") {
    if (!service) return null;
    const centre = await centreWelcomeData(service.id);
    if (!centre) return null;
    const lastSeen = new Date(Date.now() - 15 * 86_400_000).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });
    out = await missedSessionsEmail({ ...centre, ...SAMPLE_FAMILY, childFirstName: "Yusuf", lastSeen, links: {} });
  } else if (id === "no_show" || id === "extra_day") {
    if (!service) return null;
    const centre = await centreWelcomeData(service.id);
    if (!centre) return null;
    out =
      id === "no_show"
        ? await noShowEmail({ ...centre, ...SAMPLE_FAMILY, links: {} })
        : await extraDayEmail({ ...centre, ...SAMPLE_FAMILY, nextWeek: (await upcomingProgram(service.id))[0] ?? null });
  } else if (id === "enrolment_received") {
    out = await enrolmentReceivedEmail({ name: first, childNames });
  } else if (id === "session_reminder") {
    const address = [service?.address, service?.suburb, service?.state].filter(Boolean).join(", ");
    out = nurtureSessionReminderEmail(first, centreName, address || undefined, service?.orientationVideoUrl || undefined, centreWebsiteUrl(service?.code));
  } else if (id === "exit_survey") {
    out = nurtureExitSurveyEmail(first, centreName, `${BASE()}/survey/exit`);
  } else if (NURTURE_TEMPLATE_MAP[id]) {
    const feedbackUrl = service ? `${BASE()}/survey/feedback/${service.id}` : `${BASE()}/survey/feedback`;
    out = await NURTURE_TEMPLATE_MAP[id](first, centreName, `${BASE()}/parent/signup`, feedbackUrl);
  }
  if (!out) return null;
  // The real sender fills in each family's own unsubscribe link.
  return {
    subject: out.subject,
    html: out.html.split(UNSUBSCRIBE_URL_TOKEN).join("#unsubscribe-preview"),
    ...(attachments ? { attachments } : {}),
  };
}
