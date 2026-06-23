import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Role } from "@prisma/client";
import { prismaMock } from "@/__tests__/helpers/prisma-mock";
import { mockSession, mockNoSession } from "@/__tests__/helpers/auth-mock";
import { createRequest } from "@/__tests__/helpers/request";

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(() => ({ limited: false })) }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  generateRequestId: () => "test-req-id",
}));

import { POST } from "@/app/api/issues/[id]/promote-to-rock/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

const ctx = { params: Promise.resolve({ id: "i1" }) };

function asRole(role: Role) {
  mockSession({ id: "u1", name: "U", role });
  prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role });
}

describe("POST /api/issues/[id]/promote-to-rock", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
  });

  it("401 when unauthenticated", async () => {
    mockNoSession();
    const res = await POST(createRequest("POST", "/api/issues/i1/promote-to-rock", { body: {} }), ctx);
    expect(res.status).toBe(401);
  });

  it("403 for an educator (staff)", async () => {
    asRole("staff");
    const res = await POST(createRequest("POST", "/api/issues/i1/promote-to-rock", { body: {} }), ctx);
    expect(res.status).toBe(403);
  });

  it("403 for the read-only eos_viewer", async () => {
    asRole("eos_viewer");
    const res = await POST(createRequest("POST", "/api/issues/i1/promote-to-rock", { body: {} }), ctx);
    expect(res.status).toBe(403);
  });

  it("404 when the issue does not exist", async () => {
    asRole("eos_implementer");
    prismaMock.issue.findUnique.mockResolvedValue(null);
    const res = await POST(createRequest("POST", "/api/issues/i1/promote-to-rock", { body: {} }), ctx);
    expect(res.status).toBe(404);
  });

  it("409 when the issue is already promoted", async () => {
    asRole("eos_implementer");
    prismaMock.issue.findUnique.mockResolvedValue({ id: "i1", rockId: "rock-existing", deleted: false });
    const res = await POST(createRequest("POST", "/api/issues/i1/promote-to-rock", { body: {} }), ctx);
    expect(res.status).toBe(409);
  });

  it("promotes: creates a Rock, closes + links the issue, returns 201", async () => {
    asRole("eos_implementer");
    prismaMock.issue.findUnique.mockResolvedValue({
      id: "i1",
      title: "New CRM rollout",
      description: "Replace the spreadsheet",
      ownerId: "owner1",
      serviceId: "svc1",
      rockId: null,
      deleted: false,
    });
    prismaMock.issue.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.rock.create.mockResolvedValue({ id: "rock1", title: "New CRM rollout", quarter: "Q3-2026", owner: null });
    prismaMock.issue.update.mockResolvedValue({ id: "i1", rockId: "rock1", rock: { id: "rock1", title: "New CRM rollout" } });
    prismaMock.activityLog.create.mockResolvedValue({});

    const res = await POST(
      createRequest("POST", "/api/issues/i1/promote-to-rock", { body: { quarter: "Q3-2026" } }),
      ctx,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.rock.id).toBe("rock1");

    // Guard targets only an un-promoted issue.
    const guardCall = prismaMock.issue.updateMany.mock.calls[0][0];
    expect(guardCall.where.rockId).toBeNull();
    expect(guardCall.data.status).toBe("closed");

    // Rock inherits the issue's fields; defaults to a company rock + current quarter.
    const rockCall = prismaMock.rock.create.mock.calls[0][0];
    expect(rockCall.data.title).toBe("New CRM rollout");
    expect(rockCall.data.serviceId).toBe("svc1");
    expect(rockCall.data.rockType).toBe("company");
    expect(rockCall.data.quarter).toBe("Q3-2026");

    // Issue is linked back to the new rock.
    const updateCall = prismaMock.issue.update.mock.calls[0][0];
    expect(updateCall.data.rockId).toBe("rock1");
  });

  it("409 when a concurrent promote already won (guard count 0)", async () => {
    asRole("admin");
    prismaMock.issue.findUnique.mockResolvedValue({ id: "i1", title: "T", description: null, ownerId: null, serviceId: null, rockId: null, deleted: false });
    prismaMock.issue.updateMany.mockResolvedValue({ count: 0 });

    const res = await POST(createRequest("POST", "/api/issues/i1/promote-to-rock", { body: {} }), ctx);
    expect(res.status).toBe(409);
    expect(prismaMock.rock.create).not.toHaveBeenCalled();
  });
});
