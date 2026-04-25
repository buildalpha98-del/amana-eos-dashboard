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

import { GET } from "@/app/api/cron/tuesday-claude-prompter/route";
import { acquireCronLock } from "@/lib/cron-guard";

function authed() {
  return createRequest("GET", "/api/cron/tuesday-claude-prompter", {
    headers: { authorization: "Bearer test-secret" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "test-secret";
  vi.setSystemTime(new Date("2026-04-28T22:00:00Z"));

  prismaMock.service.findMany.mockResolvedValue([
    { id: "s1", name: "Centre A", code: "AAA" },
    { id: "s2", name: "Centre B", code: "BBB" },
  ]);
  prismaMock.centreAvatar.findUnique.mockResolvedValue({
    id: "av-1",
    snapshot: {
      centreDetails: { officialName: "Centre A", schoolName: "Anywhere Public" },
      schoolContacts: { newsletterEditor: { name: "Jane" } },
      parentDrivers: [{ label: "homework support", evidence: "WhatsApp parents asked twice" }],
      programmeFocus: "literacy",
    },
    parentAvatar: { demographics: { ageRange: "30-45", familyStructure: "dual-income", income: "$120k+" }, psychographics: { primaryWant: "support" } },
    programmeMix: { whatsWorking: "Quran club" },
    assetLibrary: {},
  });
  prismaMock.user.findFirst.mockResolvedValue({ id: "akram-1" });
  prismaMock.aiTaskDraft.findFirst.mockResolvedValue(null);
  prismaMock.aiTaskDraft.create.mockResolvedValue({ id: "draft-1" });
  prismaMock.centreAvatarInsight.findMany.mockResolvedValue([]);
  prismaMock.schoolComm.count.mockResolvedValue(0);
  prismaMock.centreAvatarSchoolLiaisonLog.findFirst.mockResolvedValue(null);
  prismaMock.campaignActivationAssignment.findMany.mockResolvedValue([]);
});

afterAll(() => {
  vi.useRealTimers();
});

describe("GET /api/cron/tuesday-claude-prompter", () => {
  it("401 when CRON_SECRET wrong", async () => {
    const res = await GET(
      createRequest("GET", "/api/cron/tuesday-claude-prompter", {
        headers: { authorization: "Bearer wrong" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("idempotent — skipped when guard not acquired", async () => {
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

  it("creates one bundled prompt draft for Akram", async () => {
    const res = await GET(authed());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.draftId).toBe("draft-1");
    expect(data.focus.serviceName).toBeTruthy();
    expect(prismaMock.aiTaskDraft.create).toHaveBeenCalledTimes(1);

    const callArg = prismaMock.aiTaskDraft.create.mock.calls[0][0];
    expect(callArg.data.source).toBe("tuesday-prompter");
    expect(callArg.data.taskType).toBe("research");
    expect(callArg.data.title).toMatch(/Tuesday ideation/);
    expect(callArg.data.content).toContain("Prompt 1");
    expect(callArg.data.content).toContain("Prompt 2");
    expect(callArg.data.content).toContain("Prompt 3");
    expect(callArg.data.content).toContain("Prompt 4");
  });

  it("falls back to '[not yet recorded]' when avatar fields are empty", async () => {
    prismaMock.centreAvatar.findUnique.mockResolvedValue({
      id: "av-1",
      snapshot: {},
      parentAvatar: {},
      programmeMix: {},
      assetLibrary: {},
    });
    const res = await GET(authed());
    expect(res.status).toBe(200);
    const callArg = prismaMock.aiTaskDraft.create.mock.calls[0][0];
    expect(callArg.data.content).toContain("[not yet recorded]");
  });

  it("skips when focus service has no avatar", async () => {
    prismaMock.centreAvatar.findUnique.mockResolvedValue(null);
    const res = await GET(authed());
    const data = await res.json();
    expect(data.skipped).toBe(true);
    expect(data.reason).toBe("no avatar for focus service");
    expect(prismaMock.aiTaskDraft.create).not.toHaveBeenCalled();
  });

  it("skips when no active services", async () => {
    prismaMock.service.findMany.mockResolvedValue([]);
    const res = await GET(authed());
    const data = await res.json();
    expect(data.skipped).toBe(true);
    expect(data.reason).toBe("no active services");
  });

  it("skips when an existing draft for the week already exists", async () => {
    prismaMock.aiTaskDraft.findFirst.mockResolvedValue({ id: "existing" });
    const res = await GET(authed());
    const data = await res.json();
    expect(data.skipped).toBe(true);
    expect(prismaMock.aiTaskDraft.create).not.toHaveBeenCalled();
  });

  it("skips when no marketing user exists", async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    const res = await GET(authed());
    const data = await res.json();
    expect(data.skipped).toBe(true);
    expect(data.reason).toBe("no marketing user");
  });
});
