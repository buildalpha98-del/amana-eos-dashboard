import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  generateRequestId: () => "test-req-id",
}));

const sendCheckInEmail = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock("@/lib/new-starter-request/checkin-email", () => ({
  sendCheckInEmail,
}));

const guardComplete = vi.fn(async () => {});
const guardFail = vi.fn(async () => {});
vi.mock("@/lib/cron-guard", async () => {
  const actual = await vi.importActual<typeof import("@/lib/cron-guard")>("@/lib/cron-guard");
  return {
    ...actual,
    acquireCronLock: vi.fn(async () => ({ acquired: true, complete: guardComplete, fail: guardFail })),
  };
});

import { GET } from "@/app/api/cron/onboarding-checkins/route";

function authed() {
  return createRequest("GET", "/api/cron/onboarding-checkins", {
    headers: { authorization: "Bearer test-secret" },
  });
}

function checkIn(overrides: Partial<{
  id: string;
  milestone: string;
  dueAt: Date;
  sentAt: Date | null;
  active: boolean;
  token: string;
}> = {}) {
  return {
    id: overrides.id ?? "ci-1",
    milestone: overrides.milestone ?? "day_1",
    dueAt: overrides.dueAt ?? new Date("2026-01-01"),
    sentAt: overrides.sentAt ?? null,
    token: overrides.token ?? "tok-1",
    user: { id: "u-1", name: "Amina Yusuf", email: "amina@example.com", active: overrides.active ?? true },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "test-secret";
  prismaMock.newStarterCheckIn.update.mockResolvedValue({});
});

describe("GET /api/cron/onboarding-checkins", () => {
  it("returns 401 when CRON_SECRET is missing or wrong", async () => {
    const res = await GET(
      createRequest("GET", "/api/cron/onboarding-checkins", { headers: { authorization: "Bearer wrong" } }),
    );
    expect(res.status).toBe(401);
  });

  it("emails every due, unsent check-in and stamps sentAt", async () => {
    prismaMock.newStarterCheckIn.findMany.mockResolvedValue([checkIn({ id: "ci-1" }), checkIn({ id: "ci-2" })]);

    const res = await GET(authed());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sent).toBe(2);
    expect(sendCheckInEmail).toHaveBeenCalledTimes(2);
    expect(sendCheckInEmail).toHaveBeenCalledWith(
      expect.objectContaining({ email: "amina@example.com", milestone: "day_1", token: "tok-1" }),
    );
    expect(prismaMock.newStarterCheckIn.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "ci-1" }, data: expect.objectContaining({ sentAt: expect.any(Date) }) }),
    );
  });

  it("skips a deactivated new starter without emailing them", async () => {
    prismaMock.newStarterCheckIn.findMany.mockResolvedValue([checkIn({ id: "ci-1", active: false })]);

    const res = await GET(authed());
    expect(res.status).toBe(200);
    expect(sendCheckInEmail).not.toHaveBeenCalled();
    // Still marked sent so it isn't retried forever.
    expect(prismaMock.newStarterCheckIn.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "ci-1" } }),
    );
  });

  it("records a failed send without stopping the rest of the sweep", async () => {
    prismaMock.newStarterCheckIn.findMany.mockResolvedValue([checkIn({ id: "ci-1" }), checkIn({ id: "ci-2" })]);
    sendCheckInEmail.mockRejectedValueOnce(new Error("provider down"));

    const res = await GET(authed());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.sent).toBe(1);
    expect(body.errors).toHaveLength(1);
  });

  it("skips work entirely when nothing is due", async () => {
    prismaMock.newStarterCheckIn.findMany.mockResolvedValue([]);
    const res = await GET(authed());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.sent).toBe(0);
    expect(sendCheckInEmail).not.toHaveBeenCalled();
  });
});
