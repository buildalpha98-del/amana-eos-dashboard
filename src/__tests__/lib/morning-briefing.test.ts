import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

// Mock logger
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  generateRequestId: () => "test-req-id",
}));

const generateStructuredMock = vi.fn();
vi.mock("@/lib/ai-provider", () => ({
  generateStructured: (...args: unknown[]) => generateStructuredMock(...args),
}));

import {
  collectBriefingSignals,
  composeFallback,
  composeBriefing,
  totalSignalCount,
  type BriefingSignals,
} from "@/lib/morning-briefing";

const NOW = new Date("2026-07-06T20:00:00Z");

function emptySignals(): BriefingSignals {
  return {
    overdueTodos: [],
    offTrackRocks: [],
    openIssues: [],
    expiringCertsOnRoster: [],
    incompleteClockOuts: 0,
    staleEnquiries: 0,
    meetingsToday: [],
    forecastAlerts: [],
    knox: {
      minorYesterday: [],
      unacknowledgedAlerts: 0,
      openCards: 0,
      clocksDueWithin24h: [],
    },
  };
}

function resetPrisma() {
  vi.clearAllMocks();
  prismaMock.todo.findMany.mockResolvedValue([]);
  prismaMock.rock.findMany.mockResolvedValue([]);
  prismaMock.issue.findMany.mockResolvedValue([]);
  prismaMock.complianceCertificate.findMany.mockResolvedValue([]);
  prismaMock.rosterShift.findMany.mockResolvedValue([]);
  prismaMock.rosterShift.count.mockResolvedValue(0);
  prismaMock.parentEnquiry.count.mockResolvedValue(0);
  prismaMock.meeting.findMany.mockResolvedValue([]);
  prismaMock.triageAssessment.groupBy.mockResolvedValue([]);
  prismaMock.triageAssessment.count.mockResolvedValue(0);
  prismaMock.triageAssessment.findMany.mockResolvedValue([]);
  prismaMock.pendingAction.count.mockResolvedValue(0);
  prismaMock.service.findMany.mockResolvedValue([]);
}

describe("composeFallback", () => {
  it("renders all-clear for empty signals", () => {
    expect(composeFallback(emptySignals())).toContain("all clear");
  });

  it("renders one line per signal, most items bolded", () => {
    const out = composeFallback({
      ...emptySignals(),
      overdueTodos: [{ id: "t1", title: "Chase WWCC", dueDate: "2026-07-01" }],
      expiringCertsOnRoster: [
        { staffName: "Mirna", certType: "first_aid", expiresInDays: 3 },
      ],
      incompleteClockOuts: 2,
      staleEnquiries: 4,
      meetingsToday: [{ id: "m1", title: "Leadership L10", prepared: true }],
    });
    expect(out).toContain("**Leadership L10** is today — the AI agenda draft is ready");
    expect(out).toContain("**Mirna**'s first aid expires in 3 days");
    expect(out).toContain("2 shifts are missing a clock-out");
    expect(out).toContain("Chase WWCC");
    expect(out).toContain("4 active enquiries have had no movement");
  });
});

describe("composeFallback — knox", () => {
  it("renders one line per non-empty knox field", () => {
    const out = composeFallback({
      ...emptySignals(),
      knox: {
        minorYesterday: [
          { serviceName: "Arkana", count: 3 },
          { serviceName: "Greenacre", count: 1 },
        ],
        unacknowledgedAlerts: 2,
        openCards: 1,
        clocksDueWithin24h: [
          // 2026-10-21T03:30Z = 14:30 AEDT on 21 Oct (Sydney)
          { serviceName: "Arkana", kind: "parent_24h", dueAt: "2026-10-21T03:30:00.000Z" },
        ],
      },
    });
    expect(out).toContain("- Knox: **2** alerts awaiting acknowledgement.");
    expect(out).toContain("- Knox: **1** proposed change waiting for approval.");
    expect(out).toContain("- Knox: **Arkana** Parent notice due 14:30 21 Oct (Sydney).");
    expect(out).toContain("- Knox: 3 minor incidents at **Arkana** yesterday.");
    expect(out).toContain("- Knox: 1 minor incident at **Greenacre** yesterday.");
  });

  it("uses singular wording for one alert and omits empty knox fields", () => {
    const out = composeFallback({
      ...emptySignals(),
      knox: { ...emptySignals().knox, unacknowledgedAlerts: 1 },
    });
    expect(out).toContain("- Knox: **1** alert awaiting acknowledgement.");
    expect(out).not.toContain("proposed change");
    expect(out).not.toContain("minor incident");
  });

  it("does not render the all-clear line when only minors exist", () => {
    const out = composeFallback({
      ...emptySignals(),
      knox: { ...emptySignals().knox, minorYesterday: [{ serviceName: "Arkana", count: 2 }] },
    });
    expect(out).not.toContain("all clear");
  });
});

describe("totalSignalCount", () => {
  it("adds knox alerts + cards + clocks but ignores minorYesterday", () => {
    const s = {
      ...emptySignals(),
      knox: {
        minorYesterday: [{ serviceName: "Arkana", count: 9 }],
        unacknowledgedAlerts: 2,
        openCards: 3,
        clocksDueWithin24h: [
          { serviceName: "Arkana", kind: "regulator" as const, dueAt: "2026-07-07T01:00:00.000Z" },
        ],
      },
    };
    expect(totalSignalCount(s)).toBe(6);
  });

  it("counts scalar signals as one each and lists by length", () => {
    const s = {
      ...emptySignals(),
      overdueTodos: [
        { id: "1", title: "a", dueDate: "2026-07-01" },
        { id: "2", title: "b", dueDate: "2026-07-01" },
      ],
      incompleteClockOuts: 9,
      staleEnquiries: 0,
    };
    expect(totalSignalCount(s)).toBe(3);
  });
});

describe("collectBriefingSignals", () => {
  beforeEach(resetPrisma);

  it("skips compliance + enquiry queries for roles without access", async () => {
    // eos roles never reach the collector (BRIEFING_ROLES), but member
    // without a serviceId still gets org queries scoped correctly; a
    // marketing user gets enquiries but no compliance sweep.
    await collectBriefingSignals(
      { id: "u-1", role: "marketing", serviceId: null },
      NOW,
    );
    expect(prismaMock.complianceCertificate.findMany).not.toHaveBeenCalled();
    expect(prismaMock.parentEnquiry.count).toHaveBeenCalled();
  });

  it("only reports expiring certs for staff actually rostered", async () => {
    prismaMock.complianceCertificate.findMany.mockResolvedValue([
      {
        type: "wwcc",
        expiryDate: new Date("2026-07-09"),
        userId: "staff-rostered",
        user: { name: "Rostered Rana" },
      },
      {
        type: "first_aid",
        expiryDate: new Date("2026-07-09"),
        userId: "staff-off",
        user: { name: "Off Omar" },
      },
    ]);
    prismaMock.rosterShift.findMany.mockResolvedValue([
      { userId: "staff-rostered" },
    ]);

    const signals = await collectBriefingSignals(
      { id: "admin-1", role: "admin", serviceId: null },
      NOW,
    );
    expect(signals.expiringCertsOnRoster).toHaveLength(1);
    expect(signals.expiringCertsOnRoster[0].staffName).toBe("Rostered Rana");
  });

  it("scopes member queries to their service", async () => {
    await collectBriefingSignals(
      { id: "member-1", role: "member", serviceId: "svc-9" },
      NOW,
    );
    const certCall = prismaMock.complianceCertificate.findMany.mock.calls[0][0];
    expect(certCall.where.serviceId).toBe("svc-9");
    const clockCall = prismaMock.rosterShift.count.mock.calls[0][0];
    expect(clockCall.where.serviceId).toBe("svc-9");
    // member is not admin-tier/marketing → no org-wide enquiry sweep
    expect(prismaMock.parentEnquiry.count).not.toHaveBeenCalled();
  });

  it("marks today's meetings as prepared when a draft exists", async () => {
    prismaMock.meeting.findMany.mockResolvedValue([
      { id: "m1", title: "L10", aiAgendaDraft: { summary: "x" } },
      { id: "m2", title: "Check-in", aiAgendaDraft: null },
    ]);
    const signals = await collectBriefingSignals(
      { id: "u-1", role: "owner", serviceId: null },
      NOW,
    );
    expect(signals.meetingsToday).toEqual([
      { id: "m1", title: "L10", prepared: true },
      { id: "m2", title: "Check-in", prepared: false },
    ]);
  });
});

describe("collectBriefingSignals — knox", () => {
  beforeEach(resetPrisma);

  const DAY = 24 * 60 * 60 * 1000;

  function route(opts: {
    groups?: Array<{ serviceId: string; _count: { _all: number } }>;
    recent?: unknown[];
  }) {
    prismaMock.triageAssessment.groupBy.mockImplementation(async () => opts.groups ?? []);
    prismaMock.triageAssessment.findMany.mockImplementation(async () => opts.recent ?? []);
    prismaMock.service.findMany.mockImplementation(
      async (args: { where: { id: { in: string[] } } }) =>
        args.where.id.in.map((id) => ({ id, name: `Name ${id}` })),
    );
    prismaMock.triageAssessment.count.mockImplementation(async () => 4);
    prismaMock.pendingAction.count.mockImplementation(async () => 2);
  }

  it("collects minors (desc, names resolved), alerts and cards", async () => {
    route({
      groups: [
        { serviceId: "s1", _count: { _all: 1 } },
        { serviceId: "s2", _count: { _all: 5 } },
        { serviceId: "s3", _count: { _all: 0 } },
      ],
    });
    const signals = await collectBriefingSignals(
      { id: "admin-1", role: "admin", serviceId: null },
      NOW,
    );
    expect(signals.knox.minorYesterday).toEqual([
      { serviceName: "Name s2", count: 5 },
      { serviceName: "Name s1", count: 1 },
    ]);
    expect(signals.knox.unacknowledgedAlerts).toBe(4);
    expect(signals.knox.openCards).toBe(2);

    const groupCall = prismaMock.triageAssessment.groupBy.mock.calls[0][0];
    expect(groupCall.where.tier).toBe("minor");
    expect(groupCall.where.createdAt).toEqual({
      gte: new Date(NOW.getTime() - DAY),
      lt: NOW,
    });
    expect(groupCall.where.serviceId).toBeUndefined();
    const alertCall = prismaMock.triageAssessment.count.mock.calls[0][0];
    expect(alertCall.where).toMatchObject({
      alerted: true,
      createdAt: { gte: new Date(NOW.getTime() - 7 * DAY) },
      alerts: { none: { acknowledgedAt: { not: null } } },
    });
    const cardCall = prismaMock.pendingAction.count.mock.calls[0][0];
    expect(cardCall.where).toMatchObject({
      committedAt: null,
      dismissedAt: null,
      expiresAt: { gt: NOW },
    });
  });

  it("uses only the latest assessment per subject and only live clocks in the next 24h", async () => {
    const inHours = (h: number) => new Date(NOW.getTime() + h * 3600_000).toISOString();
    route({
      recent: [
        // latest for incident:i1 — one due soon, one overdue, one too far out
        {
          subjectType: "incident",
          subjectId: "i1",
          createdAt: new Date(NOW.getTime() - 3600_000),
          service: { name: "Arkana" },
          clocks: [
            { kind: "parent_24h", dueAt: inHours(5), basis: "Reg 86", overdue: false },
            { kind: "regulator", dueAt: inHours(-2), basis: "Reg 175", overdue: true },
            { kind: "regulator", dueAt: inHours(30), basis: "Reg 175", overdue: false },
          ],
        },
        // OLDER assessment for same subject — must be ignored
        {
          subjectType: "incident",
          subjectId: "i1",
          createdAt: new Date(NOW.getTime() - 7200_000),
          service: { name: "Arkana" },
          clocks: [{ kind: "parent_24h", dueAt: inHours(1), basis: "Reg 86", overdue: false }],
        },
        // another subject, malformed clocks blob
        {
          subjectType: "complaint",
          subjectId: "c1",
          createdAt: new Date(NOW.getTime() - 3600_000),
          service: { name: "Greenacre" },
          clocks: "not-an-array",
        },
        // another subject with a valid soon clock
        {
          subjectType: "complaint",
          subjectId: "c2",
          createdAt: new Date(NOW.getTime() - 3600_000),
          service: { name: "Greenacre" },
          clocks: [
            { kind: "complaint_regulator", dueAt: inHours(2), basis: "x", overdue: false },
            { kind: "bogus", dueAt: inHours(1), basis: "x", overdue: false },
            { kind: "regulator", dueAt: "garbage", basis: "x", overdue: false },
          ],
        },
      ],
    });
    const signals = await collectBriefingSignals(
      { id: "owner-1", role: "owner", serviceId: null },
      NOW,
    );
    expect(signals.knox.clocksDueWithin24h).toEqual([
      { serviceName: "Greenacre", kind: "complaint_regulator", dueAt: inHours(2) },
      { serviceName: "Arkana", kind: "parent_24h", dueAt: inHours(5) },
    ]);
    const findCall = prismaMock.triageAssessment.findMany.mock.calls[0][0];
    expect(findCall.where.createdAt).toEqual({ gte: new Date(NOW.getTime() - 7 * DAY) });
    expect(findCall.orderBy).toEqual({ createdAt: "desc" });
  });

  it("caps clocks at the 10 soonest", async () => {
    const clocks = Array.from({ length: 14 }, (_, i) => ({
      kind: "regulator",
      dueAt: new Date(NOW.getTime() + (i + 1) * 3600_000).toISOString(),
      basis: "x",
      overdue: false,
    }));
    route({
      recent: [
        {
          subjectType: "incident",
          subjectId: "i1",
          createdAt: NOW,
          service: { name: "Arkana" },
          clocks,
        },
      ],
    });
    const signals = await collectBriefingSignals(
      { id: "owner-1", role: "owner", serviceId: null },
      NOW,
    );
    expect(signals.knox.clocksDueWithin24h).toHaveLength(10);
    expect(signals.knox.clocksDueWithin24h[0].dueAt).toBe(clocks[0].dueAt);
  });

  it("scopes member knox queries to their service", async () => {
    route({});
    await collectBriefingSignals(
      { id: "member-1", role: "member", serviceId: "svc-9" },
      NOW,
    );
    expect(prismaMock.triageAssessment.groupBy.mock.calls[0][0].where.serviceId).toBe("svc-9");
    expect(prismaMock.triageAssessment.count.mock.calls[0][0].where.serviceId).toBe("svc-9");
    expect(prismaMock.triageAssessment.findMany.mock.calls[0][0].where.serviceId).toBe("svc-9");
    expect(prismaMock.pendingAction.count.mock.calls[0][0].where.serviceId).toBe("svc-9");
  });

  it("returns the empty knox signal and runs no knox queries for marketing", async () => {
    route({});
    const signals = await collectBriefingSignals(
      { id: "u-1", role: "marketing", serviceId: null },
      NOW,
    );
    expect(signals.knox).toEqual({
      minorYesterday: [],
      unacknowledgedAlerts: 0,
      openCards: 0,
      clocksDueWithin24h: [],
    });
    expect(prismaMock.triageAssessment.groupBy).not.toHaveBeenCalled();
    expect(prismaMock.triageAssessment.count).not.toHaveBeenCalled();
    expect(prismaMock.pendingAction.count).not.toHaveBeenCalled();
  });

  it("returns the empty knox signal for a member with no service", async () => {
    route({});
    const signals = await collectBriefingSignals(
      { id: "m-1", role: "member", serviceId: null },
      NOW,
    );
    expect(signals.knox.unacknowledgedAlerts).toBe(0);
    expect(prismaMock.triageAssessment.count).not.toHaveBeenCalled();
  });
});

describe("composeBriefing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns fallback without calling AI when there are no signals", async () => {
    const out = await composeBriefing("Jayden", "owner", emptySignals());
    expect(out.source).toBe("fallback");
    expect(generateStructuredMock).not.toHaveBeenCalled();
  });

  it("returns AI prose when the provider succeeds", async () => {
    generateStructuredMock.mockResolvedValue({
      data: { brief: "One thing matters today." },
    });
    const out = await composeBriefing("Jayden", "owner", {
      ...emptySignals(),
      staleEnquiries: 3,
    });
    expect(out).toEqual({ content: "One thing matters today.", source: "ai" });
  });

  it("falls back to deterministic markdown when the provider throws", async () => {
    generateStructuredMock.mockRejectedValue(new Error("model down"));
    const out = await composeBriefing("Jayden", "owner", {
      ...emptySignals(),
      staleEnquiries: 3,
    });
    expect(out.source).toBe("fallback");
    expect(out.content).toContain("3 active enquiries");
  });
});
