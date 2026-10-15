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

export const SAMPLE_FAMILY = { parentFirstName: "Sarah", childNames: ["Yusuf"] };
const BASE = () => process.env.NEXTAUTH_URL ?? "https://amanaoshc.company";

export async function renderJourneyEmail(
  id: string,
  serviceId: string | null,
): Promise<{ subject: string; html: string } | null> {
  const service = serviceId
    ? await prisma.service.findUnique({
        where: { id: serviceId },
        select: { id: true, name: true, code: true, address: true, suburb: true, state: true, orientationVideoUrl: true },
      })
    : null;
  const centreName = service?.name ?? "Amana OSHC";
  const { parentFirstName: first, childNames } = SAMPLE_FAMILY;

  let out: { subject: string; html: string } | null = null;
  if (id === "enrolment_welcome") {
    if (!service) return null;
    const centre = await centreWelcomeData(service.id);
    if (!centre) return null;
    out = await enrolmentWelcomeEmail({ ...centre, ...SAMPLE_FAMILY, verifyLink: null });
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
  return { subject: out.subject, html: out.html.split(UNSUBSCRIBE_URL_TOKEN).join("#unsubscribe-preview") };
}
