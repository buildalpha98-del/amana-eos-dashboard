import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
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
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 9, resetIn: 60000 }),
  ),
}));

// Mock the provider abstraction so tests don't hit a real model.
vi.mock("@/lib/ai-provider", () => ({
  generateStructured: vi.fn(),
  DEFAULT_PROVIDER_MODEL: {
    showcase: { provider: "anthropic", modelId: "claude-sonnet-4-5-20250514" },
  },
}));

import { generateStructured } from "@/lib/ai-provider";
import { POST } from "@/app/api/centre-avatars/[serviceId]/generate-parent-avatar/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

const mockedGenerate = vi.mocked(generateStructured);

function makeReq(serviceId: string) {
  return createRequest(
    "POST",
    `/api/centre-avatars/${serviceId}/generate-parent-avatar`,
  );
}

const ctx = (serviceId: string) =>
  ({ params: Promise.resolve({ serviceId }) }) as never;

describe("POST /api/centre-avatars/[serviceId]/generate-parent-avatar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockImplementation(async (args: { where?: { id?: string } } | undefined) => {
      if (args?.where?.id === "m1")
        return { id: "m1", role: "marketing", active: true };
      if (args?.where?.id === "s1")
        return { id: "s1", role: "staff", active: true };
      return null;
    });
  });

  it("returns 403 for non-marketing/owner roles", async () => {
    mockSession({ id: "s1", name: "Staff", role: "staff" });
    const res = await POST(makeReq("svc1"), ctx("svc1"));
    expect(res.status).toBe(403);
  });

  it("returns 404 when avatar doesn't exist for the service", async () => {
    mockSession({ id: "m1", name: "Akram", role: "marketing" });
    prismaMock.centreAvatar.findUnique.mockResolvedValue(null);
    const res = await POST(makeReq("missing"), ctx("missing"));
    expect(res.status).toBe(404);
  });

  it("returns 400 when snapshot is empty (nothing to draft from)", async () => {
    mockSession({ id: "m1", name: "Akram", role: "marketing" });
    prismaMock.centreAvatar.findUnique.mockResolvedValue({
      id: "ca1",
      snapshot: {},
    });

    const res = await POST(makeReq("svc1"), ctx("svc1"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/snapshot/i);
    expect(mockedGenerate).not.toHaveBeenCalled();
  });

  it("returns cached output without calling the provider on cache hit", async () => {
    mockSession({ id: "m1", name: "Akram", role: "marketing" });
    prismaMock.centreAvatar.findUnique.mockResolvedValue({
      id: "ca1",
      snapshot: { centreDetails: { officialName: "Greystanes" } },
    });
    const cachedOutput = {
      psychographics: { primaryConcern: "cached" },
    };
    prismaMock.aiGenerationCache.findUnique.mockResolvedValue({
      id: "cache-1",
      kind: "centre_avatar.parent_avatar",
      inputHash: "abc",
      output: cachedOutput,
      provider: "anthropic",
      modelId: "claude-sonnet-4-5-20250514",
      costUsd: 0.04,
      inputTokens: 0,
      outputTokens: 0,
      generatedById: "m1",
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    const res = await POST(makeReq("svc1"), ctx("svc1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cached).toBe(true);
    expect(body.avatar).toEqual(cachedOutput);
    expect(mockedGenerate).not.toHaveBeenCalled();
  });

  it("calls the provider on cache miss and persists the output", async () => {
    mockSession({ id: "m1", name: "Akram", role: "marketing" });
    prismaMock.centreAvatar.findUnique.mockResolvedValue({
      id: "ca1",
      snapshot: { centreDetails: { officialName: "Greystanes" } },
    });
    prismaMock.aiGenerationCache.findUnique.mockResolvedValue(null);
    prismaMock.aiGenerationCache.count.mockResolvedValue(0);
    prismaMock.aiGenerationCache.upsert.mockResolvedValue({});
    prismaMock.aiUsage.create.mockResolvedValue({});

    mockedGenerate.mockResolvedValue({
      data: { psychographics: { primaryConcern: "fresh draft" } },
      provider: "anthropic",
      modelId: "claude-sonnet-4-5-20250514",
      inputTokens: 1234,
      outputTokens: 567,
      costUsd: 0.012,
    });

    const res = await POST(makeReq("svc1"), ctx("svc1"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.cached).toBe(false);
    expect(body.provider).toBe("anthropic");
    expect(body.avatar.psychographics.primaryConcern).toBe("fresh draft");
    expect(mockedGenerate).toHaveBeenCalledTimes(1);
    expect(prismaMock.aiGenerationCache.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.aiUsage.create).toHaveBeenCalledTimes(1);
  });

  it("returns 429 when the user has hit the daily generation limit", async () => {
    mockSession({ id: "m1", name: "Akram", role: "marketing" });
    prismaMock.centreAvatar.findUnique.mockResolvedValue({
      id: "ca1",
      snapshot: { centreDetails: { officialName: "Greystanes" } },
    });
    prismaMock.aiGenerationCache.findUnique.mockResolvedValue(null);
    prismaMock.aiGenerationCache.count.mockResolvedValue(5); // hit the limit

    const res = await POST(makeReq("svc1"), ctx("svc1"));
    expect(res.status).toBe(429);
    expect(mockedGenerate).not.toHaveBeenCalled();
  });

  it("ignores expired cache entries and re-generates", async () => {
    mockSession({ id: "m1", name: "Akram", role: "marketing" });
    prismaMock.centreAvatar.findUnique.mockResolvedValue({
      id: "ca1",
      snapshot: { centreDetails: { officialName: "Greystanes" } },
    });
    // Expired cache entry
    prismaMock.aiGenerationCache.findUnique.mockResolvedValue({
      id: "old-cache",
      output: { psychographics: { primaryConcern: "old" } },
      provider: "anthropic",
      modelId: "claude-sonnet-4-5-20250514",
      expiresAt: new Date(Date.now() - 60_000), // expired 1 minute ago
      createdAt: new Date(Date.now() - 86_400_000),
      kind: "centre_avatar.parent_avatar",
      inputHash: "abc",
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      generatedById: "m1",
    });
    prismaMock.aiGenerationCache.count.mockResolvedValue(0);
    prismaMock.aiGenerationCache.upsert.mockResolvedValue({});
    prismaMock.aiUsage.create.mockResolvedValue({});

    mockedGenerate.mockResolvedValue({
      data: { psychographics: { primaryConcern: "regenerated" } },
      provider: "anthropic",
      modelId: "claude-sonnet-4-5-20250514",
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0.001,
    });

    const res = await POST(makeReq("svc1"), ctx("svc1"));
    const body = await res.json();
    expect(body.cached).toBe(false);
    expect(body.avatar.psychographics.primaryConcern).toBe("regenerated");
    expect(mockedGenerate).toHaveBeenCalledTimes(1);
  });
});
