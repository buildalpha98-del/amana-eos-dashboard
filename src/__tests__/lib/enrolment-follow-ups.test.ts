/**
 * Keeping the 24-hour promise, and the Follow-ups lists.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(async () => ({ sent: ["x"], suppressed: [] })) }));
vi.mock("@/lib/notify-user", () => ({ notifyUsers: vi.fn(async () => 1) }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  generateRequestId: () => "req",
}));

import { sendEmail } from "@/lib/email";
import { notifyUsers } from "@/lib/notify-user";
import { alertNewEnrolment, alertNewEnquiry, centreTeamUserIds } from "@/lib/centre-team-alerts";
import { runEnrolmentReplyClock } from "@/lib/enrolment-reply-clock";
import { getFollowUps } from "@/lib/enrolment-follow-ups";

const NOW = new Date("2026-10-16T02:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
const daysAgo = (d: number) => hoursAgo(d * 24);

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.service.findUnique.mockResolvedValue({ managerId: "mgr", email: "mfisgreenacre@amanaoshc.com.au" });
  prismaMock.user.findMany.mockImplementation(async (args: { where: Record<string, unknown> }) =>
    args.where.role === "head_office" ? [{ email: "ho@amanaoshc.com.au" }] : [{ id: "mgr" }, { id: "centre" }, { id: "ho" }],
  );
  prismaMock.service.findMany.mockResolvedValue([{ id: "svc-ga", name: "Amana OSHC MFIS Greenacre" }]);
});

describe("who hears about it", () => {
  it("the centre's manager and coordinators, plus head office when asked", async () => {
    await centreTeamUserIds("svc-ga", { headOffice: true });
    const where = prismaMock.user.findMany.mock.calls[0][0].where;
    expect(where.active).toBe(true);
    expect(where.OR).toEqual([{ id: "mgr" }, { role: "member", serviceId: "svc-ga" }, { role: "head_office" }]);
  });

  it("a new enrolment goes to the enrolments inbox and head office in-app — not the centre", async () => {
    prismaMock.enrolmentSubmission.findUnique.mockResolvedValue({
      id: "e1",
      serviceId: "svc-ga",
      children: [{ firstName: "Yusuf" }],
      primaryParent: { firstName: "Sarah", surname: "Khan", mobile: "0400 000 000" },
    });
    await alertNewEnrolment("e1");
    expect(vi.mocked(notifyUsers).mock.calls[0][2]).toMatchObject({ title: "New enrolment: Yusuf", link: "/enrolments?id=e1" });
    const to = vi.mocked(sendEmail).mock.calls.map((c) => (c[0] as { to: string }).to);
    expect(to).toEqual(["enrolment@amanaoshc.com.au"]);
  });

  it("a new enquiry is in-app only — no extra email", async () => {
    prismaMock.parentEnquiry.findUnique.mockResolvedValue({ id: "q1", serviceId: "svc-ga", parentName: "Sarah", parentPhone: "0400" });
    await alertNewEnquiry("q1");
    expect(vi.mocked(notifyUsers)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled();
  });
});

describe("the 24-hour reply clock", () => {
  it("overdue first (with head office), then the 20-hour reminder; each claimed once", async () => {
    prismaMock.enrolmentSubmission.findMany
      .mockResolvedValueOnce([{ id: "late", serviceId: "svc-ga", children: [{ firstName: "Ali" }] }])
      .mockResolvedValueOnce([{ id: "due", serviceId: "svc-ga", children: [{ firstName: "Maryam" }] }]);
    prismaMock.enrolmentSubmission.updateMany.mockResolvedValue({ count: 1 });
    const r = await runEnrolmentReplyClock(NOW);
    expect(r).toEqual({ reminded: 1, overdue: 1 });
    const titles = vi.mocked(notifyUsers).mock.calls.map((c) => c[2].title);
    expect(titles).toEqual(["Overdue: Ali's family has waited over 24 hours", "4 hours left to reply: Maryam"]);
    // Only "submitted", only the last 72 hours — never an old backlog.
    const lateWhere = prismaMock.enrolmentSubmission.findMany.mock.calls[0][0].where;
    expect(lateWhere.status).toBe("submitted");
    expect(lateWhere.createdAt.gte).toEqual(hoursAgo(72));
    expect(lateWhere.createdAt.lte).toEqual(hoursAgo(24));
    expect(prismaMock.enrolmentSubmission.findMany.mock.calls[1][0].where.createdAt.lte).toEqual(hoursAgo(20));
  });

  it("sends nothing when another run already claimed it", async () => {
    prismaMock.enrolmentSubmission.findMany
      .mockResolvedValueOnce([{ id: "late", serviceId: "svc-ga", children: [] }])
      .mockResolvedValueOnce([]);
    prismaMock.enrolmentSubmission.updateMany.mockResolvedValue({ count: 0 });
    expect(await runEnrolmentReplyClock(NOW)).toEqual({ reminded: 0, overdue: 0 });
    expect(vi.mocked(notifyUsers)).not.toHaveBeenCalled();
  });
});

describe("Follow-ups lists", () => {
  beforeEach(() => {
    prismaMock.enrolmentSubmission.findMany.mockResolvedValue([
      { id: "e1", createdAt: hoursAgo(21), serviceId: "svc-ga", children: [{ firstName: "Yusuf" }], primaryParent: { firstName: "Sarah", mobile: "0400" } },
    ]);
    prismaMock.enrolmentDraft.findMany.mockResolvedValue([
      {
        currentStep: 2,
        updatedAt: daysAgo(5),
        data: { me: { firstName: "Huda", mobile: "0411" }, children: [{ firstName: "Adam", schoolName: "Malek Fahd Islamic School Greenacre" }] },
        account: { id: "acc1", email: "huda@example.test", firstName: "Huda", surname: null, enrolmentReminderSentAt: null },
      },
      {
        currentStep: 0,
        updatedAt: daysAgo(6),
        data: { me: { firstName: "No school yet" } },
        account: { id: "acc2", email: "x@example.test", firstName: null, surname: null, enrolmentReminderSentAt: null },
      },
    ]);
  });

  it("shows hours left, and only families who've picked a school", async () => {
    const r = await getFollowUps(null, NOW);
    expect(r.awaiting[0]).toMatchObject({ childNames: "Yusuf", hoursWaiting: 21, hoursLeft: 3, serviceName: "MFIS Greenacre" });
    expect(r.unfinished).toHaveLength(1);
    expect(r.unfinished[0]).toMatchObject({ accountId: "acc1", phone: "0411", step: "Contacts", stepNumber: 3, daysIdle: 5 });
    const draftWhere = prismaMock.enrolmentDraft.findMany.mock.calls[0][0].where;
    expect(draftWhere.submittedAt).toBeNull();
    expect(draftWhere.updatedAt.lte).toEqual(daysAgo(4));
  });

  it("a coordinator only sees their own centre", async () => {
    const r = await getFollowUps(["some-other-centre"], NOW);
    expect(r.unfinished).toHaveLength(0);
    expect(prismaMock.enrolmentSubmission.findMany.mock.calls[0][0].where.serviceId).toEqual({ in: ["some-other-centre"] });
  });
});
