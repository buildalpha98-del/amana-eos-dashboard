/**
 * First-day check + call (Daniel, 21 Oct 2026): staff confirm the child came
 * before "how did it go?" goes out, then call the family.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(async () => ({ sent: ["x"], suppressed: [] })) }));
vi.mock("@/lib/notify-user", () => ({ notifyUsers: vi.fn(async () => 1) }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  generateRequestId: () => "req",
}));

import { notifyUsers } from "@/lib/notify-user";
import { sendEmail } from "@/lib/email";
import { firstDayFollowUps, firstDayOf, recordFirstDay, runFirstDayPrompts } from "@/lib/first-day-check";
import { attendanceGate } from "@/lib/attendance-journey";

// Wednesday 22 Oct 2026, 10:30am Sydney.
const NOW = new Date("2026-10-21T23:30:00Z");
const by = { id: "u", name: "U" };
const handoff = (sessions: Record<string, unknown>) => ({ state: { placement: "p", owner: null, note: "", steps: { sessions: { at: "t", by, evidence: "", ...sessions } } } });

function sub(over: Record<string, unknown> = {}) {
  return {
    id: "e1",
    serviceId: "svc-ga",
    createdAt: new Date("2026-10-20T00:00:00Z"),
    children: [{ firstName: "Yusuf" }],
    primaryParent: { firstName: "Sarah", surname: "Khan", mobile: "0400 000 000", email: "sarah@example.test" },
    firstDayAttendance: null,
    firstDayAttendanceAt: null,
    firstDayCalledAt: null,
    ownaHandoff: handoff({ firstDay: "2026-10-21" }),
    childRecords: [{ id: "c1", firstName: "Yusuf", bookingPrefs: { startDate: "2026-10-28" }, firstAttendedAt: null }],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.user.findMany.mockResolvedValue([{ id: "ho" }]);
});

describe("the first day", () => {
  it("is the day confirmed on the checklist, else the form's start date; casual has none", () => {
    expect(firstDayOf(sub())).toBe("2026-10-21");
    expect(firstDayOf(sub({ ownaHandoff: null }))).toBe("2026-10-28");
    expect(firstDayOf(sub({ ownaHandoff: handoff({ casual: true }) }))).toBeNull();
  });
});

describe("Follow-ups", () => {
  const names = new Map([["svc-ga", "MFIS Greenacre"]]);
  it("asks 'did they come?' once the first day has passed, then moves them to the call list", async () => {
    prismaMock.enrolmentSubmission.findMany.mockResolvedValue([
      sub(),
      sub({ id: "e2", firstDayAttendance: "attended" }),
      sub({ id: "e3", firstDayAttendance: "absent" }),
      sub({ id: "e4", firstDayAttendance: "attended", firstDayCalledAt: new Date() }),
      sub({ id: "e5", ownaHandoff: handoff({ firstDay: "2026-10-23" }) }), // not yet
    ]);
    const r = await firstDayFollowUps(null, names, NOW);
    expect(r.firstDayCheck.map((x) => x.id)).toEqual(["e1"]);
    expect(r.firstDayCheck[0]).toMatchObject({ childNames: "Yusuf", parentName: "Sarah Khan", serviceName: "MFIS Greenacre" });
    expect(r.firstDayCalls.map((x) => [x.id, x.attendance])).toEqual([
      ["e2", "attended"],
      ["e3", "absent"],
    ]);
  });
  it("an OWNA sign-in counts as attended — no button needed", async () => {
    prismaMock.enrolmentSubmission.findMany.mockResolvedValue([
      sub({ childRecords: [{ id: "c1", firstName: "Yusuf", bookingPrefs: null, firstAttendedAt: new Date("2026-10-21T00:00:00Z") }] }),
    ]);
    const r = await firstDayFollowUps(null, names, NOW);
    expect(r.firstDayCheck).toHaveLength(0);
    expect(r.firstDayCalls[0].attendance).toBe("attended");
  });
});

describe("the morning-after prompt", () => {
  it("asks head office once, claimed first", async () => {
    prismaMock.enrolmentSubmission.findMany.mockResolvedValue([sub()]);
    prismaMock.enrolmentSubmission.updateMany.mockResolvedValue({ count: 1 });
    expect(await runFirstDayPrompts(NOW)).toEqual({ prompted: 1 });
    expect(vi.mocked(notifyUsers).mock.calls[0][2].title).toBe("Did Yusuf come on Wednesday 21 October?");
    expect(vi.mocked(sendEmail).mock.calls[0][0]).toMatchObject({ to: "enrolment@amanaoshc.com.au" });
    prismaMock.enrolmentSubmission.updateMany.mockResolvedValue({ count: 0 });
    vi.clearAllMocks();
    expect(await runFirstDayPrompts(NOW)).toEqual({ prompted: 0 });
  });
});

describe("Attended / Didn't attend", () => {
  it("Attended stamps the first attendance and releases the held check-in now", async () => {
    prismaMock.enrolmentSubmission.findUnique.mockResolvedValue(sub());
    prismaMock.sequenceStepExecution.findMany.mockResolvedValue([
      { id: "x1", step: { delayHours: 24 }, enrolment: { anchorDate: new Date("2026-10-21T00:00:00Z") } }, // day-1: due
      { id: "x3", step: { delayHours: 72 }, enrolment: { anchorDate: new Date("2026-10-21T00:00:00Z") } }, // day-3: later
    ]);
    const later = new Date("2026-10-22T01:00:00Z"); // noon Sydney: day-1 is due, day-3 isn't
    await recordFirstDay("e1", "attended", "staff-1", later);
    expect(prismaMock.enrolmentSubmission.update.mock.calls[0][0].data).toMatchObject({ firstDayAttendance: "attended", firstDayAttendanceById: "staff-1" });
    expect(prismaMock.child.updateMany.mock.calls[0][0].data.firstAttendedAt).toEqual(new Date("2026-10-21T00:00:00Z"));
    expect(prismaMock.sequenceStepExecution.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: { in: ["x1"] } }, data: { scheduledFor: later } });
  });
  it("Didn't attend records the answer and sends nothing", async () => {
    prismaMock.enrolmentSubmission.findUnique.mockResolvedValue(sub());
    await recordFirstDay("e1", "absent", "staff-1", NOW);
    expect(prismaMock.enrolmentSubmission.update.mock.calls[0][0].data).toMatchObject({ firstDayAttendance: "absent" });
    expect(prismaMock.child.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.sequenceStepExecution.updateMany).not.toHaveBeenCalled();
  });
});

describe("the 'how did it go?' gate without OWNA attendance", () => {
  beforeEach(() => {
    prismaMock.service.findUnique.mockResolvedValue({ ownaServiceId: null, ownaSyncedAt: null }); // no OWNA data
    prismaMock.child.findMany.mockResolvedValue([]); // nothing attended
  });
  it("holds it for a family staff will be asked about", async () => {
    prismaMock.enrolmentSubmission.findMany.mockResolvedValue([sub()]);
    expect(await attendanceGate("day1_checkin", "sarah@example.test", "svc-ga", new Date("2026-10-21T00:00:00Z"), NOW)).toBe("hold");
  });
  it("sends once staff tap Attended (the child's first attendance is stamped)", async () => {
    prismaMock.child.findMany.mockResolvedValue([{ enrolment: { primaryParent: { email: "sarah@example.test" }, secondaryParent: null } }]);
    expect(await attendanceGate("day1_checkin", "sarah@example.test", "svc-ga", new Date("2026-10-21T00:00:00Z"), NOW)).toBe("send");
  });
  it("older families keep the original send-on-schedule behaviour", async () => {
    prismaMock.enrolmentSubmission.findMany.mockResolvedValue([]);
    expect(await attendanceGate("day1_checkin", "old@example.test", "svc-ga", new Date("2026-10-10T00:00:00Z"), NOW)).toBe("send");
  });
});
