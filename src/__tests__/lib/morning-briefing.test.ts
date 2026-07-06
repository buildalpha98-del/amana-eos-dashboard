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

describe("totalSignalCount", () => {
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
