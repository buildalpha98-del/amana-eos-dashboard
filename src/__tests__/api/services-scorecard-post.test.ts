/**
 * Coverage for POST /api/services/[id]/scorecard — the service-scoped
 * measurable-create endpoint added after Bucket O Stage 2 to replace
 * the now-broken `/api/measurables` POST with `serviceId` body.
 *
 * The route auto-creates a per-service Scorecard (titled "Service
 * Scorecard — <name>") the first time someone creates a measurable
 * via the service-detail tab, and reuses it on subsequent calls.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60_000 }),
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

import { POST } from "@/app/api/services/[id]/scorecard/route";

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

const validBody = {
  title: "Weekly Enrolments",
  ownerId: "u-member",
  goalValue: 5,
  goalDirection: "above" as const,
  unit: "children",
  frequency: "weekly" as const,
};

beforeEach(() => {
  _clearUserActiveCache();
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
  prismaMock.activityLog.create.mockResolvedValue({} as never);
});

describe("POST /api/services/[id]/scorecard", () => {
  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const res = await POST(
      createRequest("POST", "/api/services/svc-1/scorecard", {
        body: validBody,
      }),
      ctx("svc-1"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when a member from another service tries to create", async () => {
    mockSession({
      id: "u-other",
      name: "Other",
      role: "member",
      serviceId: "svc-other",
    });
    const res = await POST(
      createRequest("POST", "/api/services/svc-1/scorecard", {
        body: validBody,
      }),
      ctx("svc-1"),
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 when body is missing required fields", async () => {
    mockSession({
      id: "u-admin",
      name: "Admin",
      role: "admin",
      serviceId: "svc-1",
    });
    const res = await POST(
      createRequest("POST", "/api/services/svc-1/scorecard", {
        body: { ownerId: "u-x" },
      }),
      ctx("svc-1"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when the service id does not exist", async () => {
    // Use head_office (org-wide role) so the service-access check
    // passes regardless of svc-missing not being assigned.
    mockSession({ id: "u-ho", name: "HO", role: "head_office" });
    prismaMock.service.findUnique.mockResolvedValue(null);
    const res = await POST(
      createRequest("POST", "/api/services/svc-missing/scorecard", {
        body: validBody,
      }),
      ctx("svc-missing"),
    );
    expect(res.status).toBe(404);
  });

  it("auto-creates the service scorecard on first POST and creates the measurable", async () => {
    mockSession({
      id: "u-admin",
      name: "Admin",
      role: "admin",
      serviceId: "svc-1",
    });
    prismaMock.service.findUnique.mockResolvedValue({
      id: "svc-1",
      name: "Beaumont Hills",
      managerId: null,
    });
    // No scorecard exists yet — the route should create one.
    prismaMock.scorecard.findFirst.mockResolvedValue(null);
    prismaMock.scorecard.create.mockResolvedValue({
      id: "sc-new",
      ownerId: "u-admin",
      // creator is the owner — no separate members row needed
      members: [],
    });
    // The caller is auto-listed as a scorecard participant via the
    // owner branch; the measurable owner must also be a participant.
    // For this test we make the measurable's owner the caller too.
    const measurableInput = { ...validBody, ownerId: "u-admin" };
    prismaMock.measurable.create.mockResolvedValue({
      id: "m-1",
      title: validBody.title,
      owner: { id: "u-admin", name: "Admin", email: "a@x", avatar: null },
    });

    const res = await POST(
      createRequest("POST", "/api/services/svc-1/scorecard", {
        body: measurableInput,
      }),
      ctx("svc-1"),
    );

    expect(res.status).toBe(201);
    expect(prismaMock.scorecard.create).toHaveBeenCalledTimes(1);
    const scorecardCreateArgs = prismaMock.scorecard.create.mock.calls[0][0];
    expect(scorecardCreateArgs.data.title).toBe(
      "Service Scorecard — Beaumont Hills",
    );
    // Without a managerId the creator owns the new scorecard.
    expect(scorecardCreateArgs.data.ownerId).toBe("u-admin");

    expect(prismaMock.measurable.create).toHaveBeenCalledTimes(1);
    const measurableCreateArgs = prismaMock.measurable.create.mock.calls[0][0];
    expect(measurableCreateArgs.data.serviceId).toBe("svc-1");
    expect(measurableCreateArgs.data.scorecardId).toBe("sc-new");
  });

  it("reuses an existing service scorecard rather than creating a new one", async () => {
    mockSession({
      id: "u-admin",
      name: "Admin",
      role: "admin",
      serviceId: "svc-1",
    });
    prismaMock.service.findUnique.mockResolvedValue({
      id: "svc-1",
      name: "Beaumont Hills",
      managerId: "u-manager",
    });
    // Existing scorecard owned by the manager; admin is not yet a member.
    prismaMock.scorecard.findFirst.mockResolvedValue({
      id: "sc-existing",
      ownerId: "u-manager",
      members: [],
    });
    prismaMock.scorecardMember.upsert.mockResolvedValue({
      scorecardId: "sc-existing",
      userId: "u-admin",
    });
    prismaMock.measurable.create.mockResolvedValue({
      id: "m-2",
      owner: {
        id: "u-manager",
        name: "Manager",
        email: "m@x",
        avatar: null,
      },
    });

    const res = await POST(
      createRequest("POST", "/api/services/svc-1/scorecard", {
        body: {
          ...validBody,
          // The manager is the measurable owner — they're the scorecard
          // owner so the participant check passes.
          ownerId: "u-manager",
        },
      }),
      ctx("svc-1"),
    );

    expect(res.status).toBe(201);
    expect(prismaMock.scorecard.create).not.toHaveBeenCalled();
    // The admin is now upserted as a member of the existing scorecard.
    expect(prismaMock.scorecardMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          scorecardId_userId: {
            scorecardId: "sc-existing",
            userId: "u-admin",
          },
        },
      }),
    );
  });

  it("rejects a measurable owner who is not a scorecard participant", async () => {
    mockSession({
      id: "u-admin",
      name: "Admin",
      role: "admin",
      serviceId: "svc-1",
    });
    prismaMock.service.findUnique.mockResolvedValue({
      id: "svc-1",
      name: "Beaumont Hills",
      managerId: "u-manager",
    });
    prismaMock.scorecard.findFirst.mockResolvedValue({
      id: "sc-existing",
      ownerId: "u-manager",
      members: [{ userId: "u-admin" }],
    });
    prismaMock.scorecardMember.upsert.mockResolvedValue({} as never);

    const res = await POST(
      createRequest("POST", "/api/services/svc-1/scorecard", {
        body: {
          ...validBody,
          // Random outsider — not the owner and not a member
          ownerId: "u-outsider",
        },
      }),
      ctx("svc-1"),
    );

    expect(res.status).toBe(400);
    expect(prismaMock.measurable.create).not.toHaveBeenCalled();
  });
});
