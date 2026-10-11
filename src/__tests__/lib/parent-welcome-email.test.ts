import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { sendEmail } from "@/lib/email";
import { sendParentWelcomeInvite } from "@/lib/notifications/parent-welcome";
import { enrolmentReceivedEmail, enrolmentApprovedEmail } from "@/lib/email-templates/parent-account";
import { UNSUBSCRIBE_URL_TOKEN } from "@/lib/email-templates/base";
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.centreContact.findUnique.mockResolvedValue({
    id: "contact-test", email: "parent@example.test", firstName: "Aysha",
    service: { name: "Amana Greenacre" },
  });
  prismaMock.parentMagicLink.create.mockResolvedValue({ id: "link-test" });
  prismaMock.notificationLog.create.mockResolvedValue({ id: "log-test" });
  vi.mocked(sendEmail).mockResolvedValue({ sent: ["parent@example.test"], suppressed: [] });
});

describe("parent welcome email", () => {
  it.each([false, true])("uses the explicit confirmation flow and transactional footer (resend=%s)", async resend => {
    expect(await sendParentWelcomeInvite({ contactId: "contact-test", resend })).toEqual({sent:true,email:"parent@example.test"});
    const {html} = vi.mocked(sendEmail).mock.calls[0][0];
    expect(html).toMatch(/\/parent\/login\/confirm#token=[a-f0-9]{64}/);
    expect(html).toContain("Continue to my account");
    expect(html).toContain("help you access your Amana OSHC parent account");
    expect(html).not.toContain(UNSUBSCRIBE_URL_TOKEN);
    expect(html).not.toContain("/api/parent/auth/verify?");
  });
  it("escapes parent, child and centre names in HTML", async () => {
    prismaMock.centreContact.findUnique.mockResolvedValue({ id:"contact-test",email:"parent@example.test",firstName:"<Parent>",service:{name:"<School>"} });
    await sendParentWelcomeInvite({contactId:"contact-test",childFirstName:"<Child>"});
    const {html}=vi.mocked(sendEmail).mock.calls[0][0];
    for(const name of ["Parent","School","Child"]){expect(html).toContain(`&lt;${name}&gt;`);expect(html).not.toContain(`<${name}>`);}
  });
  it.each([
    {sent:[],suppressed:[],failed:{message:"Provider rejected"}},
    {sent:[],suppressed:["parent@example.test"]},
  ])("does not record a rejected or suppressed invite as sent", async result => {
    vi.mocked(sendEmail).mockResolvedValue(result);
    expect(await sendParentWelcomeInvite({contactId:"contact-test"})).toEqual({sent:false,email:"parent@example.test"});
    expect(prismaMock.notificationLog.create).not.toHaveBeenCalled();
  });
});

it("brands receipt and approval emails consistently with the parent portal", async () => {
  const emails = [
    await enrolmentReceivedEmail({name:"Aysha",childNames:["Mo"]}),
    await enrolmentApprovedEmail({name:"Aysha",childNames:["Mo"],verifyLink:null}),
  ];
  for(const {html} of emails){
    expect(html).toContain("/email/amana-logo-yellow.png");
    expect(html).toContain("help you access your Amana OSHC parent account");
    expect(html).toContain("OWNA");
    expect(html).not.toContain(UNSUBSCRIBE_URL_TOKEN);
  }
});
