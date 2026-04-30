import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/service-scope", () => ({
  getServiceScope: vi.fn(() => null),
  getStateScope: vi.fn(() => null),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 }),
  ),
}));
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

import { _clearUserActiveCache } from "@/lib/server-auth";
import { POST as generatePost } from "@/app/api/services/[id]/newsletter/generate/route";
import { POST as publishPost } from "@/app/api/services/[id]/newsletter/publish/route";

async function ctx(id = "s1") {
  return { params: Promise.resolve({ id }) };
}

const originalFetch = global.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
  prismaMock.service.findUnique.mockResolvedValue({ id: "s1", name: "Cessnock" });
  prismaMock.programActivity.findMany.mockResolvedValue([]);
  prismaMock.menuWeek.findFirst.mockResolvedValue(null);
  prismaMock.serviceEvent.findMany.mockResolvedValue([]);
  prismaMock.learningObservation.findMany.mockResolvedValue([]);
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("Newsletter end-to-end flow", () => {
  it("generate → 401 if not authed", async () => {
    // Authentication failure path is covered by withApiAuth — just smoke-check
    // the wrapper is in place by mocking no session.
    const { mockNoSession } = await import("../helpers/auth-mock");
    mockNoSession();
    const res = await generatePost(
      createRequest("POST", "/api/services/s1/newsletter/generate", {
        body: {},
      }),
      await ctx(),
    );
    expect(res.status).toBe(401);
  });

  it("generate → 403 for staff (coord+ only)", async () => {
    mockSession({ id: "u1", name: "S", role: "staff", serviceId: "s1" });
    const res = await generatePost(
      createRequest("POST", "/api/services/s1/newsletter/generate", {
        body: {},
      }),
      await ctx(),
    );
    expect(res.status).toBe(403);
  });

  it("generate → calls /api/ai/generate with the right template + variables", async () => {
    mockSession({ id: "u1", name: "C", role: "member", serviceId: "s1" });

    // Stub the internal AI fetch — capture what got sent
    let capturedBody: Record<string, unknown> | null = null;
    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.endsWith("/api/ai/generate")) {
        capturedBody = JSON.parse((init?.body as string) ?? "{}");
        return new Response(
          JSON.stringify({
            text: "# Week of 22 Apr — 26 Apr\n\nA warm hello from Cessnock!",
            usage: { inputTokens: 200, outputTokens: 350 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      throw new Error("Unexpected fetch: " + urlStr);
    }) as typeof fetch;

    prismaMock.programActivity.findMany.mockResolvedValue([
      { title: "Lego play", day: "monday", description: "free build" },
      { title: "Cooking class", day: "wednesday", description: null },
    ]);
    prismaMock.serviceEvent.findMany.mockResolvedValue([
      {
        title: "Excursion to Zoo",
        date: new Date("2026-05-08"),
        eventType: "excursion",
      },
    ]);
    prismaMock.learningObservation.findMany.mockResolvedValue([
      { title: "Block tower", narrative: "Stacked 8 high" },
    ]);

    const res = await generatePost(
      createRequest("POST", "/api/services/s1/newsletter/generate", {
        body: {},
      }),
      await ctx(),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.draft).toContain("Cessnock");
    expect(body.usage.inputTokens).toBe(200);

    // The internal AI call should target the newsletter template
    expect(capturedBody).not.toBeNull();
    expect(capturedBody!.templateSlug).toBe("newsletter/weekly-draft");
    const vars = capturedBody!.variables as Record<string, string>;
    expect(vars.serviceName).toBe("Cessnock");
    expect(vars.programActivities).toContain("Lego play");
    expect(vars.programActivities).toContain("Cooking class");
    expect(vars.upcomingEvents).toContain("Zoo");
    expect(vars.topObservations).toContain("Block tower");
  });

  it("publish → creates a community ParentPost with type=newsletter", async () => {
    mockSession({ id: "u1", name: "C", role: "member", serviceId: "s1" });
    prismaMock.parentPost.create.mockResolvedValue({
      id: "post-1",
      type: "newsletter",
      isCommunity: true,
      title: "Week of 22 Apr",
      content: "warm hello…",
    });
    prismaMock.activityLog.create.mockResolvedValue({});

    const res = await publishPost(
      createRequest("POST", "/api/services/s1/newsletter/publish", {
        body: {
          title: "Week of 22 Apr",
          content: "# Hello\n\nA warm hello from Cessnock!",
          weekStart: "2026-04-22",
        },
      }),
      await ctx(),
    );

    expect(res.status).toBe(201);

    // Verify the create call shape — parents see this exact row
    expect(prismaMock.parentPost.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          serviceId: "s1",
          type: "newsletter",
          isCommunity: true,
          authorId: "u1",
          title: "Week of 22 Apr",
        }),
      }),
    );
  });

  it("publish → 400 with empty content (validates before write)", async () => {
    mockSession({ id: "u1", name: "C", role: "member", serviceId: "s1" });
    const res = await publishPost(
      createRequest("POST", "/api/services/s1/newsletter/publish", {
        body: { title: "Week of 22 Apr", content: "" },
      }),
      await ctx(),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.parentPost.create).not.toHaveBeenCalled();
  });

  it("publish → 403 for staff", async () => {
    mockSession({ id: "u1", name: "S", role: "staff", serviceId: "s1" });
    const res = await publishPost(
      createRequest("POST", "/api/services/s1/newsletter/publish", {
        body: { title: "x", content: "y" },
      }),
      await ctx(),
    );
    expect(res.status).toBe(403);
  });
});
