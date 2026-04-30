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
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  generateRequestId: () => "test-req-id",
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 })),
}));

import { PATCH } from "@/app/api/centre-avatars/[serviceId]/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

describe("PATCH /api/centre-avatars/[serviceId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.id === "m1")
        return { id: "m1", role: "marketing", active: true };
      if (args?.where?.id === "s1")
        return { id: "s1", role: "staff", active: true };
      return null;
    });
  });

  it("returns 403 when role is not marketing or owner", async () => {
    mockSession({ id: "s1", name: "Staff", role: "staff" });
    const ctx = { params: Promise.resolve({ serviceId: "svc1" }) };
    const res = await PATCH(
      createRequest("PATCH", "/api/centre-avatars/svc1", {
        body: { section: "snapshot", content: {} },
      }),
      ctx as any,
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 on unknown section key", async () => {
    mockSession({ id: "m1", name: "Akram", role: "marketing" });
    const ctx = { params: Promise.resolve({ serviceId: "svc1" }) };
    const res = await PATCH(
      createRequest("PATCH", "/api/centre-avatars/svc1", {
        body: { section: "notASection", content: {} },
      }),
      ctx as any,
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when Avatar missing", async () => {
    mockSession({ id: "m1", name: "Akram", role: "marketing" });
    prismaMock.centreAvatar.findUnique.mockResolvedValue(null);
    const ctx = { params: Promise.resolve({ serviceId: "missing" }) };
    const res = await PATCH(
      createRequest("PATCH", "/api/centre-avatars/missing", {
        body: { section: "snapshot", content: {} },
      }),
      ctx as any,
    );
    expect(res.status).toBe(404);
  });

  it("updates the section and creates an update-log row in one transaction", async () => {
    mockSession({ id: "m1", name: "Akram", role: "marketing" });
    prismaMock.centreAvatar.findUnique.mockResolvedValue({ id: "ca1" });
    prismaMock.centreAvatar.update.mockResolvedValue({});
    prismaMock.centreAvatarUpdateLog.create.mockResolvedValue({});

    const ctx = { params: Promise.resolve({ serviceId: "svc1" }) };
    const res = await PATCH(
      createRequest("PATCH", "/api/centre-avatars/svc1", {
        body: {
          section: "parentAvatar",
          content: {
            psychographics: { primaryWant: "safe, structured afternoons" },
          },
          changeSummary: "First pass at avatar",
        },
      }),
      ctx as any,
    );
    expect(res.status).toBe(200);
    expect(prismaMock.$transaction).toHaveBeenCalled();

    // Verify the expected writes were queued in the transaction
    const updateCalls = prismaMock.centreAvatar.update.mock.calls;
    expect(updateCalls.length).toBe(1);
    expect(updateCalls[0][0]).toMatchObject({
      where: { id: "ca1" },
      data: expect.objectContaining({
        parentAvatar: expect.objectContaining({
          psychographics: { primaryWant: "safe, structured afternoons" },
        }),
        lastUpdatedById: "m1",
      }),
    });

    const logCalls = prismaMock.centreAvatarUpdateLog.create.mock.calls;
    expect(logCalls.length).toBe(1);
    expect(logCalls[0][0]).toMatchObject({
      data: expect.objectContaining({
        centreAvatarId: "ca1",
        sectionsChanged: ["parentAvatar"],
        summary: "First pass at avatar",
        updatedById: "m1",
      }),
    });
  });
});
