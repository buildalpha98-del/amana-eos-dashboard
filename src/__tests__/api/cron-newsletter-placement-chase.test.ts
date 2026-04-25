import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  generateRequestId: () => "test-req-id",
}));

const guardComplete = vi.fn(async () => {});
const guardFail = vi.fn(async () => {});
vi.mock("@/lib/cron-guard", async () => {
  const actual = await vi.importActual<typeof import("@/lib/cron-guard")>("@/lib/cron-guard");
  return {
    ...actual,
    acquireCronLock: vi.fn(async () => ({
      acquired: true,
      complete: guardComplete,
      fail: guardFail,
    })),
  };
});

import { GET } from "@/app/api/cron/newsletter-placement-chase/route";
import { acquireCronLock } from "@/lib/cron-guard";

function authed() {
  return createRequest("GET", "/api/cron/newsletter-placement-chase", {
    headers: { authorization: "Bearer test-secret" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "test-secret";

  prismaMock.user.findFirst.mockResolvedValue({ id: "akram-1" });
  prismaMock.service.findMany.mockResolvedValue([
    { id: "s1", name: "Centre A", state: "NSW", code: "AAA" },
    { id: "s2", name: "Centre B", state: "VIC", code: "BBB" },
  ]);
  prismaMock.centreAvatar.findMany.mockResolvedValue([
    {
      serviceId: "s1",
      snapshot: {
        centreDetails: { schoolName: "Anywhere Public" },
        schoolContacts: { newsletterEditor: { name: "Jane", email: "jane@anywhere.edu.au" } },
        programmeFocus: "literacy",
      },
      parentAvatar: { psychographics: { primaryWant: "homework support" } },
      programmeMix: { whatsWorking: "Quran club" },
    },
  ]);
  prismaMock.schoolComm.findMany.mockResolvedValue([]);
  prismaMock.aiTaskDraft.findFirst.mockResolvedValue(null);
  prismaMock.aiTaskDraft.create.mockResolvedValue({ id: "draft-1" });
});

afterAll(() => {
  vi.useRealTimers();
});

describe("GET /api/cron/newsletter-placement-chase", () => {
  it("401 when CRON_SECRET wrong", async () => {
    vi.setSystemTime(new Date("2026-06-29T22:00:00Z")); // last week of T2
    const res = await GET(
      createRequest("GET", "/api/cron/newsletter-placement-chase", {
        headers: { authorization: "Bearer wrong" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("skips silently outside chase weeks", async () => {
    vi.setSystemTime(new Date("2026-05-12T09:00:00Z")); // mid-Term 2
    const res = await GET(authed());
    const data = await res.json();
    expect(data.skipped).toBe(true);
    expect(data.reason).toBe("not_chase_week");
    expect(prismaMock.aiTaskDraft.create).not.toHaveBeenCalled();
  });

  it("creates a bundled draft when in last 1-2 weeks of term", async () => {
    vi.setSystemTime(new Date("2026-06-29T22:00:00Z")); // ≈4 days before T2 ends → week 1
    const res = await GET(authed());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.draftId).toBe("draft-1");
    expect(data.toEmail).toBe(2);

    const callArg = prismaMock.aiTaskDraft.create.mock.calls[0][0];
    expect(callArg.data.source).toBe("newsletter-chase");
    expect(callArg.data.targetId).toMatch(/2026-T2-W\d/);
    expect(callArg.data.content).toContain("Centre A");
    expect(callArg.data.content).toContain("Centre B");
    expect(callArg.data.content).toContain("Term 3");
    expect(callArg.data.content).toContain("Jane");
  });

  it("skips centres with existing next-term newsletter SchoolComm", async () => {
    vi.setSystemTime(new Date("2026-06-29T22:00:00Z"));
    prismaMock.schoolComm.findMany.mockResolvedValue([{ serviceId: "s1" }]);
    const res = await GET(authed());
    const data = await res.json();
    expect(data.toEmail).toBe(1);
    expect(data.skipped).toBe(1);
    const callArg = prismaMock.aiTaskDraft.create.mock.calls[0][0];
    expect(callArg.data.content).toContain("Skipped (already booked for next term): Centre A");
  });

  it("idempotent — skipped when guard not acquired", async () => {
    vi.setSystemTime(new Date("2026-06-29T22:00:00Z"));
    vi.mocked(acquireCronLock).mockResolvedValueOnce({
      acquired: false,
      reason: "already complete",
      complete: async () => {},
      fail: async () => {},
    });
    const res = await GET(authed());
    const data = await res.json();
    expect(data.skipped).toBe(true);
  });

  it("skips when an existing draft for the period already exists", async () => {
    vi.setSystemTime(new Date("2026-06-29T22:00:00Z"));
    prismaMock.aiTaskDraft.findFirst.mockResolvedValue({ id: "existing" });
    const res = await GET(authed());
    const data = await res.json();
    expect(data.skipped).toBe(true);
    expect(data.reason).toBe("already_drafted_for_period");
  });

  it("falls back to '[contact name to confirm]' when newsletter editor is missing", async () => {
    vi.setSystemTime(new Date("2026-06-29T22:00:00Z"));
    prismaMock.centreAvatar.findMany.mockResolvedValue([
      {
        serviceId: "s1",
        snapshot: {},
        parentAvatar: {},
        programmeMix: {},
      },
    ]);
    const res = await GET(authed());
    expect(res.status).toBe(200);
    const callArg = prismaMock.aiTaskDraft.create.mock.calls[0][0];
    expect(callArg.data.content).toContain("[contact name to confirm]");
  });
});
