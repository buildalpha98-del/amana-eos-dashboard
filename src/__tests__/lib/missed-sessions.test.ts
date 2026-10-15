/**
 * "We've missed Yusuf" — and every reason it must NOT send.
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

import { sendEmail } from "@/lib/email";
import { notifyUsers } from "@/lib/notify-user";
import {
  gapInsideTerm,
  missedCheckToken,
  recordMissedReason,
  runMissedSessionChecks,
  verifyMissedCheckToken,
} from "@/lib/missed-sessions";

// Term 4 2026 (NSW table): 13 Oct – 18 Dec. With the 10-day buffer: 23 Oct – 8 Dec.
const NOW = new Date("2026-11-20T00:00:00Z");
const LAST = new Date("2026-11-04T00:00:00Z"); // 16 days ago, mid-term

const kid = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  firstName: "Yusuf",
  serviceId: "svc",
  enrolmentId: "e1",
  lastAttendedAt: LAST,
  ownaMatchChildId: "o1",
  missedCheckInSentAt: null,
  enrolment: { primaryParent: { email: "sarah@example.test", firstName: "Sarah" } },
  ...over,
});
/** Attendance recorded on every weekday between LAST and NOW — the sync ran. */
const fullCoverage = () => {
  const rows = [];
  for (let t = LAST.getTime() + 86_400_000; t < NOW.getTime(); t += 86_400_000) {
    const d = new Date(t);
    if (d.getUTCDay() >= 1 && d.getUTCDay() <= 5) rows.push({ date: d });
  }
  return rows;
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXTAUTH_SECRET = "test-secret";
  prismaMock.child.findMany.mockResolvedValue([kid()]);
  prismaMock.child.findUnique.mockResolvedValue({ status: "active", bookingPrefs: { tuesday: true, thursday: true } });
  prismaMock.child.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.dailyAttendance.findMany.mockResolvedValue(fullCoverage());
  prismaMock.programActivity.findMany.mockResolvedValue([]);
  prismaMock.user.findMany.mockResolvedValue([{ id: "coord" }]);
  prismaMock.service.findUnique.mockImplementation(async (a: { select: Record<string, boolean> }) =>
    "ownaSyncedAt" in a.select
      ? { ownaServiceId: "o", ownaSyncedAt: new Date(NOW.getTime() - 3_600_000) }
      : { name: "Amana OSHC MFIS Greenacre", code: "MFIS-GA", phone: "0494 379 929", email: "c@amanaoshc.com.au", sessionTimes: null, content: {}, managerId: null },
  );
});

describe("when it sends", () => {
  it("a regular, 14+ days in term, complete data → one gentle email + a heads-up to the centre", async () => {
    expect(await runMissedSessionChecks(NOW)).toEqual({ sent: 1 });
    const m = vi.mocked(sendEmail).mock.calls[0][0] as { subject: string; html: string };
    expect(m.subject).toBe("We've missed Yusuf at MFIS Greenacre");
    expect(m.html).toContain("no need to reply");
    expect(m.html).toContain(`/api/public/check-in?c=c1&amp;r=unwell&amp;t=${missedCheckToken("c1")}`);
    expect(vi.mocked(notifyUsers).mock.calls[0][2].title).toBe("We've checked in with Yusuf's family");
  });
});

describe("when it must NOT send", () => {
  it("casual families (no regular days in OWNA)", async () => {
    prismaMock.child.findUnique.mockResolvedValue({ status: "active", bookingPrefs: { monday: false } });
    expect(await runMissedSessionChecks(NOW)).toEqual({ sent: 0 });
  });
  it("children no longer enrolled in OWNA", async () => {
    prismaMock.child.findUnique.mockResolvedValue({ status: "withdrawn", bookingPrefs: { tuesday: true } });
    expect(await runMissedSessionChecks(NOW)).toEqual({ sent: 0 });
  });
  it("when the sync missed days (an outage isn't an absence)", async () => {
    prismaMock.dailyAttendance.findMany.mockResolvedValue(fullCoverage().slice(0, 5));
    expect(await runMissedSessionChecks(NOW)).toEqual({ sent: 0 });
  });
  it("when we've already asked about this gap", async () => {
    prismaMock.child.findMany.mockResolvedValue([kid({ missedCheckInSentAt: new Date("2026-11-19T00:00:00Z") })]);
    expect(await runMissedSessionChecks(NOW)).toEqual({ sent: 0 });
  });
  it("siblings: one email per family", async () => {
    prismaMock.child.findMany.mockResolvedValue([kid(), kid({ id: "c2", firstName: "Maryam" })]);
    expect(await runMissedSessionChecks(NOW)).toEqual({ sent: 1 });
  });
  it("across or near the holidays", () => {
    expect(gapInsideTerm(LAST, NOW)).toBe(true);
    expect(gapInsideTerm(new Date("2026-09-20T00:00:00Z"), new Date("2026-10-28T00:00:00Z"))).toBe(false); // spans the break
    expect(gapInsideTerm(new Date("2026-10-15T00:00:00Z"), new Date("2026-10-30T00:00:00Z"))).toBe(false); // first days of term
    expect(gapInsideTerm(new Date("2026-11-25T00:00:00Z"), new Date("2026-12-12T00:00:00Z"))).toBe(false); // end of term
  });
});

describe("answers", () => {
  beforeEach(() => {
    prismaMock.child.findUnique.mockResolvedValue({ id: "c1", firstName: "Yusuf", serviceId: "svc", enrolmentId: "e1", missedCheckInReason: null });
    prismaMock.child.update.mockResolvedValue({});
    prismaMock.service.findUnique.mockResolvedValue({ managerId: null, email: "c@amanaoshc.com.au" });
  });
  it("only a correctly signed link counts", () => {
    expect(verifyMissedCheckToken("c1", missedCheckToken("c1"))).toBe(true);
    expect(verifyMissedCheckToken("c1", missedCheckToken("c2"))).toBe(false);
  });
  it("\"unwell\" is a quiet note to the centre — no email, no head office", async () => {
    await recordMissedReason("c1", "unwell");
    expect(vi.mocked(notifyUsers)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled();
  });
  it("\"thinking of stopping\" reaches head office and the centre's inbox", async () => {
    prismaMock.user.findMany.mockImplementation(async (a: { where: Record<string, unknown> }) =>
      a.where.role === "head_office" ? [{ email: "ho@amanaoshc.com.au" }] : [{ id: "coord" }, { id: "ho" }],
    );
    await recordMissedReason("c1", "stopping");
    expect(prismaMock.user.findMany.mock.calls[0][0].where.OR).toContainEqual({ role: "head_office" });
    expect(vi.mocked(sendEmail).mock.calls.map((c) => (c[0] as { to: string }).to).sort()).toEqual(["c@amanaoshc.com.au", "ho@amanaoshc.com.au"]);
  });
});
