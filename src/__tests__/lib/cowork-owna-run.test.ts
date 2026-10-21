/**
 * Cowork's OWNA data run (Daniel, 21 Oct 2026): what Cowork reads from the
 * OWNA website runs through the normal sync, makes the centre's data live,
 * and drives the parent journey — including "we're still here" for casual
 * families and the Quiet families list.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(async () => ({ sent: ["x"], suppressed: [] })) }));
vi.mock("@/lib/notify-user", () => ({ notifyUsers: vi.fn(async () => 1) }));
vi.mock("@/lib/frequency-cap", () => ({ recordMarketingSends: vi.fn(async () => undefined) }));
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
const syncOwnaService = vi.fn(async () => ({ children: 0, attendance: 0, enquiries: 0, incidents: 0 }));
vi.mock("@/lib/owna-sync", () => ({ syncOwnaService: (...a: unknown[]) => syncOwnaService(...(a as [])) }));

import { sendEmail } from "@/lib/email";
import { coworkChildId, coworkOwnaRunSchema, runCoworkOwnaData } from "@/lib/cowork-owna-run";
import { attendanceDataLive } from "@/lib/attendance-journey";
import { runMissedSessionChecks } from "@/lib/missed-sessions";
import { quietFamilies } from "@/lib/quiet-families";
import type { OwnaClient } from "@/lib/owna";

const NOW = new Date("2026-11-20T00:00:00Z");

describe("the Cowork run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.service.findUnique.mockResolvedValue({ id: "svc", code: "MFIS-GA" });
    prismaMock.child.count.mockResolvedValue(1);
    prismaMock.service.update.mockResolvedValue({});
    prismaMock.ownaDataRun.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "run1", ...data }));
  });

  it("feeds the normal OWNA sync, stamps the feed and logs the run", async () => {
    const run = coworkOwnaRunSchema.parse({
      serviceCode: "MFIS-GA",
      runType: "midweek",
      children: [{ firstName: "Yusuf", surname: "Khan", dob: "2018-03-02", bookedDays: { tuesday: true } }],
      attendance: [
        { firstName: "Yusuf", surname: "Khan", dob: "2018-03-02", date: "2026-11-17", session: "asc", signedIn: true },
        { firstName: "Maryam", surname: "Ali", date: "2026-11-17", session: "bsc", signedIn: false },
      ],
    });
    const r = await runCoworkOwnaData(run, NOW);
    expect(r).toMatchObject({ runId: "run1", children: 2, attendance: 2, signedIn: 1, matched: 1, errors: [] });

    const adapter = (syncOwnaService.mock.calls[0] as unknown[])[3] as OwnaClient;
    const kids = await adapter.getChildren("x");
    expect(kids.map((k) => [k.id, k.tuesday, k.attending])).toEqual([
      ["cowork:mfis-ga:khan:yusuf:2018-03-02", true, true],
      ["cowork:mfis-ga:ali:maryam:nodob", false, true], // seen only in attendance → still a row to match
    ]);
    const att = await adapter.getAttendance("x", "a", "b");
    expect(att[0]).toMatchObject({ childId: kids[0].id, attending: true, attendanceDate: "2026-11-17", sessionOfCare: "15:00-18:00" });
    expect(att[1]).toMatchObject({ attending: false, sessionOfCare: "07:00-09:00" });

    expect(prismaMock.service.update.mock.calls[0][0]).toEqual({ where: { id: "svc" }, data: { coworkFeedAt: NOW } });
  });

  it("an OWNA id wins over the name-based id", () => {
    expect(coworkChildId("UG", { ownaChildId: "abc123", firstName: "A", surname: "B" })).toBe("abc123");
  });

  it("unknown centre → null", async () => {
    prismaMock.service.findUnique.mockResolvedValue(null);
    expect(await runCoworkOwnaData(coworkOwnaRunSchema.parse({ serviceCode: "NOPE" }), NOW)).toBeNull();
  });
});

describe("live attendance data", () => {
  it("Cowork's twice-weekly run counts as live for ~4.5 days; the API for 48 hours", async () => {
    prismaMock.service.findUnique.mockResolvedValue({ ownaServiceId: null, ownaSyncedAt: null, coworkFeedAt: new Date(NOW.getTime() - 96 * 3_600_000) });
    expect(await attendanceDataLive("svc", NOW)).toBe(true);
    prismaMock.service.findUnique.mockResolvedValue({ ownaServiceId: null, ownaSyncedAt: null, coworkFeedAt: new Date(NOW.getTime() - 120 * 3_600_000) });
    expect(await attendanceDataLive("svc", NOW)).toBe(false);
    prismaMock.service.findUnique.mockResolvedValue({ ownaServiceId: "o", ownaSyncedAt: new Date(NOW.getTime() - 3_600_000), coworkFeedAt: null });
    expect(await attendanceDataLive("svc", NOW)).toBe(true);
  });
});

describe("we're still here — casual families", () => {
  const LAST = new Date("2026-10-14T00:00:00Z"); // 37 days before NOW
  const coverage = () => {
    const rows = [];
    for (let t = NOW.getTime() - 14 * 86_400_000; t < NOW.getTime(); t += 86_400_000) {
      const d = new Date(t);
      if (d.getUTCDay() >= 1 && d.getUTCDay() <= 5) rows.push({ date: d });
    }
    return rows;
  };
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXTAUTH_SECRET = "test-secret";
    prismaMock.child.findMany.mockResolvedValue([
      {
        id: "c1",
        firstName: "Yusuf",
        serviceId: "svc",
        enrolmentId: "e1",
        lastAttendedAt: LAST,
        ownaMatchChildId: "o1",
        missedCheckInSentAt: null,
        enrolment: { primaryParent: { email: "sarah@example.test", firstName: "Sarah" } },
      },
    ]);
    prismaMock.child.findUnique.mockResolvedValue({ status: "active", bookingPrefs: { monday: false } }); // casual
    prismaMock.child.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.dailyAttendance.findMany.mockResolvedValue(coverage());
    prismaMock.programActivity.findMany.mockResolvedValue([]);
    prismaMock.user.findMany.mockResolvedValue([{ id: "coord" }]);
    prismaMock.service.findUnique.mockImplementation(async (a: { select: Record<string, boolean> }) =>
      "coworkFeedAt" in a.select
        ? { ownaServiceId: null, ownaSyncedAt: null, coworkFeedAt: new Date(NOW.getTime() - 3_600_000) }
        : { name: "Amana OSHC MFIS Greenacre", code: "MFIS-GA", phone: "0494 379 929", email: "c@amanaoshc.com.au", sessionTimes: null, content: {}, managerId: null },
    );
  });

  it("5+ weeks without a session, school in → 'we're still here' with how to book", async () => {
    expect(await runMissedSessionChecks(NOW)).toEqual({ sent: 1 });
    const m = vi.mocked(sendEmail).mock.calls[0][0] as { subject: string; html: string };
    expect(m.subject).toBe("We're still here for Yusuf, Sarah");
    expect(m.html).toContain("book a casual session");
    expect(m.html).toContain("1300 200 262");
  });
  it("not before 5 weeks", async () => {
    prismaMock.child.findMany.mockResolvedValue([
      {
        id: "c1",
        firstName: "Yusuf",
        serviceId: "svc",
        enrolmentId: "e1",
        lastAttendedAt: new Date(NOW.getTime() - 20 * 86_400_000),
        ownaMatchChildId: "o1",
        missedCheckInSentAt: null,
        enrolment: { primaryParent: { email: "sarah@example.test", firstName: "Sarah" } },
      },
    ]);
    expect(await runMissedSessionChecks(NOW)).toEqual({ sent: 0 });
  });
});

describe("Quiet families", () => {
  it("lists who we checked in with and their answer; hides those already called", async () => {
    const sent = new Date("2026-11-18T00:00:00Z");
    prismaMock.child.findMany.mockResolvedValue([
      { id: "c1", firstName: "Yusuf", serviceId: "svc", enrolmentId: "e1", lastAttendedAt: new Date("2026-11-01T00:00:00Z"), missedCheckInSentAt: sent, missedCheckInReason: "stopping", quietFollowUpAt: null, enrolment: { primaryParent: { firstName: "Sarah", mobile: "0400" } } },
      { id: "c2", firstName: "Ali", serviceId: "svc", enrolmentId: "e2", lastAttendedAt: null, missedCheckInSentAt: sent, missedCheckInReason: "unwell", quietFollowUpAt: null, enrolment: { primaryParent: {} } },
      { id: "c3", firstName: "Zara", serviceId: "svc", enrolmentId: "e3", lastAttendedAt: null, missedCheckInSentAt: sent, missedCheckInReason: null, quietFollowUpAt: new Date("2026-11-19T00:00:00Z"), enrolment: { primaryParent: {} } },
    ]);
    const r = await quietFamilies(null, new Map([["svc", "MFIS Greenacre"]]), NOW);
    expect(r.map((q) => [q.childName, q.reason, q.callNeeded])).toEqual([
      ["Yusuf", "We're thinking of stopping", true],
      ["Ali", "They've been unwell", false],
    ]);
    expect(r[0]).toMatchObject({ parentName: "Sarah", phone: "0400", serviceName: "MFIS Greenacre", lastSeen: "2026-11-01" });
  });
});
