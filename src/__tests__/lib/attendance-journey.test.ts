/**
 * Stage 3: parent emails based on real attendance.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(async () => ({ sent: ["x"], suppressed: [] })) }));
vi.mock("@/lib/notify-user", () => ({ notifyUsers: vi.fn(async () => 1) }));
vi.mock("@/lib/parent-journey", () => ({ syncParentJourney: vi.fn(async () => undefined) }));
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
import { notifyUsers } from "@/lib/notify-user";
import { syncParentJourney } from "@/lib/parent-journey";
import {
  attendanceGate,
  recordNoShowReason,
  recordOwnaAttendance,
  runExtraDayOffers,
  runNoShowChecks,
  startCheckToken,
  verifyStartCheckToken,
} from "@/lib/attendance-journey";
import type { OwnaAttendanceRecord } from "@/lib/owna";

const NOW = new Date("2026-10-16T00:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
const rec = (childId: string, date = "2026-10-15", attending = true) =>
  ({ childId, attendanceDate: date, attending, signIn: attending ? "15:10" : "" }) as OwnaAttendanceRecord;
const liveService = { ownaServiceId: "owna-1", ownaSyncedAt: daysAgo(0.5) };
const centreRow = { name: "Amana OSHC MFIS Greenacre", code: "MFIS-GA", phone: "0494 379 929", email: "c@amanaoshc.com.au", sessionTimes: null, content: {}, managerId: null };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXTAUTH_SECRET = "test-secret";
  prismaMock.programActivity.findMany.mockResolvedValue([]);
  prismaMock.user.findMany.mockResolvedValue([{ id: "coord" }]);
});

describe("matching OWNA sign-ins to enrolled children", () => {
  beforeEach(() => {
    prismaMock.child.findMany.mockImplementation(async (args: { where: Record<string, unknown> }) =>
      "ownaChildId" in args.where && args.where.ownaChildId && typeof args.where.ownaChildId === "object" && "in" in (args.where.ownaChildId as object)
        ? [
            { ownaChildId: "o1", firstName: "Yusuf", surname: "Khan", dob: new Date("2019-03-04T13:00:00Z") },
            { ownaChildId: "o2", firstName: "Adam", surname: "Ali", dob: new Date("2018-01-01") },
          ]
        : [
            { id: "c1", enrolmentId: "e1", firstName: "yusuf", surname: "KHAN", dob: new Date("2019-03-05T00:00:00Z"), firstAttendedAt: null, lastAttendedAt: null },
            { id: "c2", enrolmentId: "e2", firstName: "Adam", surname: "Ali", dob: new Date("2017-06-06"), firstAttendedAt: null, lastAttendedAt: null },
          ],
    );
    prismaMock.child.update.mockResolvedValue({});
    prismaMock.enrolmentSubmission.findUnique.mockResolvedValue({
      serviceId: "svc",
      primaryParent: { email: "sarah@example.test", firstName: "Sarah" },
      childRecords: [{ firstName: "Yusuf", firstAttendedAt: null }],
    });
  });

  it("matches on name + date of birth (a day's timezone slack), and re-times the first-session emails", async () => {
    expect(await recordOwnaAttendance("svc", [rec("o1"), rec("o2")])).toBe(1); // Adam's DOB differs → no match
    expect(prismaMock.child.update.mock.calls[0][0]).toEqual({
      where: { id: "c1" },
      data: { ownaMatchChildId: "o1", firstAttendedAt: new Date("2026-10-15T00:00:00Z"), lastAttendedAt: new Date("2026-10-15T00:00:00Z") },
    });
    expect(vi.mocked(syncParentJourney)).toHaveBeenCalledWith(
      expect.objectContaining({ stage: "first_session", firstSessionDate: new Date("2026-10-15T00:00:00Z") }),
    );
  });

  it("ignores absences", async () => {
    expect(await recordOwnaAttendance("svc", [rec("o1", "2026-10-15", false)])).toBe(0);
  });
});

describe("\"How did day one go?\" waits for real attendance", () => {
  it("sends as before where OWNA attendance isn't live", async () => {
    prismaMock.service.findUnique.mockResolvedValue({ ownaServiceId: null, ownaSyncedAt: null });
    expect(await attendanceGate("day1_checkin", "a@b.c", "svc", daysAgo(1), NOW)).toBe("send");
  });
  it("holds until they've attended, then sends; gives up after two weeks", async () => {
    prismaMock.service.findUnique.mockResolvedValue(liveService);
    prismaMock.child.findMany.mockResolvedValue([]);
    expect(await attendanceGate("day1_checkin", "a@b.c", "svc", daysAgo(1), NOW)).toBe("hold");
    expect(await attendanceGate("day1_checkin", "a@b.c", "svc", daysAgo(15), NOW)).toBe("cancel");
    prismaMock.child.findMany.mockResolvedValue([{ enrolment: { primaryParent: { email: "A@B.c" }, secondaryParent: null } }]);
    expect(await attendanceGate("day1_checkin", "a@b.c", "svc", daysAgo(1), NOW)).toBe("send");
  });
  it("never touches other emails", async () => {
    expect(await attendanceGate("session_reminder", "a@b.c", "svc", daysAgo(1), NOW)).toBe("send");
    expect(prismaMock.service.findUnique).not.toHaveBeenCalled();
  });
});

describe("Is anything stopping you?", () => {
  it("goes to families approved 14+ days with no attendance, once, with signed one-tap answers", async () => {
    prismaMock.enrolmentSubmission.findMany.mockResolvedValue([
      { id: "e1", serviceId: "svc", primaryParent: { email: "sarah@example.test", firstName: "Sarah" }, childRecords: [{ firstName: "Yusuf", firstAttendedAt: null }] },
      { id: "e2", serviceId: "svc", primaryParent: { email: "x@example.test" }, childRecords: [{ firstName: "Ali", firstAttendedAt: daysAgo(3) }] },
    ]);
    prismaMock.service.findUnique.mockImplementation(async (a: { select: Record<string, boolean> }) => ("ownaSyncedAt" in a.select ? liveService : centreRow));
    prismaMock.enrolmentSubmission.updateMany.mockResolvedValue({ count: 1 });
    expect(await runNoShowChecks(NOW)).toEqual({ sent: 1 });
    const m = vi.mocked(sendEmail).mock.calls[0][0] as { to: string; subject: string; html: string };
    expect(m.subject).toBe("Is anything stopping Yusuf starting, Sarah?");
    expect(m.html).toContain(`/api/public/start-check?e=e1&amp;r=owna_trouble&amp;t=${startCheckToken("e1")}`);
  });

  it("is skipped where OWNA attendance isn't live (they might well be coming)", async () => {
    prismaMock.enrolmentSubmission.findMany.mockResolvedValue([
      { id: "e1", serviceId: "svc", primaryParent: { email: "s@x.test" }, childRecords: [{ firstName: "Yusuf", firstAttendedAt: null }] },
    ]);
    prismaMock.service.findUnique.mockResolvedValue({ ownaServiceId: "o", ownaSyncedAt: daysAgo(5) });
    expect(await runNoShowChecks(NOW)).toEqual({ sent: 0 });
  });

  it("an answer reaches the centre; a forged link doesn't verify", async () => {
    expect(verifyStartCheckToken("e1", startCheckToken("e1"))).toBe(true);
    expect(verifyStartCheckToken("e1", startCheckToken("e2"))).toBe(false);
    prismaMock.enrolmentSubmission.findUnique.mockResolvedValue({ id: "e1", serviceId: "svc", children: [{ firstName: "Yusuf" }], noShowReason: null });
    prismaMock.enrolmentSubmission.update.mockResolvedValue({});
    prismaMock.service.findUnique.mockResolvedValue({ managerId: null, email: "c@amanaoshc.com.au" });
    await recordNoShowReason("e1", "owna_trouble");
    expect(vi.mocked(notifyUsers).mock.calls[0][2].title).toBe(`Yusuf's family: "We're having trouble with OWNA"`);
  });
});

describe("week-3 extra day", () => {
  it("honours unsubscribe and carries the family's own unsubscribe link", async () => {
    prismaMock.enrolmentSubmission.findMany.mockResolvedValue([
      { id: "e1", serviceId: "svc", primaryParent: { email: "sarah@example.test", firstName: "Sarah" }, childRecords: [{ firstName: "Yusuf", status: "active" }] },
      { id: "e2", serviceId: "svc", primaryParent: { email: "gone@example.test" }, childRecords: [{ firstName: "Ali", status: "active" }] },
    ]);
    prismaMock.centreContact.findFirst.mockImplementation(async (a: { where: { email: { equals: string } } }) =>
      a.where.email.equals.startsWith("gone") ? { id: "ct2", subscribed: false } : { id: "ct1", subscribed: true },
    );
    prismaMock.enrolmentSubmission.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.service.findUnique.mockResolvedValue(centreRow);
    expect(await runExtraDayOffers(NOW)).toEqual({ sent: 1 });
    const m = vi.mocked(sendEmail).mock.calls[0][0] as { html: string; subject: string };
    expect(m.subject).toBe("Yusuf is settling in beautifully — fancy an extra day?");
    expect(m.html).toContain("/notifications/preferences/ct1");
    expect(m.html).not.toContain("{{UNSUBSCRIBE_URL}}");
  });
});
