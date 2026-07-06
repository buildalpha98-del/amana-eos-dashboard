import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withRequestId: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
  generateRequestId: () => "test-req-id",
}));

const collectMock = vi.fn();
const composeMock = vi.fn();
vi.mock("@/lib/morning-briefing", async () => {
  const actual = await vi.importActual<typeof import("@/lib/morning-briefing")>(
    "@/lib/morning-briefing",
  );
  return {
    ...actual,
    collectBriefingSignals: (...args: unknown[]) => collectMock(...args),
    composeBriefing: (...args: unknown[]) => composeMock(...args),
  };
});

const prepareMock = vi.fn();
vi.mock("@/lib/l10-prep", () => ({
  prepareMeetingAgenda: (...args: unknown[]) => prepareMock(...args),
}));

import { GET } from "@/app/api/cron/morning-briefing/route";
import type { BriefingSignals } from "@/lib/morning-briefing";

const CRON_SECRET = "test-cron-secret";

function cronRequest(secret: string | null = CRON_SECRET) {
  return createRequest("GET", "/api/cron/morning-briefing", {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

function signals(overrides: Partial<BriefingSignals> = {}): BriefingSignals {
  return {
    overdueTodos: [],
    offTrackRocks: [],
    openIssues: [],
    expiringCertsOnRoster: [],
    incompleteClockOuts: 0,
    staleEnquiries: 0,
    meetingsToday: [],
    forecastAlerts: [],
    ...overrides,
  };
}

function resetCommon() {
  vi.clearAllMocks();
  process.env.CRON_SECRET = CRON_SECRET;
  // Cron lock: no existing run → acquire fresh.
  prismaMock.cronRun.findUnique.mockResolvedValue(null);
  prismaMock.cronRun.create.mockResolvedValue({ id: "run-1" });
  prismaMock.cronRun.update.mockResolvedValue({});
  prismaMock.meeting.findMany.mockResolvedValue([]);
  prismaMock.user.findMany.mockResolvedValue([]);
  prismaMock.dailyBriefing.findUnique.mockResolvedValue(null);
  prismaMock.dailyBriefing.create.mockResolvedValue({ id: "brief-1" });
  prismaMock.userNotification.create.mockResolvedValue({});
  composeMock.mockResolvedValue({ content: "brief text", source: "ai" });
  collectMock.mockResolvedValue(signals());
}

describe("GET /api/cron/morning-briefing", () => {
  beforeEach(resetCommon);

  it("returns 401 without the cron secret", async () => {
    const res = await GET(cronRequest(null));
    expect(res.status).toBe(401);
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
  });

  it("skips when the daily lock is already completed", async () => {
    prismaMock.cronRun.findUnique.mockResolvedValue({
      id: "run-0",
      status: "completed",
      startedAt: new Date(),
    });
    const res = await GET(cronRequest());
    const body = await res.json();
    expect(body.skipped).toBe(true);
  });

  it("creates a briefing per user and notifies only when signals exist", async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: "u-busy", name: "Busy", role: "admin", serviceId: null },
      { id: "u-quiet", name: "Quiet", role: "member", serviceId: "svc-1" },
    ]);
    collectMock.mockImplementation((user: { id: string }) =>
      Promise.resolve(
        user.id === "u-busy" ? signals({ staleEnquiries: 3 }) : signals(),
      ),
    );

    const res = await GET(cronRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toBe(2);
    expect(body.quiet).toBe(1);
    // Only the busy user gets pinged.
    expect(prismaMock.userNotification.create).toHaveBeenCalledTimes(1);
    expect(
      prismaMock.userNotification.create.mock.calls[0][0].data.userId,
    ).toBe("u-busy");
  });

  it("is idempotent — users with an existing brief today are skipped", async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: "u-1", name: "A", role: "owner", serviceId: null },
    ]);
    prismaMock.dailyBriefing.findUnique.mockResolvedValue({ id: "existing" });

    const res = await GET(cronRequest());
    const body = await res.json();
    expect(body.created).toBe(0);
    expect(body.skippedExisting).toBe(1);
    expect(prismaMock.dailyBriefing.create).not.toHaveBeenCalled();
  });

  it("isolates per-user failures and keeps going", async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: "u-fail", name: "F", role: "admin", serviceId: null },
      { id: "u-ok", name: "O", role: "admin", serviceId: null },
    ]);
    collectMock.mockImplementation((user: { id: string }) =>
      user.id === "u-fail"
        ? Promise.reject(new Error("db blip"))
        : Promise.resolve(signals()),
    );

    const res = await GET(cronRequest());
    const body = await res.json();
    expect(body.created).toBe(1);
    expect(body.errors).toBe(1);
  });

  it("prepares agenda drafts for today's unprepared meetings", async () => {
    prismaMock.meeting.findMany.mockResolvedValue([{ id: "m-1" }, { id: "m-2" }]);
    prepareMock.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("ai down"));

    const res = await GET(cronRequest());
    const body = await res.json();
    // One prepared, one failed — the failure never kills the run.
    expect(body.agendasPrepared).toBe(1);
    expect(prepareMock).toHaveBeenCalledTimes(2);
  });
});
