import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/email-branding", () => ({
  getEmailBranding: async () => ({
    name: "Amana OSHC", primaryColor: "#004E64", websiteUrl: "https://x.test", websiteUrlLabel: "x",
  }),
}));

import { hasDefaultTemplate, renderSequenceStepEmail } from "@/lib/sequence-email-render";
import { SEED_SEQUENCES } from "@/lib/sequence-seed-data";
import { describeDelay, describeTrigger } from "@/lib/sequence-flow-labels";

const ctx = {
  sequenceType: "parent_nurture" as const,
  name: "Sarah",
  centreName: "Amana Greenacre",
  layoutOpts: {},
};

describe("renderSequenceStepEmail", () => {
  it("prefers the step's custom html template", async () => {
    const out = await renderSequenceStepEmail(
      { name: "Welcome", templateKey: "welcome", emailTemplate: { subject: "Custom hi", blocks: null, htmlContent: "<p>custom body</p>" } },
      ctx,
    );
    expect(out.source).toBe("custom");
    expect(out.subject).toBe("Custom hi");
    expect(out.html).toContain("custom body");
  });

  it("falls back to the hardcoded default for a known key", async () => {
    const out = await renderSequenceStepEmail({ name: "Welcome", templateKey: "welcome" }, ctx);
    expect(out.source).toBe("default");
    expect(out.html).toContain("Sarah");
  });

  it("marks an unknown key as missing (escaping the step name)", async () => {
    const out = await renderSequenceStepEmail({ name: "<b>Intro</b>", templateKey: "school_intro" }, {
      ...ctx,
      sequenceType: "crm_outreach",
    });
    expect(out.source).toBe("missing");
    expect(out.html).toContain("&lt;b&gt;Intro&lt;/b&gt;");
  });

  it("session_reminder only has a default for parent flows", () => {
    expect(hasDefaultTemplate("session_reminder", "parent_nurture")).toBe(true);
    expect(hasDefaultTemplate("session_reminder", "crm_outreach")).toBe(false);
  });

  it("every seeded family-journey step has real content", () => {
    for (const seq of SEED_SEQUENCES.filter((s) => s.type === "parent_nurture")) {
      for (const step of seq.steps) {
        expect(hasDefaultTemplate(step.templateKey, seq.type), `${seq.name} → ${step.templateKey}`).toBe(true);
      }
    }
  });
});

describe("flow labels", () => {
  it("describes delays in the largest whole unit", () => {
    expect(describeDelay(0)).toBe("Immediately");
    expect(describeDelay(4)).toBe("4 hours after");
    expect(describeDelay(-24)).toBe("1 day before");
    expect(describeDelay(48)).toBe("2 days after");
    expect(describeDelay(336)).toBe("2 weeks after");
  });

  it("labels triggers", () => {
    expect(describeTrigger("new_enquiry")).toBe("New enquiry");
    expect(describeTrigger(null)).toBe("Manual enrolment");
    expect(describeTrigger("some_new_stage")).toBe("some new stage");
  });
});
