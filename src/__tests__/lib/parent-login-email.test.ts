import { beforeEach, describe, expect, it } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { parentMagicLinkEmail, parentPasswordResetEmail } from "@/lib/email-templates/parent-portal";
import { parentEmailLayout, UNSUBSCRIBE_URL_TOKEN } from "@/lib/email-templates/base";
import { _clearEmailTemplateOverrideCache } from "@/lib/email-template-overrides";

beforeEach(() => {
  _clearEmailTemplateOverrideCache();
  prismaMock.emailTemplateOverride.findMany.mockResolvedValue([]);
});
describe("transactional parent access emails", () => {
  it.each([parentMagicLinkEmail, parentPasswordResetEmail])("has a branded account-access footer with no unsubscribe placeholder", async template => {
    const { html } = await template("Aysha", "https://amanaoshc.company/test-link");
    expect(html).toContain("Amana OSHC");
    expect(html).toContain("help you access your Amana OSHC parent account");
    expect(html).not.toContain(UNSUBSCRIBE_URL_TOKEN);
    expect(html).not.toContain("Unsubscribe");
    expect(html).not.toContain("because you enquired");
  });
  it("keeps marketing unsubscribe links available in the default layout", () => {
    expect(parentEmailLayout("<p>News</p>")).toContain(UNSUBSCRIBE_URL_TOKEN);
  });
  it("retains the transactional footer when staff override the email copy", async () => {
    prismaMock.emailTemplateOverride.findMany.mockResolvedValue([{ key: "parentPortal.magicLink", subject: "Your Amana link", body: "Hi {{name}} {{loginButton}}" }]);
    const { html } = await parentMagicLinkEmail("Aysha", "https://amanaoshc.company/test-link");
    expect(html).toContain("Hi Aysha");
    expect(html).not.toContain(UNSUBSCRIBE_URL_TOKEN);
  });
});
