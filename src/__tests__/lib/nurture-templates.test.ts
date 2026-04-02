import { describe, it, expect } from "vitest";
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
  nurtureFormAbandonmentEmail,
  nurtureExitSurveyEmail,
  retentionCasualReengageEmail,
  retentionTermTransitionEmail,
  retentionWithdrawalInterceptEmail,
  retentionDayChangeReminderEmail,
} from "@/lib/email-templates";

describe("Nurture email templates", () => {
  const firstName = "Sarah";
  const centreName = "Auburn BSC";

  /** All templates that take (firstName, centreName) — must be in TEMPLATE_MAP */
  const standardTemplates: Record<string, (fn: string, cn: string) => { subject: string; html: string }> = {
    welcome: nurtureWelcomeEmail,
    how_to_enrol: nurtureHowToEnrolEmail,
    what_to_bring: nurtureWhatToBringEmail,
    app_setup: nurtureAppSetupEmail,
    first_week: nurtureFirstWeekEmail,
    nps_survey: nurtureNpsSurveyEmail,
    ccs_assist: nurtureCcsAssistEmail,
    nudge_1: nurtureNudge1Email,
    form_support: nurtureFormSupportEmail,
    form_abandonment: nurtureFormAbandonmentEmail,
    nudge_2: nurtureNudge2Email,
    final_nudge: nurtureFinalNudgeEmail,
    day1_checkin: nurtureDay1CheckinEmail,
    day3_checkin: nurtureDay3CheckinEmail,
    week2_feedback: nurtureWeek2FeedbackEmail,
    month1_referral: nurtureMonth1ReferralEmail,
    casual_reengage: retentionCasualReengageEmail,
    day_change_reminder: retentionDayChangeReminderEmail,
    withdrawal_intercept: retentionWithdrawalInterceptEmail,
  };

  describe.each(Object.entries(standardTemplates))(
    "template: %s",
    (key, templateFn) => {
      it("returns subject and html", () => {
        const result = templateFn(firstName, centreName);
        expect(result).toHaveProperty("subject");
        expect(result).toHaveProperty("html");
        expect(result.subject.length).toBeGreaterThan(0);
        expect(result.html.length).toBeGreaterThan(0);
      });

      it("includes firstName in html", () => {
        const result = templateFn(firstName, centreName);
        expect(result.html).toContain(firstName);
      });

      it("includes centreName in html", () => {
        const result = templateFn(firstName, centreName);
        expect(result.html).toContain(centreName);
      });

      it("uses parentEmailLayout (no EOS Dashboard branding)", () => {
        const result = templateFn(firstName, centreName);
        expect(result.html).not.toContain("EOS Dashboard");
        expect(result.html).not.toContain("Leadership Team Portal");
      });

      it("has valid HTML structure", () => {
        const result = templateFn(firstName, centreName);
        expect(result.html).toContain("<!DOCTYPE html>");
        expect(result.html).toContain("</html>");
        expect(result.html).toContain("Amana OSHC");
      });
    },
  );

  describe("session_reminder (extra params)", () => {
    it("works with just firstName and centreName", () => {
      const result = nurtureSessionReminderEmail(firstName, centreName);
      expect(result.subject.length).toBeGreaterThan(0);
      expect(result.html).toContain(firstName);
      expect(result.html).not.toContain("EOS Dashboard");
    });

    it("includes address when provided", () => {
      const result = nurtureSessionReminderEmail(firstName, centreName, "123 Main St, Auburn, NSW");
      expect(result.html).toContain("123 Main St, Auburn, NSW");
    });

    it("includes orientation video link when provided", () => {
      const result = nurtureSessionReminderEmail(firstName, centreName, undefined, "https://example.com/video");
      expect(result.html).toContain("https://example.com/video");
      expect(result.html).toContain("Orientation Video");
    });
  });

  describe("exit_survey (extra params)", () => {
    it("includes survey URL", () => {
      const result = nurtureExitSurveyEmail(firstName, centreName, "https://example.com/survey");
      expect(result.html).toContain("https://example.com/survey");
      expect(result.html).not.toContain("EOS Dashboard");
    });
  });

  describe("term_transition (extra params)", () => {
    it("includes term number and year", () => {
      const result = retentionTermTransitionEmail(firstName, centreName, "2", "2026");
      expect(result.html).toContain("Term 2");
      expect(result.html).toContain("2026");
      expect(result.subject).toContain("Term 2");
    });
  });

  describe("TEMPLATE_MAP completeness", () => {
    // These are the templateKeys the scheduler creates — every one needs
    // a matching entry in the cron's TEMPLATE_MAP or special handling.
    const schedulerTemplateKeys = [
      "welcome", "ccs_assist", "how_to_enrol", "nudge_1",
      "nudge_2", "final_nudge",
      "form_support", "form_abandonment",
      "session_reminder", // Handled via special case, not TEMPLATE_MAP
      "what_to_bring", "day1_checkin", "day3_checkin",
      "app_setup", "first_week", "week2_feedback",
      "nps_survey", "month1_referral",
    ];

    it.each(schedulerTemplateKeys)(
      "templateKey '%s' has a matching template function",
      (key) => {
        if (key === "session_reminder") {
          // Special case in cron — uses nurtureSessionReminderEmail directly
          const result = nurtureSessionReminderEmail(firstName, centreName);
          expect(result.html.length).toBeGreaterThan(0);
          return;
        }
        const fn = standardTemplates[key];
        expect(fn).toBeDefined();
        const result = fn(firstName, centreName);
        expect(result.html.length).toBeGreaterThan(0);
      },
    );
  });
});
