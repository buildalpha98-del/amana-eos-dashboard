/**
 * templateKey → the hardcoded default email for a parent nurture step.
 * Shared by the sender (cron nurture-send) and the Parent journey page's
 * previews, so what staff preview is exactly what families receive.
 * `session_reminder` is separate — it needs the service address/video.
 */
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
  retentionCasualReengageEmail,
  retentionDayChangeReminderEmail,
  retentionWithdrawalInterceptEmail,
  nurtureFormAbandonmentEmail,
} from "@/lib/email-templates";

export type NurtureTemplateFn = (
  firstName: string,
  centreName: string,
  enrolUrl?: string,
  feedbackUrl?: string,
) => { subject: string; html: string } | Promise<{ subject: string; html: string }>;

export const NURTURE_TEMPLATE_MAP: Record<string, NurtureTemplateFn> = {
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
