/**
 * Stage 4: pacing ("never too many emails"), the funnel, and unhappy feedback.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  generateRequestId: () => "req",
}));
const tasks: (() => Promise<void>)[] = [];
vi.mock("@/lib/run-after", () => ({ runAfter: (t: () => Promise<void>) => tasks.push(t) }));
vi.mock("@/lib/centre-team-alerts", () => ({ alertCentreTeam: vi.fn(async () => undefined) }));

import { paceNurtureSend } from "@/lib/journey-pacing";
import { getParentFunnel } from "@/lib/parent-funnel";
import { alertCentreTeam } from "@/lib/centre-team-alerts";
import { POST as quickFeedback } from "@/app/api/feedback/quick/route";
import { createRequest } from "../helpers/request";

// After the follow-up and OWNA checklist start dates (20 / 19 Oct 2026).
const NOW = new Date("2026-10-24T02:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

beforeEach(() => {
  vi.clearAllMocks();
  tasks.length = 0;
});

describe("never too many emails", () => {
  it("waits a day if the family heard from us in the last 20 hours", async () => {
    prismaMock.marketingSendRecipient.count.mockResolvedValue(1);
    expect(await paceNurtureSend("Sarah@Example.test", "day3_checkin", hoursAgo(1), NOW)).toBe("hold");
    expect(prismaMock.marketingSendRecipient.count.mock.calls[0][0].where).toEqual({
      email: "sarah@example.test",
      sentAt: { gte: hoursAgo(20) },
    });
    prismaMock.marketingSendRecipient.count.mockResolvedValue(0);
    expect(await paceNurtureSend("sarah@example.test", "day3_checkin", hoursAgo(1), NOW)).toBe("send");
  });

  it("never holds the day-before reminder, or anything already 3 days late", async () => {
    prismaMock.marketingSendRecipient.count.mockResolvedValue(5);
    expect(await paceNurtureSend("a@b.c", "session_reminder", hoursAgo(1), NOW)).toBe("send");
    expect(await paceNurtureSend("a@b.c", "nudge_1", hoursAgo(4 * 24), NOW)).toBe("send");
  });
});

describe("where families are now", () => {
  it("counts each family once, in the right stage", async () => {
    prismaMock.service.findMany.mockResolvedValue([
      { id: "ga", name: "Amana OSHC MFIS Greenacre", ownaServiceId: "o", ownaSyncedAt: hoursAgo(2) },
      { id: "bh", name: "Amana OSHC MFIS Beaumont Hills", ownaServiceId: null, ownaSyncedAt: null },
    ]);
    prismaMock.parentEnquiry.groupBy.mockResolvedValue([
      { serviceId: "ga", stage: "new_enquiry", _count: { _all: 3 } },
      { serviceId: "ga", stage: "info_sent", _count: { _all: 1 } },
      { serviceId: "ga", stage: "form_started", _count: { _all: 2 } },
      { serviceId: "ga", stage: "cold", _count: { _all: 4 } },
    ]);
    const c = { at: "2026-10-10T00:00:00Z", by: { id: "u", name: "U" }, evidence: "done" };
    const done = { state: { placement: "p", owner: null, note: "", steps: { children: c, invitation: { ...c, mode: "sent" }, access: c, sessions: { ...c, firstDay: "2026-10-12" } } } };
    prismaMock.enrolmentSubmission.findMany.mockResolvedValue([
      { serviceId: "ga", status: "submitted", createdAt: hoursAgo(30), ownaHandoff: null, childRecords: [] },
      { serviceId: "ga", status: "under_review", createdAt: hoursAgo(30), ownaHandoff: null, childRecords: [] },
      { serviceId: "ga", status: "processed", createdAt: hoursAgo(90), ownaHandoff: null, childRecords: [{ firstAttendedAt: null }] },
      { serviceId: "ga", status: "processed", createdAt: hoursAgo(90), ownaHandoff: done, childRecords: [{ firstAttendedAt: null }] },
      { serviceId: "ga", status: "processed", createdAt: hoursAgo(90), ownaHandoff: done, childRecords: [{ firstAttendedAt: hoursAgo(5) }] },
    ]);
    const [ga, bh] = await getParentFunnel(null, 90, NOW);
    expect(ga).toMatchObject({
      serviceName: "MFIS Greenacre",
      enquired: 4,
      formStarted: 2,
      waiting: 2,
      overdue: 1, // only "submitted" counts against the 24-hour promise
      ownaSetup: 1,
      ready: 1,
      attending: 1,
      lost: 4,
      attendanceLive: true,
    });
    expect(bh.attendanceLive).toBe(false);
  });
});

describe("unhappy feedback reaches the centre", () => {
  beforeEach(() => {
    prismaMock.service.findUnique.mockResolvedValue({ id: "ga", name: "Amana OSHC MFIS Greenacre" });
    prismaMock.quickFeedback.count.mockResolvedValue(0);
    prismaMock.quickFeedback.create.mockResolvedValue({ id: "f1" });
    prismaMock.coworkAnnouncement.create.mockResolvedValue({});
  });
  const send = (body: Record<string, unknown>) =>
    quickFeedback(createRequest("POST", "/api/feedback/quick", { body: { serviceId: "ga", ...body } }));

  it("a 1 or 2 → the centre and head office", async () => {
    await send({ score: 2, comment: "Pickup was chaotic", parentName: "Sarah" });
    for (const t of tasks) await t();
    expect(vi.mocked(alertCentreTeam)).toHaveBeenCalledWith(
      expect.objectContaining({ serviceId: "ga", headOffice: true, title: "Sarah rated their experience 2/5", body: '"Pickup was chaotic"' }),
    );
  });

  it("a 3 with a comment → the centre only; a 4 → nobody", async () => {
    await send({ score: 3, comment: "OK but slow" });
    await send({ score: 4, comment: "Great" });
    for (const t of tasks) await t();
    expect(vi.mocked(alertCentreTeam)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(alertCentreTeam).mock.calls[0][0].headOffice).toBe(false);
  });
});
