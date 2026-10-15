/**
 * The school-specific welcome email at enrolment approval
 * (src/lib/enrolment-welcome.ts + email-templates/enrolment-welcome.ts).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(async () => ({ sent: ["x"], suppressed: [] })) }));
vi.mock("@/lib/email-template-overrides", () => ({
  applyEmailTemplateOverride: async (o: { defaultSubject: string; defaultBody: string; vars: Record<string, string>; wrap: (b: string) => string }) => {
    const fill = (t: string) => t.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in o.vars ? o.vars[k] : m));
    return { subject: fill(o.defaultSubject), html: o.wrap(fill(o.defaultBody)) };
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  generateRequestId: () => "req",
}));

import { sendEmail } from "@/lib/email";
import { centreWelcomeData, describeSessionTimes, sendEnrolmentWelcome, upcomingProgram } from "@/lib/enrolment-welcome";
import { enrolmentWelcomeEmail } from "@/lib/email-templates/enrolment-welcome";

const service = (content: Record<string, unknown> = {}) => ({
  name: "Amana OSHC MFIS Greenacre",
  code: "MFIS-GA",
  phone: "0494 379 929",
  email: "mfisgreenacre@amanaoshc.com.au",
  sessionTimes: { bsc: { start: "06:30", end: "08:30" }, asc: { start: "15:00", end: "18:30" } },
  content,
});

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.programActivity.findMany.mockResolvedValue([]);
});

describe("centre details", () => {
  it("falls back to the website's coordinator and welcome pack", async () => {
    prismaMock.service.findUnique.mockResolvedValue(service());
    const d = await centreWelcomeData("svc-ga");
    expect(d).toMatchObject({
      centreName: "MFIS Greenacre",
      coordinatorName: "Sarah Awad",
      coordinatorPhoto: "https://amanaoshc.com.au/centres/mfis-greenacre/coordinator.jpg",
      welcomePackUrl: "https://amanaoshc.com.au/welcome-packs/amana-oshc-welcome-pack-mfis-greenacre.pdf",
      sessionTimes: ["Before school 6:30am – 8:30am", "After school 3:00pm – 6:30pm"],
    });
  });

  it("the centre's own Content tab wins", async () => {
    prismaMock.service.findUnique.mockResolvedValue(
      service({ welcomeCoordinatorName: "Mariam", welcomePackUrl: "https://blob.example/pack.pdf", firstSessionTips: "• Bring a hat\n\nGate 3 only" }),
    );
    const d = await centreWelcomeData("svc-ga");
    expect(d?.coordinatorName).toBe("Mariam");
    expect(d?.welcomePackUrl).toBe("https://blob.example/pack.pdf");
    expect(d?.firstSessionTips).toEqual(["Bring a hat", "Gate 3 only"]);
  });

  it("reads session times defensively", () => {
    expect(describeSessionTimes(null)).toEqual([]);
    expect(describeSessionTimes({ asc: { start: "15:15", end: "18:00" } })).toEqual(["After school 3:15pm – 6:00pm"]);
  });
});

describe("what's coming up", () => {
  it("lists highlights per week — no meals or free play, no repeats, four at most", async () => {
    const wk = new Date("2026-10-19T00:00:00Z");
    const row = (day: string, startTime: string, title: string, programmeBrand: string | null = null) => ({ weekStart: wk, day, startTime, title, programmeBrand });
    prismaMock.programActivity.findMany.mockResolvedValue([
      row("monday", "15:00", "Afternoon tea", "fuel_up"),
      row("monday", "15:30", "Slime science"),
      row("tuesday", "15:30", "Slime science"),
      row("tuesday", "16:00", "Free play", "free_play"),
      row("wednesday", "15:30", "Quran circle"),
      row("thursday", "15:30", "Soccer skills"),
      row("friday", "15:30", "Movie & popcorn"),
      row("friday", "16:30", "Lego build"),
    ]);
    const weeks = await upcomingProgram("svc", new Date("2026-10-14T00:00:00Z"));
    expect(weeks).toEqual([
      { label: "Week of 19 October", activities: ["Slime science", "Quran circle", "Soccer skills", "Movie & popcorn"] },
    ]);
  });
});

describe("the email", () => {
  const base = {
    parentFirstName: "Sarah",
    childNames: ["Yusuf", "Maryam"],
    centreName: "MFIS Greenacre",
    coordinatorName: "Sarah Awad",
    coordinatorPhoto: "https://amanaoshc.com.au/c.jpg",
    centrePhone: "0494 379 929",
    centreEmail: "mfisgreenacre@amanaoshc.com.au",
    sessionTimes: ["After school 3:00pm – 6:30pm"],
    locationWithinSchool: "School Hall",
    meetingPoints: null,
    firstSessionTips: [],
    welcomeNote: null,
    welcomePackUrl: "https://amanaoshc.com.au/pack.pdf",
    centrePageUrl: null,
    program: [{ label: "Week of 19 October", activities: ["Slime science"] }],
    verifyLink: null,
  };

  it("is school-specific and has every section", async () => {
    const { subject, html } = await enrolmentWelcomeEmail(base);
    expect(subject).toBe("Welcome to Amana OSHC, Sarah! We can't wait to see Yusuf and Maryam");
    for (const s of ["Sarah Awad", "School Hall", "Read the welcome pack", "Slime science", "extra day", "OWNA", "myGov"]) {
      expect(html).toContain(s);
    }
  });

  it("leaves out sections it has nothing for", async () => {
    const { html } = await enrolmentWelcomeEmail({ ...base, welcomePackUrl: null, program: [], coordinatorPhoto: null });
    expect(html).not.toContain("Read the welcome pack");
    expect(html).not.toContain("Coming up at");
    expect(html).not.toContain("<img src=\"https://amanaoshc.com.au/c.jpg\"");
  });

  it("escapes what families type", async () => {
    const { html } = await enrolmentWelcomeEmail({ ...base, parentFirstName: "<b>Sarah</b>", childNames: ["<script>x</script>"] });
    expect(html).not.toContain("<script>x</script>");
    expect(html).not.toContain("<b>Sarah</b>");
  });
});

describe("sending", () => {
  const submission = { serviceId: "svc-ga", primaryParent: { email: "sarah@example.test", firstName: "Sarah" } };

  it("sends once, and never again", async () => {
    prismaMock.enrolmentSubmission.findUnique.mockResolvedValue(submission);
    prismaMock.service.findUnique.mockResolvedValue(service());
    prismaMock.child.findMany.mockResolvedValue([{ firstName: "Yusuf" }]);
    prismaMock.enrolmentSubmission.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    expect(await sendEnrolmentWelcome("e1", { verifyLink: null })).toBe("sent");
    expect(await sendEnrolmentWelcome("e1", { verifyLink: null })).toBe("already_sent");
    expect(vi.mocked(sendEmail)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendEmail).mock.calls[0][1]).toEqual({ idempotencyKey: "enrolment-welcome-e1" });
    expect(prismaMock.enrolmentSubmission.updateMany.mock.calls[0][0].where).toEqual({ id: "e1", welcomeEmailSentAt: null });
  });

  it("releases the claim if the send fails, so it can be retried", async () => {
    prismaMock.enrolmentSubmission.findUnique.mockResolvedValue(submission);
    prismaMock.service.findUnique.mockResolvedValue(service());
    prismaMock.child.findMany.mockResolvedValue([]);
    prismaMock.enrolmentSubmission.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.enrolmentSubmission.update.mockResolvedValue({});
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error("resend down"));
    await expect(sendEnrolmentWelcome("e1", { verifyLink: null })).rejects.toThrow("resend down");
    expect(prismaMock.enrolmentSubmission.update.mock.calls[0][0].data).toEqual({ welcomeEmailSentAt: null });
  });
});
