import {
  nurtureWelcomeEmail,
  nurtureHowToEnrolEmail,
  nurtureWhatToBringEmail,
  nurtureAppSetupEmail,
  nurtureFirstWeekEmail,
  nurtureNpsSurveyEmail,
  nurtureCcsAssistEmail,
  nurtureNudge1Email,
  nurtureFormSupportEmail,
  nurtureNudge2Email,
  nurtureFinalNudgeEmail,
  nurtureDay1CheckinEmail,
  nurtureDay3CheckinEmail,
  nurtureWeek2FeedbackEmail,
  nurtureMonth1ReferralEmail,
  nurtureSessionReminderEmail,
  centreWebsiteUrl,
  retentionCasualReengageEmail,
  retentionDayChangeReminderEmail,
  retentionWithdrawalInterceptEmail,
  nurtureFormAbandonmentEmail,
} from "@/lib/email-templates";
import {
  renderBlocksToHtml,
  marketingLayout,
  type EmailBlock,
  type EmailLayoutOptions,
} from "@/lib/email-marketing-layout";
import { getEmailBranding } from "@/lib/email-branding";

/**
 * The ONE place a sequence step becomes an email. Shared by the
 * `nurture-send` cron (real sends) and the CRM "Email flows" preview
 * (`/api/sequences/preview` + its send-to-a-colleague sibling) — so what a
 * reviewer sees is byte-for-byte what a family or school receives, minus the
 * per-contact unsubscribe footer.
 *
 * Resolution order: the step's custom EmailTemplate (blocks → html), then
 * the dedicated session-reminder template, then the hardcoded default for
 * the `templateKey`. A key with none of those is `source: "missing"`.
 */

type TemplateFn = (
  firstName: string,
  centreName: string,
  enrolUrl?: string,
  feedbackUrl?: string,
) => { subject: string; html: string } | Promise<{ subject: string; html: string }>;

/** Hardcoded default templates by step `templateKey`. */
const TEMPLATE_MAP: Record<string, TemplateFn> = {
  welcome: nurtureWelcomeEmail,
  how_to_enrol: nurtureHowToEnrolEmail,
  what_to_bring: nurtureWhatToBringEmail,
  app_setup: nurtureAppSetupEmail,
  first_week: nurtureFirstWeekEmail,
  nps_survey: nurtureNpsSurveyEmail,
  ccs_assist: nurtureCcsAssistEmail,
  nudge_1: nurtureNudge1Email,
  form_support: nurtureFormSupportEmail,
  nudge_2: nurtureNudge2Email,
  final_nudge: nurtureFinalNudgeEmail,
  day1_checkin: nurtureDay1CheckinEmail,
  day3_checkin: nurtureDay3CheckinEmail,
  week2_feedback: nurtureWeek2FeedbackEmail,
  month1_referral: nurtureMonth1ReferralEmail,
  casual_reengage: retentionCasualReengageEmail,
  day_change_reminder: retentionDayChangeReminderEmail,
  withdrawal_intercept: retentionWithdrawalInterceptEmail,
  form_abandonment: nurtureFormAbandonmentEmail,
};

export type SequenceKind = "parent_nurture" | "crm_outreach";

/** Where the rendered email came from — `missing` means nothing is configured. */
export type RenderSource = "custom" | "default" | "missing";

export interface RenderableStep {
  name: string;
  templateKey: string;
  emailTemplate?: {
    subject: string | null;
    blocks: unknown;
    htmlContent: string | null;
  } | null;
}

export interface SequenceRenderContext {
  sequenceType: SequenceKind;
  /** Recipient's first name (parent) or contact name (school lead). */
  name: string;
  centreName: string;
  schoolName?: string;
  enrolUrl?: string;
  feedbackUrl?: string;
  service?: {
    code?: string | null;
    address?: string | null;
    suburb?: string | null;
    state?: string | null;
    orientationVideoUrl?: string | null;
  } | null;
  layoutOpts: EmailLayoutOptions;
}

export interface RenderedSequenceEmail {
  subject: string;
  html: string;
  source: RenderSource;
}

/** True when a step with this key and no custom template would still render real content. */
export function hasDefaultTemplate(templateKey: string, sequenceType: SequenceKind): boolean {
  if (templateKey === "session_reminder") return sequenceType === "parent_nurture";
  return templateKey in TEMPLATE_MAP;
}

/** Org-branded layout options — the same base every server render site uses. */
export async function getSequenceLayoutOptions(): Promise<EmailLayoutOptions> {
  const branding = await getEmailBranding();
  return {
    headerText: branding.name,
    footerText: branding.name,
    headerColor: branding.primaryColor,
    footerUrl: branding.websiteUrl,
    footerUrlLabel: branding.websiteUrlLabel,
  };
}

export async function renderSequenceStepEmail(
  step: RenderableStep,
  ctx: SequenceRenderContext,
): Promise<RenderedSequenceEmail> {
  const custom = step.emailTemplate;

  if (custom?.blocks) {
    const html = renderBlocksToHtml(
      custom.blocks as EmailBlock[],
      {
        firstName: ctx.name,
        parentName: ctx.name,
        contactName: ctx.name,
        schoolName: ctx.schoolName ?? "",
        centreName: ctx.centreName,
      },
      ctx.layoutOpts,
    );
    return { subject: custom.subject || step.name, html, source: "custom" };
  }

  if (custom?.htmlContent) {
    return {
      subject: custom.subject || step.name,
      html: marketingLayout(custom.htmlContent, ctx.layoutOpts),
      source: "custom",
    };
  }

  if (ctx.sequenceType === "parent_nurture" && step.templateKey === "session_reminder") {
    // Dedicated template: needs service address + orientation video.
    const svc = ctx.service;
    const serviceAddress = [svc?.address, svc?.suburb, svc?.state].filter(Boolean).join(", ");
    const { subject, html } = nurtureSessionReminderEmail(
      ctx.name,
      ctx.centreName,
      serviceAddress || undefined,
      svc?.orientationVideoUrl || undefined,
      centreWebsiteUrl(svc?.code ?? undefined),
    );
    return { subject, html, source: "default" };
  }

  const templateFn = TEMPLATE_MAP[step.templateKey];
  if (templateFn) {
    const { subject, html } = await templateFn(ctx.name, ctx.centreName, ctx.enrolUrl, ctx.feedbackUrl);
    return { subject, html, source: "default" };
  }

  return {
    subject: step.name,
    html: marketingLayout(
      `<p style="margin:0;color:#374151;font-size:15px;line-height:1.6;">${escapeText(step.name)} — this email template has not been configured yet.</p>`,
      ctx.layoutOpts,
    ),
    source: "missing",
  };
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
